#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/fabric-samples/test-network"
export PATH="$HOME/fabric-samples/bin:$PATH"
export VERBOSE=false
export OVERRIDE_ORG=""
export FABRIC_CFG_PATH="$HOME/fabric-samples/config"
. scripts/setAnchorPeer.sh 1 mychannel
. scripts/setAnchorPeer.sh 2 mychannel
