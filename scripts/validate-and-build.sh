#!/usr/bin/env bash
# PageMint: release preflight validation + extension build.
#
# Validates the real repo preflight contract for release work, then
# produces an extension build at apps/extension/.output/chrome-mv3.
# Self-heals bootstrap-only gaps (missing node_modules, missing Playwright
# Chromium, stale icons/tiles, corepack not activated). Fails loud on
# anything unrecoverable or anything that would diverge from the repo's
# production verification contract.
#
# Exit codes:
#   0  everything green, build produced at apps/extension/.output/chrome-mv3
#   1  validation failed (unrecoverable)
#   2  self-heal failed
#   3  build failed
#
# Flags:
#   --skip-build    run full preflight validation + heal only, skip final extension build
#   --no-heal       fail instead of auto-fixing recoverable issues
#   --verbose       echo every command (set -x)
#
# Examples:
#   ./scripts/validate-and-build.sh
#   ./scripts/validate-and-build.sh --no-heal
#   ./scripts/validate-and-build.sh --skip-build --verbose

set -Eeuo pipefail
IFS=$'\n\t'

# -------- repo root --------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# -------- flags --------
SKIP_BUILD=0
NO_HEAL=0
VERBOSE=0
for arg in "$@"; do
  case "${arg}" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-heal)    NO_HEAL=1 ;;
    --verbose)    VERBOSE=1 ;;
    -h|--help)
      sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      printf 'Unknown flag: %s\n' "${arg}" >&2
      exit 1 ;;
  esac
done
[[ "${VERBOSE}" -eq 1 ]] && set -x

# -------- pretty output --------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_BOLD=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_DIM=''
fi

PASS_COUNT=0
WARN_COUNT=0
HEAL_COUNT=0
FAIL_COUNT=0
FAIL_MESSAGES=()

log_section() { printf '\n%s== %s ==%s\n' "${C_BOLD}${C_BLUE}" "$1" "${C_RESET}"; }
log_pass()    { printf '  %s✓%s %s\n' "${C_GREEN}" "${C_RESET}" "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_warn()    { printf '  %s!%s %s\n' "${C_YELLOW}" "${C_RESET}" "$1"; WARN_COUNT=$((WARN_COUNT + 1)); }
log_heal()    { printf '  %s⟲%s %s\n' "${C_BLUE}" "${C_RESET}" "$1"; HEAL_COUNT=$((HEAL_COUNT + 1)); }
log_fail()    { printf '  %s✗%s %s\n' "${C_RED}" "${C_RESET}" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); FAIL_MESSAGES+=("$1"); }
log_info()    { printf '  %s·%s %s\n' "${C_DIM}" "${C_RESET}" "$1"; }

# -------- error trap --------
cleanup() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 && ${exit_code} -ne 1 && ${exit_code} -ne 2 && ${exit_code} -ne 3 ]]; then
    printf '\n%s✗ unexpected failure (exit %d)%s\n' "${C_RED}${C_BOLD}" "${exit_code}" "${C_RESET}" >&2
    printf '  at line %d: %s\n' "${BASH_LINENO[0]:-?}" "${BASH_COMMAND:-?}" >&2
  fi
  return ${exit_code}
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# -------- helpers --------
have() { command -v "$1" >/dev/null 2>&1; }
ver_ge() {
  # ver_ge A B  →  true if A >= B (semver-ish, major.minor.patch)
  [[ "$1" = "$2" ]] && return 0
  local lhs rhs
  lhs="$(printf '%s' "$1" | awk -F'[.+-]' '{printf "%d.%d.%d", $1+0, $2+0, $3+0}')"
  rhs="$(printf '%s' "$2" | awk -F'[.+-]' '{printf "%d.%d.%d", $1+0, $2+0, $3+0}')"
  printf '%s\n%s\n' "${rhs}" "${lhs}" | sort -V -c >/dev/null 2>&1
}

