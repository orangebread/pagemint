#!/usr/bin/env bash
# PageMint: spin up the marketing site (apps/site).
#
# Validates host tools and workspace install state for the site workspace,
# self-heals missing deps and recoverable port conflicts, then runs Next.js.
#
# Exit codes:
#   0  normal exit (server stopped cleanly, or --build/--check finished)
#   1  validation failed (unrecoverable)
#   2  self-heal failed
#   3  server/build failed
#  130 interrupted (Ctrl+C)
#
# Modes (mutually exclusive, default = dev):
#   (default)       next dev — foreground, hot reload
#   --build         next build — production bundle only, exits after
#   --prod          next build && next start — production server
#   --check         validate only, no server
#
# Flags:
#   --port N        bind to port N (default 3000; explicit port disables auto-switch)
#   --host HOST     bind to host (default 127.0.0.1; use 0.0.0.0 for LAN)
#   --background    detach; log to /tmp/pagemint-site.log, write PID to /tmp/pagemint-site.pid
#   --no-heal       fail instead of auto-fixing recoverable issues
#   --verbose       echo every command (set -x)
#   -h, --help      this text
#
# Examples:
#   ./scripts/dev-site.sh
#   ./scripts/dev-site.sh --port 4000
#   ./scripts/dev-site.sh --background
#   ./scripts/dev-site.sh --prod --host 0.0.0.0
#   ./scripts/dev-site.sh --check

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# -------- flags --------
MODE="dev"
PORT="3000"
PORT_WAS_EXPLICIT=0
HOST="127.0.0.1"
BACKGROUND=0
NO_HEAL=0
VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)      MODE="build"; shift ;;
    --prod)       MODE="prod"; shift ;;
    --check)      MODE="check"; shift ;;
    --port)       PORT="$2"; PORT_WAS_EXPLICIT=1; shift 2 ;;
    --host)       HOST="$2"; shift 2 ;;
    --background) BACKGROUND=1; shift ;;
    --no-heal)    NO_HEAL=1; shift ;;
    --verbose)    VERBOSE=1; shift ;;
    -h|--help)
      sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      printf 'Unknown flag: %s\n' "$1" >&2
      exit 1 ;;
  esac
done
[[ "${VERBOSE}" -eq 1 ]] && set -x

# -------- pretty --------
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'
else
  C_RESET=''; C_BOLD=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_DIM=''
fi

PASS_COUNT=0; WARN_COUNT=0; HEAL_COUNT=0; FAIL_COUNT=0
FAIL_MESSAGES=()

log_section() { printf '\n%s== %s ==%s\n' "${C_BOLD}${C_BLUE}" "$1" "${C_RESET}"; }
log_pass()    { printf '  %s✓%s %s\n' "${C_GREEN}" "${C_RESET}" "$1"; PASS_COUNT=$((PASS_COUNT + 1)); }
log_warn()    { printf '  %s!%s %s\n' "${C_YELLOW}" "${C_RESET}" "$1"; WARN_COUNT=$((WARN_COUNT + 1)); }
log_heal()    { printf '  %s⟲%s %s\n' "${C_BLUE}" "${C_RESET}" "$1"; HEAL_COUNT=$((HEAL_COUNT + 1)); }
log_fail()    { printf '  %s✗%s %s\n' "${C_RED}" "${C_RESET}" "$1"; FAIL_COUNT=$((FAIL_COUNT + 1)); FAIL_MESSAGES+=("$1"); }
log_info()    { printf '  %s·%s %s\n' "${C_DIM}" "${C_RESET}" "$1"; }

cleanup() {
  local exit_code=$?
  if [[ ${exit_code} -ne 0 && ${exit_code} -ne 1 && ${exit_code} -ne 2 && ${exit_code} -ne 3 && ${exit_code} -ne 130 ]]; then
    printf '\n%s✗ unexpected failure (exit %d)%s\n' "${C_RED}${C_BOLD}" "${exit_code}" "${C_RESET}" >&2
    printf '  at line %d: %s\n' "${BASH_LINENO[0]:-?}" "${BASH_COMMAND:-?}" >&2
  fi
  return ${exit_code}
}
trap cleanup EXIT
trap 'exit 130' INT TERM

