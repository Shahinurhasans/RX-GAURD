#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$REPO_ROOT/fabric-samples/bin:$PATH"
cd "$REPO_ROOT/fabric-samples/test-network"
./network.sh down
