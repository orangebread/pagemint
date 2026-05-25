#!/usr/bin/env bash
# PageMint: version and package a Chrome Web Store upload artifact.

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

TODAY="$(date -u '+%Y-%m-%d')"
LISTING_PATH="docs/extension/chrome-web-store-listing.md"
OUTPUT_DIR="apps/extension/.output"
VERSIONED_PACKAGE_PATHS=(
  "package.json"
  "apps/extension/package.json"
  "apps/site/package.json"
  "packages/render-core/package.json"
  "packages/shared-types/package.json"
)

BUMP="patch"
BUMP_PROVIDED=0
TARGET_VERSION=""
ALLOW_DIRTY=0
ALLOW_SAME_VERSION=0
SKIP_REPO_VERIFY=0
DRY_RUN=0

usage() {
  cat <<'EOF'
PageMint Chrome Web Store release

Usage:
  pnpm run chrome-store:release
  pnpm run chrome-store:release -- --bump patch|minor|major
  pnpm run chrome-store:release -- --version 0.1.1

Options:
  --bump <kind>           Bump from apps/extension/package.json. Defaults to patch.
  --version <version>     Set an explicit Chrome-compatible numeric version.
  --allow-dirty           Allow packaging from a dirty git worktree.
  --allow-same-version    Allow rebuilding the current version.
  --skip-repo-verify      Skip pnpm run repo:verify; chrome-store:prepare still runs.
  --dry-run               Print the planned version and commands without writing files.
  --help                  Show this help text.
EOF
}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

require_tool() {
  have "$1" || fail "$1 not on PATH"
}

read_json_version() {
  node -e 'const fs = require("fs"); const file = process.argv[1]; console.log(JSON.parse(fs.readFileSync(file, "utf8")).version);' "$1"
}

write_json_version() {
  node -e 'const fs = require("fs"); const file = process.argv[1]; const version = process.argv[2]; const json = JSON.parse(fs.readFileSync(file, "utf8")); json.version = version; fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");' "$1" "$2"
}

assert_chrome_version() {
  node -e '
const version = process.argv[1];
if (!/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){2,3}$/.test(version)) {
  console.error(`Chrome extension version must be three or four numeric parts, got ${version}`);
  process.exit(1);
}
for (const part of version.split(".")) {
  const value = Number(part);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    console.error(`Chrome extension version segment must be 0-65535, got ${part} in ${version}`);
    process.exit(1);
  }
}
' "$1"
}

bump_version() {
  node -e '
const [version, kind] = process.argv.slice(1);
const parts = version.split(".").map(Number);
while (parts.length < 3) parts.push(0);
if (kind === "major") {
  console.log(`${parts[0] + 1}.0.0`);
} else if (kind === "minor") {
  console.log(`${parts[0]}.${parts[1] + 1}.0`);
} else {
  console.log(`${parts[0]}.${parts[1]}.${parts[2] + 1}`);
}
' "$1" "$2"
}

compare_versions() {
  node -e '
const [left, right] = process.argv.slice(1);
const leftParts = left.split(".").map(Number);
const rightParts = right.split(".").map(Number);
const length = Math.max(leftParts.length, rightParts.length);
for (let index = 0; index < length; index += 1) {
  const leftValue = leftParts[index] ?? 0;
  const rightValue = rightParts[index] ?? 0;
  if (leftValue > rightValue) {
    console.log(1);
    process.exit(0);
  }
  if (leftValue < rightValue) {
    console.log(-1);
    process.exit(0);
  }
}
console.log(0);
' "$1" "$2"
}

relative_path() {
  node -e 'const path = require("path"); console.log(path.relative(process.argv[1], process.argv[2]));' "${REPO_ROOT}" "$1"
}

update_listing() {
  node -e '
const fs = require("fs");
const [file, version, today] = process.argv.slice(1);
let listing = fs.readFileSync(file, "utf8");
listing = listing.replace(/^Last prepared: .+$/m, `Last prepared: ${today}`);
listing = listing.replace(
  /apps\/extension\/\.output\/pagemintextension-[0-9]+(?:\.[0-9]+){2,3}-chrome\.zip/g,
  `apps/extension/.output/pagemintextension-${version}-chrome.zip`
);
fs.writeFileSync(file, listing);
' "${LISTING_PATH}" "$1" "${TODAY}"
}

get_git_status() {
  git status --porcelain 2>/dev/null || true
}

remove_stale_chrome_zips() {
  [[ -d "${OUTPUT_DIR}" ]] || return 0
  find "${OUTPUT_DIR}" -maxdepth 1 -type f -name '*-chrome.zip' -delete
}

find_release_zip() {
  local version="$1"
  local expected="${REPO_ROOT}/${OUTPUT_DIR}/pagemintextension-${version}-chrome.zip"

  if [[ -f "${expected}" ]]; then
    printf '%s\n' "${expected}"
    return 0
  fi

  [[ -d "${OUTPUT_DIR}" ]] || return 1
  find "${REPO_ROOT}/${OUTPUT_DIR}" -maxdepth 1 -type f -name "*${version}*-chrome.zip" | head -n 1
}

