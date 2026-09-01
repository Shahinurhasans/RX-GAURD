#!/usr/bin/env bash
# Runs from WSL2's native ext4 filesystem for the same I/O reasons as
# wsl-network-up.sh. Copies the chaincode source fresh from the Windows repo
# each time so it always deploys the latest edited version.
set -euo pipefail
cd "$HOME/fabric-samples/test-network"
export PATH="$HOME/fabric-samples/bin:$PATH"

rm -rf "$HOME/rxguard-chaincode-src"
cp -r /mnt/f/Team-X/chaincode "$HOME/rxguard-chaincode-src"
CC_DIR="$HOME/rxguard-chaincode-src/rxguard"

echo "==> npm install in chaincode (production deps only)"
( cd "$CC_DIR" && npm install --omit=dev )

echo "==> deploying rxguard chaincode to mychannel"
./network.sh deployCC -ccn rxguard -ccp "$CC_DIR" -ccl javascript