can_heal() { [[ "${NO_HEAL}" -eq 0 ]]; }

pnpm_install_self_heal() {
  local log_file="$1"
  CI=1 pnpm install --frozen-lockfile --force --reporter=append-only >"${log_file}" 2>&1
}

write_log_header() {
  local log_file="$1" label="$2" command="$3"
  {
    printf 'PageMint %s\n' "${label}"
    printf 'Started: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf 'Working directory: %s\n' "${REPO_ROOT}"
    printf 'Command: %s\n\n' "${command}"
  } >"${log_file}"
}

print_log_failure_excerpt() {
  local log_file="$1"

  if [[ ! -s "${log_file}" ]]; then
    printf '\n%sno log output captured at %s%s\n' "${C_YELLOW}" "${log_file}" "${C_RESET}" >&2
    return
  fi

  local excerpt
  excerpt="$(
    grep -E "^(not ok|# Subtest:|[[:space:]]+(error|expected|actual|code):|.*(ERR_|ELIFECYCLE|Command failed|Cannot find module|Missing required environment variable|Expected values|error TS[0-9]+:))" "${log_file}" \
      | tail -n 60 \
      || true
  )"

  if [[ -n "${excerpt}" ]]; then
    printf '\n%sfailure excerpt from %s:%s\n' "${C_YELLOW}${C_BOLD}" "${log_file}" "${C_RESET}" >&2
    printf '%s\n' "${excerpt}" | sed 's/^/  /' >&2
    return
  fi

  printf '\n%slast 60 log lines from %s:%s\n' "${C_YELLOW}${C_BOLD}" "${log_file}" "${C_RESET}" >&2
  tail -n 60 "${log_file}" | sed 's/^/  /' >&2
}

# ============================================================
# 1. Host toolchain
# ============================================================
log_section "Host toolchain"

# bash — already running one, but warn if ancient
BASH_VER="${BASH_VERSION%%[^0-9.]*}"
if ver_ge "${BASH_VER}" "3.2.0"; then
  log_pass "bash ${BASH_VER}"
else
  log_fail "bash ${BASH_VER} too old (need >= 3.2)"
fi

# git
if have git; then
  log_pass "git $(git --version | awk '{print $3}')"
else
  log_fail "git not on PATH"
fi

# node
MIN_NODE="22.0.0"
if have node; then
  NODE_VER="$(node --version | sed 's/^v//')"
  if ver_ge "${NODE_VER}" "${MIN_NODE}"; then
    log_pass "node ${NODE_VER}"
  else
    log_fail "node ${NODE_VER} too old (need >= ${MIN_NODE}); install via fnm/nvm/volta"
  fi
else
  log_fail "node not on PATH"
fi

# corepack (ships with modern node)
if have corepack; then
  log_pass "corepack $(corepack --version 2>/dev/null || echo '?')"
else
  log_warn "corepack missing — pnpm version pinning via packageManager may not work"
fi

# pnpm — expected version from package.json .packageManager
EXPECTED_PNPM=""
if have jq; then
  EXPECTED_PNPM="$(jq -r '.packageManager // empty' package.json | sed 's/^pnpm@//')"
fi
if have pnpm; then
  PNPM_VER="$(pnpm --version 2>/dev/null || echo '0.0.0')"
  if [[ -n "${EXPECTED_PNPM}" && "${PNPM_VER}" != "${EXPECTED_PNPM}" ]]; then
    log_warn "pnpm ${PNPM_VER} present, package.json pins ${EXPECTED_PNPM}"
    if can_heal && have corepack; then
      if corepack prepare "pnpm@${EXPECTED_PNPM}" --activate >/dev/null 2>&1; then
        log_heal "corepack activated pnpm@${EXPECTED_PNPM}"
      else
        log_warn "corepack could not activate pnpm@${EXPECTED_PNPM} (keeping ${PNPM_VER})"
      fi
    fi
  else
    log_pass "pnpm ${PNPM_VER}"
  fi
