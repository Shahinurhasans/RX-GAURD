# Running Fabric on Windows — why WSL2, not Docker Desktop directly

Hyperledger Fabric's peer containers spawn chaincode containers via the Docker
API at runtime (the classic non-Kubernetes deployment model). That requires a
real Unix domain socket (`/var/run/docker.sock`) bind-mounted into the peer
container. Docker Desktop on native Windows exposes the engine over a named
pipe (`//./pipe/docker_engine`), not a Unix socket file, so `test-network`'s
compose files — which set `DOCKER_SOCK` from `docker context inspect` and bind
it in as `${DOCKER_SOCK}:/host/var/run/docker.sock` — fail with
`invalid spec: :/host/var/run/docker.sock: empty section between colons`
when `network.sh` is run from a native Windows shell (PowerShell or Git Bash).

The fix used in this repo: run a **second, independent Docker Engine inside
WSL2 Ubuntu** (not Docker Desktop's WSL integration — a plain
`get.docker.com` install), and run `network.sh` from inside that WSL
distribution. WSL2 provides a real Linux kernel and a real Unix socket, so the
compose files work unmodified.

```powershell
# one-time setup
wsl -d Ubuntu -u root -- bash -c "curl -fsSL https://get.docker.com | sh"
wsl -d Ubuntu -u root -- systemctl enable docker --now
wsl -d Ubuntu -u root -- usermod -aG docker <your-wsl-username>

# every time you want the network up
wsl -d Ubuntu -- bash -c "cd /mnt/f/Team-X && ./scripts/network-up.sh"
```

The Windows-side Docker Desktop install (done earlier for `docker` CLI
availability generally) is untouched and can still be used for anything that
doesn't need the peer's docker-socket-in-docker pattern, e.g. running the
`ai-service` or `backend` in containers later.

If you're not on Windows, none of this applies — just run
`./scripts/network-up.sh` directly.
