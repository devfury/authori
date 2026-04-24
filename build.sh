#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REGISTRY="${REGISTRY:-registry.ezcaretech.com}"
NAMESPACE="${NAMESPACE:-authori}"
PLATFORM="${PLATFORM:-linux/amd64}"
DEFAULT_TAG="${TAG:-latest}"

PUSH=false
TAGS=()
TARGETS=()

usage() {
  cat <<EOF
Usage: ${0##*/} [OPTIONS] [TARGET...]

TARGETS (default: all)
  frontend  Authori frontend image
  backend   Authori backend image

OPTIONS
  -p, --push              Push images after building (requires REGISTRY)
  -t, --tag TAG           Tag to apply (repeatable; default: ${DEFAULT_TAG})
      --platform PLATFORM Build platform, comma-separated for multi-arch
                          (default: ${PLATFORM})
  -h, --help              Show this help

ENVIRONMENT
  REGISTRY     Registry host, e.g. registry.example.com
               (empty = local images only)
  NAMESPACE    Image namespace (default: ${NAMESPACE})
  PLATFORM     Overrides --platform
  TAG          Default tag when -t is not provided (default: latest)

EXAMPLES
  ${0##*/}                                      Build frontend + backend :latest locally
  ${0##*/} backend                              Build backend only
  ${0##*/} -t v1.2.3 -t latest -p               Build with two tags, then push
  REGISTRY=registry.example.com ${0##*/} -p

Multi-arch builds (comma-separated --platform values) require --push
because the local Docker engine cannot load multi-arch manifests.
EOF
}

require_value() {
  local option="$1"
  local value="${2:-}"

  if [[ -z "$value" || "$value" == -* ]]; then
    echo "Error: ${option} requires a value" >&2
    usage >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--push)
      PUSH=true
      shift
      ;;
    -t|--tag)
      require_value "$1" "${2:-}"
      TAGS+=("$2")
      shift 2
      ;;
    --platform)
      require_value "$1" "${2:-}"
      PLATFORM="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    frontend|backend)
      TARGETS+=("$1")
      shift
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      echo "Unknown target: $1 (expected 'frontend' or 'backend')" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ ${#TARGETS[@]} -eq 0 ]] && TARGETS=(frontend backend)
[[ ${#TAGS[@]} -eq 0 ]] && TAGS=("$DEFAULT_TAG")

if [[ "$PUSH" == true && -z "$REGISTRY" ]]; then
  echo "Error: --push requires REGISTRY to be set" >&2
  exit 1
fi

if [[ "$PUSH" == false && "$PLATFORM" == *,* ]]; then
  echo "Error: multi-platform builds require --push (cannot --load multi-arch manifests)" >&2
  exit 1
fi

image_ref() {
  local name="$1" tag="$2"
  local prefix="$NAMESPACE"

  [[ -n "$REGISTRY" ]] && prefix="${REGISTRY}/${prefix}"
  printf '%s/%s:%s' "$prefix" "$name" "$tag"
}

build_target() {
  local name="$1"
  local context="${ROOT_DIR}/${name}"

  if [[ ! -f "${context}/Dockerfile" ]]; then
    echo "Error: ${context}/Dockerfile not found" >&2
    return 1
  fi

  local tag_args=()
  for tag in "${TAGS[@]}"; do
    tag_args+=(-t "$(image_ref "$name" "$tag")")
  done

  echo ">>> Building ${name} [${PLATFORM}]"
  for tag in "${TAGS[@]}"; do
    echo "    tag: $(image_ref "$name" "$tag")"
  done

  local output_flag
  if [[ "$PUSH" == true ]]; then
    output_flag=--push
  else
    output_flag=--load
  fi

  docker buildx build \
    --platform "$PLATFORM" \
    "${tag_args[@]}" \
    "$output_flag" \
    "$context"
}

for target in "${TARGETS[@]}"; do
  build_target "$target"
done

echo ">>> Build completed successfully"