have() { command -v "$1" >/dev/null 2>&1; }
ver_ge() {
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

# Port check: returns 0 if bound, 1 if free.
port_in_use() {
  local port="$1"
  if have lsof; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -P -n >/dev/null 2>&1
  elif have nc; then
    nc -z -w1 127.0.0.1 "${port}" >/dev/null 2>&1
  else
    return 1  # can't tell, assume free
  fi
}

port_owner() {
  local port="$1"
  if have lsof; then
    lsof -iTCP:"${port}" -sTCP:LISTEN -P -n 2>/dev/null \
      | awk 'NR>1 {print $1"("$2")"}' | paste -sd, -
  else
    echo "unknown"
  fi
}

find_available_port() {
  local start_port="$1"
  local max_offset="${2:-20}"
  local candidate

  for (( candidate = start_port + 1; candidate <= start_port + max_offset; candidate++ )); do
    if ! port_in_use "${candidate}"; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

server_ready() {
  if have curl; then
    curl -fsS --max-time 2 "${URL}" >/dev/null 2>&1
  else
    port_in_use "${PORT}"
  fi
}

# ============================================================
# 1. Host toolchain
# ============================================================
log_section "Host toolchain"

BASH_VER="${BASH_VERSION%%[^0-9.]*}"
if ver_ge "${BASH_VER}" "3.2.0"; then
  log_pass "bash ${BASH_VER}"
else
  log_fail "bash ${BASH_VER} too old (need >= 3.2)"
fi

MIN_NODE="20.0.0"
if have node; then
  NODE_VER="$(node --version | sed 's/^v//')"
  if ver_ge "${NODE_VER}" "${MIN_NODE}"; then
    log_pass "node ${NODE_VER}"
  else
    log_fail "node ${NODE_VER} too old (need >= ${MIN_NODE} for Next.js 15)"
  fi
else
  log_fail "node not on PATH"
fi

EXPECTED_PNPM=""
if have jq; then
  EXPECTED_PNPM="$(jq -r '.packageManager // empty' package.json | sed 's/^pnpm@//')"
fi
if have pnpm; then
  PNPM_VER="$(pnpm --version 2>/dev/null || echo '0.0.0')"
  if [[ -n "${EXPECTED_PNPM}" && "${PNPM_VER}" != "${EXPECTED_PNPM}" ]]; then
    log_warn "pnpm ${PNPM_VER} present, pinned ${EXPECTED_PNPM}"
    if can_heal && have corepack; then
      if corepack prepare "pnpm@${EXPECTED_PNPM}" --activate >/dev/null 2>&1; then
        log_heal "corepack activated pnpm@${EXPECTED_PNPM}"
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

# ============================================================
# 2. Site workspace structure
# ============================================================
log_section "Site workspace"

expect_file() {
  local path="$1" label="${2:-$1}"
  if [[ -f "${path}" ]]; then log_pass "${label}"; else log_fail "missing: ${path}"; fi
}

expect_file "apps/site/package.json"
expect_file "apps/site/tsconfig.json"
expect_file "apps/site/app/layout.tsx" "app/layout.tsx"
expect_file "apps/site/app/page.tsx" "app/page.tsx"
expect_file "apps/site/app/globals.css" "app/globals.css"
expect_file "apps/site/app/trust/page.tsx" "app/trust/page.tsx"

# ============================================================
# 3. Install state for the site workspace
# ============================================================
log_section "Install state"

site_deps_ok() {
  [[ -d "apps/site/node_modules" ]] \
    && [[ -d "apps/site/node_modules/next" ]] \
    && [[ -d "apps/site/node_modules/react" ]] \
    && [[ -d "apps/site/node_modules/react-dom" ]]
}

if site_deps_ok; then
  log_pass "apps/site/node_modules: next, react, react-dom present"
else
  log_warn "site deps missing or incomplete"
  if can_heal && have pnpm; then
    log_info "running: pnpm install --frozen-lockfile --force"
    if pnpm_install_self_heal /tmp/pagemint-site-install.log; then
      if site_deps_ok; then
        log_heal "pnpm install --frozen-lockfile --force completed"
      else
        log_fail "pnpm install completed but site dependencies are still unresolved — see /tmp/pagemint-site-install.log"
      fi
    else
      log_fail "pnpm install --frozen-lockfile --force failed — see /tmp/pagemint-site-install.log"
    fi
  else
    log_fail "site deps broken and auto-heal disabled or pnpm missing"
  fi
fi

# ============================================================
# 4. Port availability (skip for --build / --check)
# ============================================================
if [[ "${MODE}" = "dev" || "${MODE}" = "prod" ]]; then
  log_section "Port availability"
  if port_in_use "${PORT}"; then
    OWNER="$(port_owner "${PORT}")"
    if can_heal && [[ "${PORT_WAS_EXPLICIT}" -eq 0 ]]; then
      if NEXT_PORT="$(find_available_port "${PORT}" 20)"; then
        log_heal "port ${PORT} busy with ${OWNER}; switching to ${NEXT_PORT}"
        PORT="${NEXT_PORT}"
        log_pass "port ${PORT} free on ${HOST}"
      else
        log_fail "port ${PORT} in use by ${OWNER}; no free fallback port found in ${PORT}-$((${PORT} + 20))"
      fi
    else
      log_fail "port ${PORT} in use by ${OWNER} (pass --port N to change)"
    fi
  else
    log_pass "port ${PORT} free on ${HOST}"
  fi
fi

# ============================================================
# 5. Gate
# ============================================================
printf '\n%s── summary ──%s\n' "${C_BOLD}" "${C_RESET}"
printf '  pass:  %s%d%s\n' "${C_GREEN}" "${PASS_COUNT}" "${C_RESET}"
printf '  warn:  %s%d%s\n' "${C_YELLOW}" "${WARN_COUNT}" "${C_RESET}"
printf '  heal:  %s%d%s\n' "${C_BLUE}" "${HEAL_COUNT}" "${C_RESET}"
printf '  fail:  %s%d%s\n' "${C_RED}" "${FAIL_COUNT}" "${C_RESET}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  printf '\n%svalidation failed:%s\n' "${C_RED}${C_BOLD}" "${C_RESET}" >&2
  for msg in "${FAIL_MESSAGES[@]}"; do
    printf '  - %s\n' "${msg}" >&2
  done
  exit 1
fi

if [[ "${MODE}" = "check" ]]; then
  printf '\n%s✓ validation clean. --check set, exiting.%s\n' "${C_GREEN}${C_BOLD}" "${C_RESET}"
  exit 0
fi

# ============================================================
# 6. Run
# ============================================================
URL="http://${HOST}:${PORT}"
PNPM_FILTER=(pnpm --filter @pagemint/site)

start_bg() {
  local label="$1"; shift
  local log_file="/tmp/pagemint-site.log"
  local pid_file="/tmp/pagemint-site.pid"

  if [[ -f "${pid_file}" ]]; then
    local old_pid
    old_pid="$(cat "${pid_file}" 2>/dev/null || true)"
    if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
      printf '\n%s✗ existing site process running (pid %s). kill it first:%s\n  kill %s\n' \
        "${C_RED}${C_BOLD}" "${old_pid}" "${C_RESET}" "${old_pid}" >&2
      exit 3
    fi
  fi

  : >"${log_file}"
  nohup "$@" >"${log_file}" 2>&1 &
  local pid=$!
  echo "${pid}" >"${pid_file}"
  disown "${pid}" 2>/dev/null || true

  # Wait up to 30s for the site to return an HTTP response.
  local waited=0
  while (( waited < 30 )); do
    if server_ready; then break; fi
    if ! kill -0 "${pid}" 2>/dev/null; then
      printf '\n%s✗ site process died during startup. last lines:%s\n' "${C_RED}${C_BOLD}" "${C_RESET}" >&2
      tail -n 20 "${log_file}" >&2
      rm -f "${pid_file}"
      exit 3
    fi
    sleep 1
    waited=$((waited + 1))
  done

  if server_ready; then
    printf '\n%s✓ %s running in background%s\n' "${C_GREEN}${C_BOLD}" "${label}" "${C_RESET}"
    printf '  url:  %s\n' "${URL}"
    printf '  pid:  %s  (stop: kill %s)\n' "${pid}" "${pid}"
    printf '  log:  %s  (tail: tail -f %s)\n' "${log_file}" "${log_file}"
    exit 0
  else
    printf '\n%s✗ %s did not bind to %s within 30s%s\n' "${C_RED}${C_BOLD}" "${label}" "${URL}" "${C_RESET}" >&2
    tail -n 20 "${log_file}" >&2
    exit 3
  fi
}

run_fg() {
  printf '\n%s▶ %s%s  %s\n' "${C_BOLD}" "$1" "${C_RESET}" "${URL}"
  shift
  exec "$@"
}

case "${MODE}" in
  dev)
    log_section "Start dev server"
    if [[ "${BACKGROUND}" -eq 1 ]]; then
      start_bg "next dev" "${PNPM_FILTER[@]}" exec next dev --hostname "${HOST}" --port "${PORT}"
    else
      run_fg "next dev" "${PNPM_FILTER[@]}" exec next dev --hostname "${HOST}" --port "${PORT}"
    fi
    ;;
  build)
    log_section "Production build"
    if "${PNPM_FILTER[@]}" exec next build 2>&1 | tee /tmp/pagemint-site-build.log; then
      printf '\n%s✓ build succeeded%s\n' "${C_GREEN}${C_BOLD}" "${C_RESET}"
      exit 0
    else
      printf '\n%s✗ build failed — see /tmp/pagemint-site-build.log%s\n' "${C_RED}${C_BOLD}" "${C_RESET}" >&2
      exit 3
    fi
    ;;
  prod)
    log_section "Production build + start"
    if ! "${PNPM_FILTER[@]}" exec next build >/tmp/pagemint-site-build.log 2>&1; then
      printf '%s✗ build failed — see /tmp/pagemint-site-build.log%s\n' "${C_RED}${C_BOLD}" "${C_RESET}" >&2
      exit 3
    fi
    log_pass "build completed"
    if [[ "${BACKGROUND}" -eq 1 ]]; then
      start_bg "next start" "${PNPM_FILTER[@]}" exec next start --hostname "${HOST}" --port "${PORT}"
    else
      run_fg "next start" "${PNPM_FILTER[@]}" exec next start --hostname "${HOST}" --port "${PORT}"
    fi
    ;;
esac
