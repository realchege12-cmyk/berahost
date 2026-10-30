# Berahost VPS Worker Agent v0.3.1

This release matches the live Berahost worker API. It supports Ubuntu/Debian with Python 3 and systemd, uses only Python's standard library, and makes control-plane requests over verified HTTPS.

## API contract

Enrollment is `POST https://host.jchege.tech/api/worker-agent/enroll` with exactly `enrollmentToken`, `hostname`, `agentVersion`, and `capabilities` (`["telemetry"]`). The response provides `workerId`, `workerToken`, and `heartbeatIntervalSeconds`; `executionReady` is false. The one-time enrollment token is not saved.

Heartbeats are `POST https://host.jchege.tech/api/worker-agent/heartbeat` with `Authorization: Bearer <workerToken>`. The allowlisted body contains `hostname`, `agentVersion`, `capabilities`, CPU core count and integer percentage, plus total and available memory/disk bytes. Successful responses require `{ "ok": true }`. TLS certificate and hostname validation are always enabled.

## Upgrading an existing v0.2.0 installation

The v0.2.0 agent used the obsolete `/api/workers/{workerId}/heartbeat` path and legacy metric fields, which do not match the current worker-agent endpoint. v0.3.1 reads either the current `workerToken` field or the v0.2.0 `credential` field without printing either value, then sends exactly one heartbeat using the current path and schema.

- If the existing credential is accepted, the installer reuses it, asks for no new token, and updates/restarts the service.
- If the API returns HTTP 401/403, the installer asks whether to enroll with a fresh token. The prior credential file is backed up before replacement; the old dashboard worker record is not deleted.
- For other HTTP or network errors, the installer stops before making host changes so the route/network problem is not masked by creating another enrollment.

The one-shot diagnostic is `sudo /usr/bin/python3 /opt/berahost-worker/worker_agent.py --check`. It prints success or an HTTP status only—never a token or response body. Exit status 2 means HTTP 401/403, 3 other HTTP error, 4 network error, and 5 local/response error.

## Scope and privacy

The agent reports host identity and resource telemetry only. It has no remote-command, workload-execution, placement, scheduling, migration, or Docker-socket interface. The heartbeat sends only the allowlisted fields above. Its service account is unprivileged and is not in the Docker group. Credentials are stored at `/etc/berahost-worker/credentials.json`, root-owned and readable by the dedicated `berahost-worker` group (mode 0640). Logs omit tokens, authorization headers, URLs, and response bodies; HTTP status codes are logged to diagnose API rejections.

If Docker is already installed, the installer leaves its service state and existing containers untouched. If Docker CLI is absent, it may install `docker.io` from configured signed APT repositories and enable/start it; starting Docker may start existing containers configured with restart policies, so review the VPS first.

## Download and review

Use the copy/download block in Admin → VPS Servers or follow [the standalone installation guide](/vps-worker-installation.md). The block fetches the five versioned package files over HTTPS, verifies `SHA256SUMS`, and displays the installer. It does not execute the installer or include the enrollment token. Do not use `curl | bash`.

## Install

From the directory containing the verified files, run:

```sh
sudo bash ./install.sh
```

The installer requires an interactive TTY, Ubuntu/Debian, systemd, Python 3, `sha256sum`, and sudo/root access. It verifies package checksums, tests an existing credential once, prints the planned changes, and requires confirmation before host changes. A fresh one-time token is requested only when no usable credential exists or the API rejects the current one and the operator chooses re-enrollment.

## Operations

- Status: `sudo systemctl status berahost-worker-agent.service`
- Follow logs: `sudo journalctl -u berahost-worker-agent.service -f`
- Recent logs: `sudo journalctl -u berahost-worker-agent.service --since '1 hour ago'`
- One-shot test: `sudo /usr/bin/python3 /opt/berahost-worker/worker_agent.py --check`
- Restart: `sudo systemctl restart berahost-worker-agent.service`

The service heartbeats every 30 seconds by default. A healthy installation is `active (running)` and receives `{ "ok": true }` responses.
