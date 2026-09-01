#!/usr/bin/env bash
# Runs from WSL2's native ext4 filesystem (not /mnt/f/...) because Fabric's
# crypto material generation does thousands of small file writes, which is
# extremely slow over the 9p mount that exposes Windows drives inside WSL.
set -euo pipefail
cd "$HOME/fabric-samples/test-network"
export PATH="$HOME/fabric-samples/bin:$PATH"

# The stock compose file has the orderer resolve its OWN hostname
# (orderer.example.com) via Docker's embedded DNS just to bind its metrics
# listener. On WSL2, right after the docker daemon (re)starts, that lookup
# can fail before the embedded DNS has the container's own record ready,
# panicking the orderer on boot. Binding to 0.0.0.0 sidesteps the self-lookup
# entirely — see docs/WINDOWS_SETUP.md, "Problem 5".
sed -i 's/ORDERER_OPERATIONS_LISTENADDRESS=orderer.example.com:9443/ORDERER_OPERATIONS_LISTENADDRESS=0.0.0.0:9443/' compose/compose-test-net.yaml

./network.sh up createChannel -c mychannel -ca
