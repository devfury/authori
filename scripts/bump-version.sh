#!/usr/bin/env bash
set -euo pipefail

VERSION="${2:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: bump-version.sh <command> <version>  (e.g. bump-version.sh bump 1.2.3)" >&2
  exit 1
fi

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; then
  echo "Invalid version format: '$VERSION'. Expected semver (e.g. 1.2.3)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

TARGETS=(
  "package.json"
  "apps/api/package.json"
  "apps/web/package.json"
  "packages/shared/package.json"
)

for rel in "${TARGETS[@]}"; do
  path="$ROOT/$rel"
  sed -i.bak -E "s/\"version\": \"[^\"]+\"/\"version\": \"$VERSION\"/" "$path"
  rm -f "$path.bak"
  echo "Updated: $rel"
done

cd "$ROOT"
bun install
git add bun.lock
git add "${TARGETS[@]}"
git commit -m "chore: bump version to $VERSION"
echo ""
echo "Committed version bump to $VERSION"
