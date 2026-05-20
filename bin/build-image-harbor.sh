#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

REGISTRY_HOST="${REGISTRY_HOST:-dpsauatdk01.intra.hkma.gov.hk:8443}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-$REGISTRY_HOST/tois/tois}"
IMAGE_TAG="${IMAGE_TAG:-}"
REGISTRY_USERNAME="${REGISTRY_USERNAME:-}"
REGISTRY_PASSWORD="${REGISTRY_PASSWORD:-}"

if [ -z "$IMAGE_TAG" ]; then
  echo "Missing IMAGE_TAG."
  echo "Example: IMAGE_TAG=dev_v0.0.27 $0"
  exit 1
fi

if [ -z "$REGISTRY_USERNAME" ] || [ -z "$REGISTRY_PASSWORD" ]; then
  echo "Missing Harbor credentials (REGISTRY_USERNAME / REGISTRY_PASSWORD)."
  exit 1
fi

BUILDER=""
if command -v docker >/dev/null 2>&1; then
  BUILDER="docker"
elif command -v podman >/dev/null 2>&1; then
  BUILDER="podman"
fi

if [ -z "$BUILDER" ]; then
  echo "No container builder found on this machine (docker/podman)."
  echo "Build and push the image from a machine/runner that has docker or podman."
  exit 1
fi

echo "Installing and building Next.js app..."
cd "$REPO_ROOT"
npm ci
npm run build

IMAGE_REF="${IMAGE_REPOSITORY}:${IMAGE_TAG}"
echo "Building and pushing image: $IMAGE_REF"

if [ "$BUILDER" = "docker" ]; then
  docker login "$REGISTRY_HOST" -u "$REGISTRY_USERNAME" -p "$REGISTRY_PASSWORD"
  docker build -t "$IMAGE_REF" "$REPO_ROOT"
  docker push "$IMAGE_REF"
elif [ "$BUILDER" = "podman" ]; then
  podman login "$REGISTRY_HOST" -u "$REGISTRY_USERNAME" -p "$REGISTRY_PASSWORD"
  podman build -t "$IMAGE_REF" "$REPO_ROOT"
  podman push "$IMAGE_REF"
fi

echo "Done: $IMAGE_REF"