else
  if can_heal && have corepack && [[ -n "${EXPECTED_PNPM}" ]]; then
    if corepack prepare "pnpm@${EXPECTED_PNPM}" --activate >/dev/null 2>&1; then
      log_heal "installed pnpm@${EXPECTED_PNPM} via corepack"
    else
      log_fail "pnpm missing and corepack activation failed"
    fi
  else
    log_fail "pnpm not on PATH"
  fi
fi

# jq — optional but useful
if have jq; then
  log_pass "jq $(jq --version | sed 's/^jq-//')"
else
  log_warn "jq not installed — some checks will be skipped"
fi

# ============================================================
# 2. Repo structure + configs
# ============================================================
log_section "Repo structure"

expect_file() {
  local path="$1" label="${2:-$1}"
  if [[ -f "${path}" ]]; then
    log_pass "${label}"
  else
    log_fail "missing: ${path}"
  fi
}
expect_dir() {
  local path="$1" label="${2:-$1}"
  if [[ -d "${path}" ]]; then
    log_pass "${label}"
  else
    log_fail "missing dir: ${path}"
  fi
}

expect_file "package.json"
expect_file "pnpm-workspace.yaml"
expect_file "pnpm-lock.yaml" "pnpm-lock.yaml (lockfile)"
expect_file "turbo.json"
expect_file "tsconfig.base.json"

expect_dir "apps/extension" "apps/extension/"
expect_dir "apps/site" "apps/site/"
expect_dir "packages/render-core" "packages/render-core/"
expect_dir "packages/shared-types" "packages/shared-types/"

expect_file "apps/extension/wxt.config.ts"
expect_file "apps/extension/package.json"
expect_file "apps/extension/src/styles/tokens.css" "tokens.css"
expect_file "apps/extension/src/entrypoints/popup/popup.css"
expect_file "apps/extension/src/entrypoints/options/options.css"
expect_file "apps/extension/src/entrypoints/popup/main.tsx"
expect_file "apps/extension/src/entrypoints/options/main.tsx"

# Brand SVGs — inputs for icon + tile generators
for svg in paper-1024.svg ink-1024.svg mono-1024.svg night-1024.svg; do
  expect_file "apps/extension/icons/brand/${svg}" "brand/${svg}"
done

# ============================================================
# 4. Workspace install state
# ============================================================
log_section "Workspace install state"

node_modules_ok() {
  [[ -d "node_modules" ]] \
    && [[ -d "node_modules/.pnpm" ]] \
    && [[ -d "node_modules/turbo" ]] \
    && [[ -d "node_modules/@playwright/test" ]] \
    && [[ -d "apps/extension/node_modules" ]]
}

fontsource_ok() {
  # pnpm puts direct deps under the consuming workspace's node_modules
  [[ -d "apps/extension/node_modules/@fontsource-variable/fraunces" ]] \
    && [[ -d "apps/extension/node_modules/@fontsource/ibm-plex-sans" ]] \
    && [[ -d "apps/extension/node_modules/@fontsource/ibm-plex-mono" ]]
}

if node_modules_ok && fontsource_ok; then
  log_pass "node_modules present and fontsource packages resolvable"
else
  if node_modules_ok; then
    log_warn "node_modules present but fontsource packages missing (lockfile likely drifted)"
  else
    log_warn "node_modules missing or incomplete"
  fi

  if can_heal && have pnpm; then
    log_info "running: pnpm install --frozen-lockfile --force"
    if pnpm_install_self_heal /tmp/pagemint-pnpm-install.log; then
      if node_modules_ok && fontsource_ok; then
        log_heal "pnpm install --frozen-lockfile --force completed"
      else
        log_fail "pnpm install completed but required workspace dependencies are still unresolved — see /tmp/pagemint-pnpm-install.log"
      fi
    else
      log_fail "pnpm install --frozen-lockfile --force failed — see /tmp/pagemint-pnpm-install.log"
    fi
  else
    log_fail "node_modules broken and auto-heal disabled or pnpm missing"
  fi
