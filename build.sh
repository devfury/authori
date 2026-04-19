#!/usr/bin/env bash

set -euo pipefail

# 기본 아키텍처 설정 (linux/amd64)
PLATFORM="${PLATFORM:-linux/amd64}"

echo ">>> Building Authori Docker images ($PLATFORM)"

# Frontend 빌드
echo ">>> Building Frontend: registry.ezcaretech.com/authori/frontend:latest"
docker build --platform "$PLATFORM" -t registry.ezcaretech.com/authori/frontend:latest frontend

# Backend 빌드
echo ">>> Building Backend: registry.ezcaretech.com/authori/backend:latest"
docker build --platform "$PLATFORM" -t registry.ezcaretech.com/authori/backend:latest backend

# 이미지 푸시
docker push registry.ezcaretech.com/authori/frontend:latest
docker push registry.ezcaretech.com/authori/backend:latest

echo ">>> Build completed successfully"
