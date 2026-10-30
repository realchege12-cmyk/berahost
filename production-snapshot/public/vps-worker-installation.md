# Install or upgrade the Berahost VPS Worker Agent

The agent sends host identity and CPU, memory, and disk telemetry to Berahost over verified HTTPS. It is telemetry-only: it does not accept remote commands, run customer workloads, or perform placement, scheduling, or migration.

## Prepare an enrollment token

On a first install, create a one-time enrollment under **Admin → VPS Servers** immediately before installing. Tokens expire after 30 minutes and are single-use. Never paste a token into a shell command, URL, chat, ticket, or log; enter it only at the installer's hidden prompt.

For an existing v0.2.0 installation, the installer first tests the existing credential once against the current telemetry heartbeat API. If accepted, it reuses that credential and does not need a new token. If the API rejects it with HTTP 401/403, create a fresh enrollment in Admin and choose the installer's re-enrollment option. The old credential is backed up before replacement, and the old dashboard worker record is not deleted.

## Download, verify, and inspect (no installation)

These commands only download the versioned files, verify checksums, and display the installer. They do not execute it or modify the host:

```sh
set -euo pipefail
mkdir -p "$HOME/berahost-worker-v0.3.1"
cd "$HOME/berahost-worker-v0.3.1"
BASE='https://host.jchege.tech/worker-agent/v0.3.1'
for file in install.sh worker_agent.py berahost-worker-agent.service README.md SHA256SUMS; do
  curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --output "$file" "$BASE/$file"
done
sha256sum --check SHA256SUMS
sed -n '1,260p' install.sh
sed -n '1,220p' berahost-worker-agent.service
```

Stop if any download fails or a checksum does not match. Review the installer and service file before moving to the separate install step.

## Install or upgrade (separate, explicit step)

From the downloaded and verified directory, run:

```sh
sudo bash ./install.sh
```

The installer tests an existing credential once using the v0.3.1 endpoint and schema. A successful check reuses that credential; HTTP 401/403 offers a fresh, hidden-token enrollment prompt. Other HTTP or network failures stop safely before host changes. A fresh enrollment keeps a timestamped, root-only backup of any prior credentials; it does not delete the existing dashboard worker record.

If Docker CLI is already installed, the installer leaves Docker's service state and containers untouched. If it is absent, the installer may install `docker.io` from signed APT repositories and enable/start it. Starting Docker may start existing restart-policy containers; review the VPS first.

After confirmation, the installer installs/updates the unprivileged `berahost-worker` account, the telemetry-only agent, and the hardened systemd unit. It explicitly restarts an already-active agent service and sends a one-shot heartbeat check before reporting success. Heartbeats use `POST /api/worker-agent/heartbeat` every 30 seconds; enrollment uses `POST /api/worker-agent/enroll` only when needed.

## Verify and troubleshoot

```sh
sudo systemctl is-active berahost-worker-agent.service
sudo systemctl status berahost-worker-agent.service --no-pager
sudo journalctl -u berahost-worker-agent.service -n 30 --no-pager
sudo /usr/bin/python3 /opt/berahost-worker/worker_agent.py --check
```

The one-shot check reports `Heartbeat accepted (HTTP 200)`, an HTTP status, a network error, or a generic local/response error. It never prints credentials or response bodies.

- **HTTP 401/403:** the stored credential was rejected or revoked. Use a fresh enrollment token when the installer explicitly offers re-enrollment.
- **HTTP 400/404 or other HTTP status:** stop and report the status; this points to an API schema/route issue, not a bad token.
- **Network error:** check DNS, outbound HTTPS, system time, and CA certificates; do not consume another single-use token until connectivity is restored.
- **Checksum mismatch:** do not run the installer; redownload and verify the package again.

Do not display or share `/etc/berahost-worker/credentials.json`; share only the redacted status/log output.