fi

# Lockfile freshness — release-blocking
if have pnpm && node_modules_ok; then
  if pnpm install --frozen-lockfile --offline --prefer-offline --reporter=silent >/dev/null 2>&1; then
    log_pass "lockfile in sync with package.json"
  else
    log_fail "lockfile not installable with --frozen-lockfile; resolve lockfile drift before release"
  fi
fi

# ============================================================
# 5. Browser boundary prerequisites
# ============================================================
log_section "Browser boundary prerequisites"

playwright_chromium_ok() {
  pnpm exec node --input-type=module -e \
    "import fs from 'node:fs'; import { chromium } from '@playwright/test'; const executablePath = chromium.executablePath(); process.exit(executablePath && fs.existsSync(executablePath) ? 0 : 1)" \
    >/dev/null 2>&1
}

if have pnpm; then
  if playwright_chromium_ok; then
    log_pass "Playwright Chromium installed"
  else
    log_warn "Playwright Chromium missing"
    if can_heal; then
      log_info "running: pnpm run test:browser:install"
      if pnpm run test:browser:install >/tmp/pagemint-playwright-install.log 2>&1; then
        if playwright_chromium_ok; then
          log_heal "Playwright Chromium installed"
        else
          log_fail "Playwright Chromium install reported success but browser is still unavailable"
        fi
      else
        log_fail "Playwright Chromium install failed — see /tmp/pagemint-playwright-install.log"
      fi
    else
      log_fail "Playwright Chromium missing and auto-heal disabled"
    fi
  fi
else
  log_warn "pnpm missing — skipped Playwright Chromium check"
fi

# ============================================================
# 6. Brand assets (icons + Web Store tiles)
# ============================================================
log_section "Brand assets"

ICON_SIZES=(16 32 48 128)
ICONS_MISSING=0
for sz in "${ICON_SIZES[@]}"; do
  if [[ ! -f "apps/extension/public/icon/${sz}.png" ]]; then
    ICONS_MISSING=1
    break
  fi
done

if [[ "${ICONS_MISSING}" -eq 0 ]]; then
  log_pass "extension icons (16/32/48/128) present"
else
  log_warn "extension icons missing"
  if can_heal && have pnpm; then
    log_info "running: pnpm --filter @pagemint/extension icons"
    if pnpm --filter @pagemint/extension icons >/tmp/pagemint-icons.log 2>&1; then
      log_heal "icons regenerated"
    else
      log_fail "icon generation failed — see /tmp/pagemint-icons.log"
    fi
  else
    log_fail "icons missing and auto-heal disabled"
  fi
fi

TILES_OK=1
for tile in hero-1280x800.png small-440x280.png; do
  if [[ ! -f "apps/extension/store-assets/${tile}" ]]; then
    TILES_OK=0
  fi
done

if [[ "${TILES_OK}" -eq 1 ]]; then
  log_pass "Web Store tiles present (hero + small)"
else
  log_warn "Web Store tiles missing"
  if can_heal && have pnpm; then
    log_info "running: pnpm --filter @pagemint/extension tiles"
    if pnpm --filter @pagemint/extension tiles >/tmp/pagemint-tiles.log 2>&1; then
      log_heal "tiles regenerated"
    else
      log_fail "tile generation failed — see /tmp/pagemint-tiles.log"
    fi
  else
    log_fail "tiles missing and auto-heal disabled"
  fi
fi

# ============================================================
# 7. Release preflight verification
# ============================================================
log_section "Release preflight verification"

