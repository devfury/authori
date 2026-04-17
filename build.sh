#!/usr/bin/env bash

set -euo pipefail

# 기본 아키텍처 설정 (linux/amd64)
PLATFORM="${PLATFORM:-linux/amd64}"

echo ">>> Building Authori Docker images ($PLATFORM)"

# Frontend 빌드 및 푸시
echo ">>> Building Frontend: registry.ezcaretech.com/authori/frontend:latest"
docker build --platform "$PLATFORM" -t registry.ezcaretech.com/authori/frontend:latest frontend
docker push registry.ezcaretech.com/authori/frontend:latest

# Backend 빌드 및 푸시
echo ">>> Building Backend: registry.ezcaretech.com/authori/backend:latest"
docker build --platform "$PLATFORM" -t registry.ezcaretech.com/authori/backend:latest backend
docker push registry.ezcaretech.com/authori/backend:latest

echo ">>> Build completed successfully"
