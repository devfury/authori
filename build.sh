#!/usr/bin/env bash

set -euo pipefail

docker build -t registry.ezcaretech.com/authori/frontend:latest frontend
docker build -t registry.ezcaretech.com/authori/backend:latest backend
docker push registry.ezcaretech.com/authori/frontend:latest
docker push registry.ezcaretech.com/authori/backend:latest
