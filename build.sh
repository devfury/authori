#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REGISTRY="${REGISTRY:-registry.ezcaretech.com}"
NAMESPACE="${NAMESPACE:-authori}"
ENGINE="${ENGINE:-docker}"
PLATFORM="${PLATFORM:-linux/amd64}"
DEFAULT_TAG="${TAG:-latest}"

PUSH=false
TAG_ARG=""
TARGETS=()

usage() {
  cat <<EOF
Usage: ${0##*/} [OPTIONS] [TARGET...]

TARGETS (default: all)
  frontend  Authori frontend image
  backend   Authori backend image

OPTIONS
  -p, --push              Push images after building (requires REGISTRY)
  -t, --tag TAG           Tag(s) to apply, comma-separated (default: ${DEFAULT_TAG})
                          e.g. -t v1.2.3,latest
      --engine ENGINE     Container engine: docker or podman
      --platform PLATFORM Build platform, comma-separated for multi-arch
                          (default: ${PLATFORM})
  -h, --help              Show this help

ENVIRONMENT
  REGISTRY     Registry host, e.g. registry.example.com
               (empty = local images only)
  NAMESPACE    Image namespace (default: ${NAMESPACE})
  ENGINE       Container engine: docker or podman (default: ${ENGINE})
  PLATFORM     Overrides --platform
  TAG          Default tag when -t is not provided (default: latest)

EXAMPLES
  ${0##*/}                                 Build frontend + backend :latest locally
  ${0##*/} backend                         Build backend only
  ${0##*/} -t v1.2.3,latest -p            Build with two tags, then push
  REGISTRY=registry.example.com ${0##*/} -p
  ENGINE=podman ${0##*/} -t v1.2.3 -p

Multi-arch builds (comma-separated --platform values) require --push
because the local Docker engine cannot load multi-arch manifests.
Podman builds support single-platform builds in this script.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--push)          PUSH=true;       shift ;;
    -t|--tag)           TAG_ARG="$2";    shift 2 ;;
    --engine)           ENGINE="$2";     shift 2 ;;
    --platform)         PLATFORM="$2";   shift 2 ;;
    -h|--help)          usage; exit 0 ;;
    frontend|backend)   TARGETS+=("$1"); shift ;;
    --)                 shift; break ;;
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

# 쉼표로 구분된 태그를 배열로 변환
IFS=',' read -ra TAGS <<< "${TAG_ARG:-${DEFAULT_TAG}}"

case "$ENGINE" in
  docker|podman) ;;
  *)
    echo "Error: ENGINE must be 'docker' or 'podman' (got '${ENGINE}')" >&2
    exit 1
    ;;
esac

if [[ "$PUSH" == true && -z "$REGISTRY" ]]; then
  echo "Error: --push requires REGISTRY to be set" >&2
  exit 1
fi

if [[ "$PUSH" == false && "$PLATFORM" == *,* ]]; then
  echo "Error: multi-platform builds require --push (cannot --load multi-arch manifests)" >&2
  exit 1
fi

if [[ "$ENGINE" == podman && "$PLATFORM" == *,* ]]; then
  echo "Error: Podman multi-platform builds are not supported by this script" >&2
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
  local context_dir="${ROOT_DIR}/${name}"
  local dockerfile="${context_dir}/Dockerfile"

  if [[ ! -f "${dockerfile}" ]]; then
    echo "Error: ${dockerfile} not found" >&2
    return 1
  fi

  local tag_args=()
  for tag in "${TAGS[@]}"; do
    tag_args+=(-t "$(image_ref "$name" "$tag")")
  done

  echo ">>> Building ${name} [${PLATFORM}] with ${ENGINE}"
  for tag in "${TAGS[@]}"; do
    echo "    tag: $(image_ref "$name" "$tag")"
  done

  if [[ "$ENGINE" == podman ]]; then
    podman build \
      --platform "$PLATFORM" \
      -f "$dockerfile" \
      "${tag_args[@]}" \
      "$context_dir"

    if [[ "$PUSH" == true ]]; then
      for tag in "${TAGS[@]}"; do
        podman push "$(image_ref "$name" "$tag")"
      done
    fi

    return
  fi

  local output_flag
  if [[ "$PUSH" == true ]]; then
    output_flag=--push
  else
    output_flag=--load
  fi

  docker buildx build \
    --platform "$PLATFORM" \
    -f "$dockerfile" \
    "${tag_args[@]}" \
    "$output_flag" \
    "$context_dir"
}

for target in "${TARGETS[@]}"; do
  build_target "$target"
done

echo ">>> Build completed successfully"
