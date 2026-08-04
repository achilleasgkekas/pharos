#!/usr/bin/env bash
# Build the Pharos web image for the architectures we actually deploy on.
#
# WHY THIS EXISTS: development happens on Apple Silicon (arm64) and `docker compose build`
# produces an arm64-only image. Push that to an x86 server and it either refuses to start or
# crawls under emulation. The failure is late and confusing, so the platform list belongs in a
# script rather than in whoever-remembers's shell history.
#
# Both architectures are built on purpose, not just the server's: Hetzner sells ARM instances
# (CAX, Ampere) noticeably cheaper per core than the x86 line (CPX), so a single multi-arch tag
# keeps that choice open, and keeps the image runnable on the Mac that builds it.
#
# USAGE
#   scripts/build-image.sh                          # build both arches into the local image store
#   scripts/build-image.sh --push                   # build + push to the registry (needs docker login)
#   scripts/build-image.sh --platform linux/amd64   # one arch, much faster while iterating
#   IMAGE=ghcr.io/me/pharos-web TAG=v0.2.0 scripts/build-image.sh --push
#
# PUSHING requires `docker login ghcr.io` first (username = your GitHub handle, password = a PAT
# with write:packages). This script never handles credentials.
#
# SPEED: the non-native arch is emulated (QEMU), and `next build` under emulation is slow —
# minutes, not seconds. That is expected, not a hang. For routine releases, a native amd64 CI
# runner builds the same Dockerfile far faster; this script is the local/offline path.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTEXT="$REPO_ROOT/apps/web"

IMAGE="${IMAGE:-ghcr.io/achilleasgkekas/pharos-web}"
# Default tag is the current commit, which is the only tag that can be traced back to source.
TAG="${TAG:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH=0
ALSO_LATEST="${ALSO_LATEST:-1}"

while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH=1; shift ;;
    --platform) PLATFORMS="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --no-latest) ALSO_LATEST=0; shift ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required (Docker Desktop ships it; otherwise install the buildx plugin)." >&2
  exit 1
fi

# A dirty tree would produce an image whose tag points at a commit it does not contain. Warn
# rather than refuse: building uncommitted work is exactly what you want while iterating.
if [ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null)" ]; then
  echo "WARNING: working tree is dirty — tag '$TAG' will not match the image contents." >&2
fi

ARGS=(--platform "$PLATFORMS" -t "${IMAGE}:${TAG}" -f "$CONTEXT/Dockerfile")
[ "$ALSO_LATEST" = "1" ] && ARGS+=(-t "${IMAGE}:latest")

if [ "$PUSH" = "1" ]; then
  ARGS+=(--push)
else
  # --load needs the containerd image store to hold a multi-platform image. Docker Desktop has
  # it on by default now; if this errors, either enable it (Settings > General > "Use containerd
  # for pulling and storing images") or build one platform at a time.
  ARGS+=(--load)
fi

echo "Building ${IMAGE}:${TAG} for ${PLATFORMS}"
echo "  context: $CONTEXT"
echo "  mode:    $([ "$PUSH" = 1 ] && echo push || echo 'local load')"
docker buildx build "${ARGS[@]}" "$CONTEXT"

echo
echo "Result:"
if [ "$PUSH" = "1" ]; then
  docker buildx imagetools inspect "${IMAGE}:${TAG}" | sed -n '1,40p'
else
  # ASSERT every requested platform is actually in the tag, rather than trusting the build log:
  # a single-arch image wearing a multi-arch tag is exactly the bug this script exists to stop,
  # and it is invisible until deploy day.
  #
  # `docker image inspect <tag>` is NOT the way to check. It silently resolves to the HOST
  # platform and reports .Manifests as null, so on this Mac a perfectly good amd64+arm64 image
  # reads as "linux/arm64" — a false negative that cost a debugging detour. `inspect --platform`
  # asks the real question: is THIS platform present (exit 0) or not (non-zero).
  missing=""
  for p in ${PLATFORMS//,/ }; do
    if docker image inspect --platform "$p" "${IMAGE}:${TAG}" >/dev/null 2>&1; then
      echo "  ✓ $p"
    else
      echo "  ✗ $p  MISSING"
      missing="$missing $p"
    fi
  done
  if [ -n "$missing" ]; then
    echo "Image ${IMAGE}:${TAG} is missing:$missing" >&2
    echo "(--load can collapse to the host platform without the containerd image store: enable" >&2
    echo " Docker Desktop > Settings > General > 'Use containerd for pulling and storing images')" >&2
    exit 1
  fi
fi
