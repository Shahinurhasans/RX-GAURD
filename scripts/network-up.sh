#!/usr/bin/env bash
# Brings up the Fabric test-network, creates the channel, and deploys the
# rxguard chaincode. Run from the repository root (or anywhere — the script
# resolves paths relative to itself).
#
# On Windows, run this from inside WSL2 (see docs/WINDOWS_SETUP.md), not from
# a native Windows shell.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_NETWORK="$REPO_ROOT/fabric-samples/test-network"
CHAINCODE_DIR="$REPO_ROOT/chaincode/rxguard"

export PATH="$REPO_ROOT/fabric-samples/bin:$PATH"

echo "==> Bringing up Fabric test-network (2 orgs + orderer + CA)"
cd "$TEST_NETWORK"
./network.sh up createChannel -c mychannel -ca

echo "==> Installing npm dependencies for chaincode"
cd "$CHAINCODE_DIR"
npm install --omit=dev

echo "==> Deploying rxguard chaincode"
cd "$TEST_NETWORK"
./network.sh deployCC -ccn rxguard -ccp "$CHAINCODE_DIR" -ccl javascript

echo "==> Network is up and rxguard chaincode is committed on 'mychannel'."
echo "    Next: start ai-service, backend, and frontend (see README.md)."
