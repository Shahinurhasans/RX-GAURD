#!/usr/bin/env bash
# Runs from WSL2's native ext4 filesystem (not /mnt/f/...) because Fabric's
# crypto material generation does thousands of small file writes, which is
# extremely slow over the 9p mount that exposes Windows drives inside WSL.
set -euo pipefail
cd "$HOME/fabric-samples/test-network"
export PATH="$HOME/fabric-samples/bin:$PATH"
./network.sh up createChannel -c mychannel -ca
