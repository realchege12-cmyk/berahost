#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BASE_URL="https://host.jchege.tech"
AGENT_VERSION="0.3.1"
CREDENTIALS="/etc/berahost-worker/credentials.json"
AGENT_PATH="/opt/berahost-worker/worker_agent.py"
UNIT_PATH="/etc/systemd/system/berahost-worker-agent.service"

afail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -t 0 && -t 1 ]] || afail 'Run this installer in an interactive TTY.'
[[ $EUID -eq 0 ]] || afail 'Run with sudo: sudo bash ./install.sh'
[[ -r /etc/os-release ]] || afail 'Cannot identify operating system.'
. /etc/os-release
[[ "${ID:-}" == ubuntu || "${ID:-}" == debian ]] || afail 'Only Ubuntu and Debian are supported.'
command -v systemctl >/dev/null || afail 'systemd is required.'
command -v python3 >/dev/null || afail 'Python 3 is required.'
command -v sha256sum >/dev/null || afail 'sha256sum is required.'

(cd "$PACKAGE_DIR" && sha256sum -c SHA256SUMS) || afail 'Package checksum verification failed.'

ENROLLMENT_MODE="reuse"
if [[ -e "$CREDENTIALS" ]]; then
  [[ -f "$CREDENTIALS" && -r "$CREDENTIALS" ]] || afail 'Existing credential path is not a readable regular file; it was left untouched.'
  printf 'Testing the existing credential once against the current telemetry heartbeat API. No credential or response body will be printed.\n'
  set +e
  /usr/bin/python3 "$PACKAGE_DIR/worker_agent.py" --credentials "$CREDENTIALS" --check
  probe_status=$?
  set -e
  case "$probe_status" in
    0)
      echo 'Existing credential accepted; it will be reused. No enrollment token is needed.'
      ENROLLMENT_MODE="reuse"
      ;;
    2)
      echo 'The existing credential was rejected (HTTP 401/403). Create a fresh enrollment in Admin → VPS Servers before continuing.'
      read -r -p 'Enroll with a fresh one-time token? [y/N] ' answer
      [[ "$answer" == [yY] || "$answer" == [yY][eE][sS] ]] || { echo 'Cancelled; existing credentials and service were left unchanged.'; exit 0; }
      ENROLLMENT_MODE="fresh"
      ;;
    3)
      afail 'The current API returned a non-authentication HTTP error; no host changes were made. Check the API route/payload before retrying.'
      ;;
    4)
      afail 'The heartbeat preflight could not reach the control plane; no host changes were made. Check network/DNS/time, then retry.'
      ;;
    5)
      echo 'The existing credential file could not be used by this agent. It will be preserved; a fresh enrollment is required.'
      read -r -p 'Enroll with a fresh one-time token? [y/N] ' answer
      [[ "$answer" == [yY] || "$answer" == [yY][eE][sS] ]] || { echo 'Cancelled; existing credentials and service were left unchanged.'; exit 0; }
      ENROLLMENT_MODE="fresh"
      ;;
    *)
      afail "Credential preflight exited unexpectedly (status $probe_status); no host changes were made."
      ;;
  esac
else
  ENROLLMENT_MODE="fresh"
  echo 'No existing credential file found; a fresh enrollment token will be required.'
fi

cat <<SUMMARY

Berahost worker-agent v${AGENT_VERSION} — planned changes:
  • Verify all release checksums and test any existing credential against the current heartbeat API.
  • Reuse a credential only if the current telemetry API accepts it; otherwise ask before fresh enrollment.
  • Preserve an existing credential before replacing it; never delete a worker record.
  • Leave an already-installed Docker daemon and its containers untouched. If Docker CLI is absent, install docker.io from signed APT repositories and enable/start it.
  • Install/update the dedicated unprivileged berahost-worker account, telemetry agent, and hardened systemd unit.
  • Restart the existing heartbeat service after updating its files and send one verified heartbeat check.

If Docker must be installed and started, existing restart-policy containers may start; review the VPS first.
The agent reports host identity/resource metrics only. It has no remote-command, placement, or customer-workload execution interface.
SUMMARY
read -r -p 'Proceed with these system changes? [y/N] ' answer
[[ "$answer" == [yY] || "$answer" == [yY][eE][sS] ]] || { echo 'Cancelled; no changes made.'; exit 0; }

getent group berahost-worker >/dev/null || groupadd --system berahost-worker
if ! id berahost-worker >/dev/null 2>&1; then
  useradd --system --gid berahost-worker --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin berahost-worker
fi
install -d -o root -g berahost-worker -m 0750 /etc/berahost-worker
install -d -o root -g root -m 0755 /opt/berahost-worker

if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y docker.io
  command -v docker >/dev/null || afail 'Docker CLI is not available after installation.'
  systemctl enable --now docker
