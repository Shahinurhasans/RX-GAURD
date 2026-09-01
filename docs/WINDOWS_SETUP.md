# Running Fabric on Windows — why WSL2, and why native filesystem

This is what was actually needed to get `test-network` running on a Windows
11 dev machine for this project, in the order the problems showed up.

## Problem 1: Docker Desktop's engine isn't a Unix socket

Hyperledger Fabric's peer containers spawn chaincode containers via the
Docker API at runtime. `test-network`'s compose files bind-mount
`${DOCKER_SOCK}:/host/var/run/docker.sock` into the peer container, where
`DOCKER_SOCK` is derived from `docker context inspect`. On native Windows,
Docker Desktop's engine is exposed over a named pipe
(`//./pipe/docker_engine`), not a Unix socket file, so this bind mount fails
with `invalid spec: :/host/var/run/docker.sock: empty section between colons`
when `network.sh` is run from PowerShell or Git Bash.

**Fix**: install a second, independent Docker Engine inside WSL2 (a plain
`get.docker.com` install, not Docker Desktop's WSL integration), and run
`network.sh` from inside that distribution instead.

```powershell
wsl -d Ubuntu -u root -- bash -c "curl -fsSL https://get.docker.com | sh"
wsl -d Ubuntu -u root -- systemctl enable docker --now
wsl -d Ubuntu -u root -- usermod -aG docker <your-wsl-username>
```

## Problem 2: `docker-compose` (hyphenated) resolves to the Windows binary

Even inside WSL, `network.sh` calls `docker-compose` (the legacy hyphenated
name). If Windows' `PATH` entries (`/mnt/c/...`) come before WSL's own bin
directories, this resolves to Docker Desktop's Windows `docker-compose.exe`
shim, which prints "activate WSL integration" and fails — because it's not
talking to the WSL-native engine at all.

**Fix**: a one-line native shim at `/usr/local/bin/docker-compose` that
forwards to the real `docker compose` (v2 plugin) installed by
`get.docker.com`. See `scripts/docker-compose-shim.sh`; install it with:

```bash
sudo cp scripts/docker-compose-shim.sh /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

## Problem 3: running from `/mnt/f/...` is extremely slow (or hangs)

Fabric's crypto material generation does hundreds of small file writes.
Running `network.sh` against a project directory under `/mnt/c` or `/mnt/f`
(a Windows drive, exposed to WSL over the 9p protocol) makes this slow enough
to look hung. A plain `cp -r` of `fabric-samples` from `/mnt/f/...` to
`~/fabric-samples` (WSL's native ext4) took ~20s; running the network from
there instead of `/mnt/f` was the difference between working and effectively
hanging.

**Fix**: everything Fabric-related (`fabric-samples`, the generated crypto
material) lives at `~/fabric-samples` inside WSL, not on the mounted Windows
drive. `scripts/wsl-*.sh` do this automatically — they `cp -r` the chaincode
source fresh from `/mnt/f/Team-X/chaincode` on every deploy, so editing the
chaincode on the Windows side and redeploying just works.

## Problem 4: WSL2 auto-suspends when nothing is attached

If no WSL session (terminal, `wsl -d ...` invocation) stays attached to the
distro for a while, WSL2 shuts the lightweight VM down, which kills the
Docker daemon and every container in it — including the CA server, which
exits nowhere near as cleanly as the peers/orderer do. Restarting the
containers (`docker start <names>`) picks up exactly where they left off
(crypto material, channel state, and chaincode approvals are all preserved on
disk), so this is an annoyance, not data loss — but the network appears
"down" every time a WSL session is idle for more than a few minutes.

**Fix**: keep one long-lived WSL session open (e.g. `wsl -d Ubuntu -- sleep
3600` in a terminal you leave running) while developing or demoing.

## Problem 5: the orderer panics on its own hostname lookup

The stock `compose-test-net.yaml` sets
`ORDERER_OPERATIONS_LISTENADDRESS=orderer.example.com:9443` — the orderer
resolves its *own container name* via Docker's embedded DNS (`127.0.0.11`)
just to bind its metrics/health listener. Right after the WSL2 docker daemon
(re)starts — which happens every time the VM was suspended and you bring
containers back with `docker start` — there's a window where that lookup can
fail before the embedded DNS has finished registering the container's own
record, and the orderer **panics and exits** instead of retrying:

```
PANI failed to start operations subsystem: listen tcp: lookup orderer.example.com
     on 10.255.255.254:53: dial udp 10.255.255.254:53: connect: network is unreachable
```

Symptom from the app side: every write (`IssuePrescription`,
`DispensePrescription`) fails with `10 ABORTED: failed to endorse
transaction` or `14 UNAVAILABLE: no orderers could successfully process
transaction`, while reads (`VerifyPrescription`) still work — because reads
don't need the orderer.

**Fix**: `scripts/wsl-network-up.sh` patches this to `0.0.0.0:9443` on every
fresh bring-up, so it doesn't affect a network started that way. If you hit
this on an **already-running** network (peers/CAs up, orderer missing or
exited), run `bash ~/wsl-fix-orderer.sh` (copy
`scripts/wsl-fix-orderer.sh` into WSL first) — it patches the compose file,
recreates just the orderer container against its existing ledger volume (no
data lost), and restarts the peers so they drop their stale connection to the
old orderer and reconnect cleanly.

## The actual working sequence

```powershell
# one-time: install docker engine + jq + node + the compose shim in WSL (see above)

# every session: keep WSL alive, then
wsl -d Ubuntu -- bash ~/wsl-network-up.sh          # bring up peers/orderer/CAs, create channel
wsl -d Ubuntu -- bash ~/wsl-set-anchor-peers.sh    # only needed once per fresh network
wsl -d Ubuntu -- bash ~/wsl-deploy-chaincode.sh    # package/install/approve/commit rxguard

# if containers show as Exited after an idle period:
wsl -d Ubuntu -- docker start ca_org1 ca_org2 ca_orderer orderer.example.com peer0.org1.example.com peer0.org2.example.com
```

The `backend/` Node process runs on **native Windows**, not WSL — WSL2's
automatic `localhost` port forwarding means `localhost:7051` /
`localhost:9051` (the peer gRPC endpoints) are reachable from Windows exactly
as if they were local, and `backend/src/fabric/connect.js` reads crypto
material from `fabric-samples/test-network/organizations/` — which needs to
exist on the **Windows-side** copy of the repo too, since that's what the
Windows Node process can see. After `wsl-network-up.sh` generates it inside
WSL, copy it over once:

```bash
cp -r ~/fabric-samples/test-network/organizations/peerOrganizations /mnt/f/Team-X/fabric-samples/test-network/organizations/
cp -r ~/fabric-samples/test-network/organizations/ordererOrganizations /mnt/f/Team-X/fabric-samples/test-network/organizations/
```

If you're not on Windows, none of this applies — just run
`./scripts/network-up.sh` directly.