write_release_metadata() {
  local version="$1"
  local zip_path="$2"
  local metadata_path="${REPO_ROOT}/${OUTPUT_DIR}/chrome-store-release.json"
  local relative_zip_path
  local git_status

  relative_zip_path="$(relative_path "${zip_path}")"
  git_status="$(get_git_status)"
  [[ -n "${git_status}" ]] || git_status="clean"

  node -e '
const fs = require("fs");
const [metadataPath, version, createdAt, gitCommit, gitStatus, zipPath, listingPath] = process.argv.slice(1);
const metadata = {
  product: "PageMint",
  version,
  createdAt,
  gitCommit,
  gitStatus,
  zipPath,
  manifestPath: "apps/extension/.output/chrome-mv3/manifest.json",
  listingPath
};
fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
' "${metadata_path}" "$version" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(git rev-parse HEAD)" "${git_status}" "${relative_zip_path}" "${LISTING_PATH}"

  printf '%s\n' "${metadata_path}"
}

run_cmd() {
  printf '\n$ %s\n' "$*"
  "$@"
}

ARGS=("$@")
for ((index = 0; index < ${#ARGS[@]}; index += 1)); do
  arg="${ARGS[$index]}"
  case "${arg}" in
    --)
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --bump)
      ((index + 1 < ${#ARGS[@]})) || fail "--bump requires a value"
      index=$((index + 1))
      BUMP="${ARGS[$index]}"
      BUMP_PROVIDED=1
      ;;
    --version)
      ((index + 1 < ${#ARGS[@]})) || fail "--version requires a value"
      index=$((index + 1))
      TARGET_VERSION="${ARGS[$index]}"
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      ;;
    --allow-same-version)
      ALLOW_SAME_VERSION=1
      ;;
    --skip-repo-verify)
      SKIP_REPO_VERIFY=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      fail "Unknown argument: ${arg}

$(usage)"
      ;;
  esac
done

require_tool node
require_tool git
require_tool pnpm

[[ "${BUMP}" == "patch" || "${BUMP}" == "minor" || "${BUMP}" == "major" ]] || fail "--bump must be patch, minor, or major; got ${BUMP}"
[[ -z "${TARGET_VERSION}" || "${BUMP_PROVIDED}" -eq 0 ]] || fail "Use either --version or --bump, not both."

CURRENT_VERSION="$(read_json_version "apps/extension/package.json")"
assert_chrome_version "${CURRENT_VERSION}"

if [[ -z "${TARGET_VERSION}" ]]; then
  TARGET_VERSION="$(bump_version "${CURRENT_VERSION}" "${BUMP}")"
fi
assert_chrome_version "${TARGET_VERSION}"

VERSION_COMPARISON="$(compare_versions "${TARGET_VERSION}" "${CURRENT_VERSION}")"
if [[ "${VERSION_COMPARISON}" -lt 0 ]]; then
  fail "Target version ${TARGET_VERSION} is lower than current extension version ${CURRENT_VERSION}"
fi
if [[ "${VERSION_COMPARISON}" -eq 0 && "${ALLOW_SAME_VERSION}" -eq 0 ]]; then
  fail "Target version ${TARGET_VERSION} matches current version; pass --allow-same-version to rebuild it."
fi

GIT_STATUS="$(get_git_status)"
if [[ -n "${GIT_STATUS}" && "${ALLOW_DIRTY}" -eq 0 && "${DRY_RUN}" -eq 0 ]]; then
  fail "Release worktree is dirty. Commit/stash first or pass --allow-dirty.

${GIT_STATUS}"
fi

printf 'PageMint Chrome Web Store release %s -> %s\n' "${CURRENT_VERSION}" "${TARGET_VERSION}"
if [[ "${SKIP_REPO_VERIFY}" -eq 1 ]]; then
  printf 'Repo verify: skipped\n'
else
  printf 'Repo verify: enabled\n'
fi
if [[ -n "${GIT_STATUS}" ]]; then
  printf 'Dirty worktree: yes\n'
else
  printf 'Dirty worktree: no\n'
fi

if [[ "${DRY_RUN}" -eq 1 ]]; then
  printf '\nDry run only. Planned writes:\n'
  for package_path in "${VERSIONED_PACKAGE_PATHS[@]}"; do
    printf -- '- %s version = %s\n' "${package_path}" "${TARGET_VERSION}"
  done
  printf -- '- %s prepared date and expected zip path\n' "${LISTING_PATH}"
  printf '\nPlanned commands:\n'
  if [[ "${SKIP_REPO_VERIFY}" -eq 0 ]]; then
    printf -- '- pnpm run repo:verify\n'
  fi
  printf -- '- pnpm run chrome-store:prepare\n'
  exit 0
fi

for package_path in "${VERSIONED_PACKAGE_PATHS[@]}"; do
  write_json_version "${package_path}" "${TARGET_VERSION}"
done
update_listing "${TARGET_VERSION}"
remove_stale_chrome_zips

if [[ "${SKIP_REPO_VERIFY}" -eq 0 ]]; then
  run_cmd pnpm run repo:verify
fi
run_cmd pnpm run chrome-store:prepare

ZIP_PATH="$(find_release_zip "${TARGET_VERSION}")"
[[ -n "${ZIP_PATH}" && -f "${ZIP_PATH}" ]] || fail "Chrome Web Store zip for ${TARGET_VERSION} was not produced in ${OUTPUT_DIR}"

METADATA_PATH="$(write_release_metadata "${TARGET_VERSION}" "${ZIP_PATH}")"
printf '\nChrome Web Store upload package is ready:\n'
printf -- '- %s\n' "$(relative_path "${ZIP_PATH}")"
printf -- '- %s\n' "$(relative_path "${METADATA_PATH}")"