else
  echo 'Docker is already installed; its service state and containers are unchanged.'
fi

if [[ "$ENROLLMENT_MODE" == "fresh" ]]; then
  printf '\nEnter the fresh one-time enrollment token from Admin → VPS Servers. Input is hidden; the token is not saved.\n'
  /usr/bin/python3 - "$BASE_URL" "$AGENT_VERSION" "$CREDENTIALS" <<'PY'
import datetime
import getpass
import grp
import json
import os
import shutil
import socket
import ssl
import sys
import urllib.error
import urllib.request

base, version, destination = sys.argv[1:4]
if not base.startswith("https://"):
    raise SystemExit("Refusing non-HTTPS control-plane URL")
token = getpass.getpass("Enrollment token: ")
if not token:
    raise SystemExit("An enrollment token is required")
payload = {
    "enrollmentToken": token,
    "hostname": socket.gethostname()[:255],
    "agentVersion": version,
    "capabilities": ["telemetry"],
}
request = urllib.request.Request(
    base.rstrip("/") + "/api/worker-agent/enroll",
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json", "Accept": "application/json"},
    method="POST",
)
temporary = destination + ".new-" + str(os.getpid())
try:
    with urllib.request.urlopen(request, context=ssl.create_default_context(), timeout=20) as response:
        raw = response.read(65537)
        if len(raw) > 65536:
            raise RuntimeError("Enrollment response exceeded size limit")
    result = json.loads(raw.decode("utf-8"))
    worker_id = result.get("workerId")
    worker_token = result.get("workerToken")
    interval = result.get("heartbeatIntervalSeconds", 30)
    if not isinstance(worker_id, (str, int)) or isinstance(worker_id, bool) or not str(worker_id):
        raise RuntimeError("Enrollment response did not contain workerId")
    if not isinstance(worker_token, str) or not worker_token:
        raise RuntimeError("Enrollment response did not contain workerToken")
    if not isinstance(interval, int) or isinstance(interval, bool) or not 10 <= interval <= 300:
        interval = 30
    gid = grp.getgrnam("berahost-worker").gr_gid
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump({
            "workerId": str(worker_id),
            "workerToken": worker_token,
            "heartbeatIntervalSeconds": interval,
        }, output)
        output.write("\n")
    os.chown(temporary, 0, gid)
    os.chmod(temporary, 0o640)
    backup = None
    if os.path.exists(destination):
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = destination + ".before-v0.3.1-" + stamp + "-" + str(os.getpid())
        shutil.copy2(destination, backup)
        os.chown(backup, 0, 0)
        os.chmod(backup, 0o600)
    os.replace(temporary, destination)
    if backup:
        print("Existing credentials preserved at " + backup)
except urllib.error.HTTPError as exc:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise SystemExit("Enrollment failed (HTTP {}). Existing credentials were not replaced.".format(exc.code))
except (urllib.error.URLError, ValueError, RuntimeError, OSError) as exc:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise SystemExit("Enrollment failed ({}). Existing credentials were not replaced.".format(type(exc).__name__))
finally:
    token = None
    worker_token = None
PY
fi

BACKUP_DIR="/var/backups/berahost-worker-agent/v0.3.1-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -o root -g root -m 0700 "$BACKUP_DIR"
if [[ -f "$AGENT_PATH" ]]; then cp -p "$AGENT_PATH" "$BACKUP_DIR/worker_agent.py.before"; chmod 0600 "$BACKUP_DIR/worker_agent.py.before"; fi
if [[ -f "$UNIT_PATH" ]]; then cp -p "$UNIT_PATH" "$BACKUP_DIR/berahost-worker-agent.service.before"; chmod 0600 "$BACKUP_DIR/berahost-worker-agent.service.before"; fi

install -o root -g root -m 0755 "$PACKAGE_DIR/worker_agent.py" "$AGENT_PATH.new"
mv -f "$AGENT_PATH.new" "$AGENT_PATH"
install -o root -g root -m 0644 "$PACKAGE_DIR/berahost-worker-agent.service" "$UNIT_PATH.new"
mv -f "$UNIT_PATH.new" "$UNIT_PATH"
systemctl daemon-reload
systemctl enable berahost-worker-agent.service >/dev/null
if systemctl is-active --quiet berahost-worker-agent.service; then
  systemctl restart berahost-worker-agent.service
else
  systemctl start berahost-worker-agent.service
fi
systemctl is-active --quiet berahost-worker-agent.service || afail 'Agent service did not become active.'
/usr/bin/python3 "$AGENT_PATH" --credentials "$CREDENTIALS" --check || afail 'One-shot heartbeat check failed; see the HTTP status above and systemd logs. Existing files were backed up.'
printf '\nInstalled agent and heartbeat verified. Backup directory: %s\n' "$BACKUP_DIR"
systemctl --no-pager --full status berahost-worker-agent.service