if have pnpm; then
  PREFLIGHT_LOG="/tmp/pagemint-preflight.log"
  if [[ "${SKIP_BUILD}" -eq 1 ]]; then
    PREFLIGHT_SCRIPT="repo:verify:prebuild"
  else
    PREFLIGHT_SCRIPT="repo:verify"
  fi

  write_log_header "${PREFLIGHT_LOG}" "release preflight" "pnpm run ${PREFLIGHT_SCRIPT}"
  log_info "running: pnpm run ${PREFLIGHT_SCRIPT}"
  if pnpm run "${PREFLIGHT_SCRIPT}" >>"${PREFLIGHT_LOG}" 2>&1; then
    log_pass "repo preflight verification clean"
  else
    print_log_failure_excerpt "${PREFLIGHT_LOG}"
    log_fail "repo preflight verification failed — see ${PREFLIGHT_LOG}"
  fi
else
  log_warn "pnpm missing — skipped preflight verification"
fi

# ============================================================
# 9. Gate: abort build if validation failed
# ============================================================
printf '\n%s── summary ──%s\n' "${C_BOLD}" "${C_RESET}"
printf '  pass:  %s%d%s\n' "${C_GREEN}" "${PASS_COUNT}" "${C_RESET}"
printf '  warn:  %s%d%s\n' "${C_YELLOW}" "${WARN_COUNT}" "${C_RESET}"
printf '  heal:  %s%d%s\n' "${C_BLUE}" "${HEAL_COUNT}" "${C_RESET}"
printf '  fail:  %s%d%s\n' "${C_RED}" "${FAIL_COUNT}" "${C_RESET}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  printf '\n%svalidation failed. blocking issues:%s\n' "${C_RED}${C_BOLD}" "${C_RESET}" >&2
  for msg in "${FAIL_MESSAGES[@]}"; do
    printf '  - %s\n' "${msg}" >&2
  done
  if [[ "${NO_HEAL}" -eq 1 ]]; then
    printf '\n%shint: re-run without --no-heal to auto-fix recoverable items.%s\n' "${C_DIM}" "${C_RESET}" >&2
  fi
  exit 1
fi

if [[ "${SKIP_BUILD}" -eq 1 ]]; then
  printf '\n%s✓ validation clean. --skip-build set, exiting.%s\n' "${C_GREEN}${C_BOLD}" "${C_RESET}"
  exit 0
fi

# ============================================================
# 10. Build artifact
# ============================================================
log_section "Build artifact"
OUT_DIR="apps/extension/.output/chrome-mv3"
REQUIRED_EXTENSION_ARTIFACTS=(
  "manifest.json"
  "background.js"
  "popup.html"
  "selection-mode-runtime.js"
  "remove-elements-runtime.js"
)

log_info "refreshing unpacked extension artifact: ${OUT_DIR}"
rm -rf "${OUT_DIR}"
if pnpm --filter @pagemint/extension... build >/tmp/pagemint-extension-build.log 2>&1; then
  log_pass "extension artifact rebuilt"
else
  printf '\n%s✗ extension build failed%s — see /tmp/pagemint-extension-build.log\n' "${C_RED}${C_BOLD}" "${C_RESET}" >&2
  exit 3
fi

if [[ ! -d "${OUT_DIR}" ]]; then
  printf '\n%s✗ expected build output missing at %s%s\n' "${C_RED}${C_BOLD}" "${OUT_DIR}" "${C_RESET}" >&2
  exit 3
fi

for artifact in "${REQUIRED_EXTENSION_ARTIFACTS[@]}"; do
  if [[ ! -s "${OUT_DIR}/${artifact}" ]]; then
    printf '\n%s✗ expected extension artifact missing or empty: %s/%s%s\n' "${C_RED}${C_BOLD}" "${OUT_DIR}" "${artifact}" "${C_RESET}" >&2
    exit 3
  fi
done

SIZE="$(du -sh "${OUT_DIR}" 2>/dev/null | awk '{print $1}')"
printf '\n%s✓ build succeeded%s  (%s, %s)\n' "${C_GREEN}${C_BOLD}" "${C_RESET}" "${OUT_DIR}" "${SIZE}"
exit 0
