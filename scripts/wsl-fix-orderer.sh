#!/usr/bin/env bash
# Run this if `docker ps` shows orderer.example.com missing/exited while
# everything else is up, and its logs show a PANI on "failed to start
# operations subsystem: ... lookup orderer.example.com ... network is
# unreachable" (docs/WINDOWS_SETUP.md, "Problem 5"). Patches the compose file
# to stop the orderer resolving its own hostname, then recreates just that
# container -- its ledger data lives in a named docker volume, not the
# container, so this does not lose chain state.
set -euo pipefail
cd "$HOME/fabric-samples/test-network"

sed -i 's/ORDERER_OPERATIONS_LISTENADDRESS=orderer.example.com:9443/ORDERER_OPERATIONS_LISTENADDRESS=0.0.0.0:9443/' compose/compose-test-net.yaml

docker rm -f orderer.example.com 2>/dev/null || true
DOCKER_SOCK=/var/run/docker.sock docker compose \
  -f compose/compose-test-net.yaml -f compose/docker/docker-compose-test-net.yaml \
  up -d orderer.example.com

sleep 3
docker restart peer0.org1.example.com peer0.org2.example.com

echo "Waiting for peers to come back..."
sleep 5
docker ps --filter name=orderer --filter name=peer0
