#!/usr/bin/env python3
"""Narrow host-side cgroup-v2 manager for the berahost container."""
import hmac
import http.server
import ipaddress
import json
import os
import re
import socket
import subprocess
import threading
import time
from pathlib import Path

BIND_ADDRESS = "172.17.0.1"
PORT = 18765
TOKEN_FILE = Path("/etc/berahost-resource-manager.token")
CONTAINER_NAME = "berahost"
EXPECTED_CLIENT = "172.17.0.2"
CGROUP_ROOT = Path("/sys/fs/cgroup")
MAX_BODY = 4096
READ_TIMEOUT = 5
MAX_MEMORY = 2 * 1024**3
MAX_CPU_PERCENT = 200
HOST_WORKLOAD_MEMORY_BYTES = 256 * 1024**2
HOST_WORKLOAD_CPU_PERCENT = 100
CPU_PERIOD = 100000
ID_RE = re.compile(r"^[1-9][0-9]{0,9}$")


class ManagerError(Exception):
    pass


def validate_user_id(value):
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        raise ManagerError("userId must be a positive numeric ID")
    text = str(value)
    if not ID_RE.fullmatch(text) or int(text) > 2147483647:
        raise ManagerError("userId must be a positive numeric ID in range 1..2147483647")
    return text


def memory_bytes(value):
    if not isinstance(value, int) or isinstance(value, bool) or not 16 * 1024**2 <= value <= MAX_MEMORY:
        raise ManagerError("memoryBytes must be an integer from 16777216 to 8589934592")
    return value


def cpu_quota(percent):
    if not isinstance(percent, int) or isinstance(percent, bool) or not 1 <= percent <= MAX_CPU_PERCENT:
        raise ManagerError("cpuPercent must be an integer from 1 to 1000")
    return (CPU_PERIOD * percent) // 100


class CgroupManager:
    def __init__(self, root=CGROUP_ROOT, proc_root=Path("/proc"), docker_lookup=None):
        self.root = Path(root)
        self.proc_root = Path(proc_root)
        self.docker_lookup = docker_lookup or self._docker_pid
        self.lock = threading.RLock()
        self.base = None
        self.api = None
        self.users = None

    @staticmethod
    def _docker_pid():
        try:
            result = subprocess.run(
                ["docker", "inspect", "--format", "{{.State.Pid}}", CONTAINER_NAME],
                check=True, capture_output=True, text=True, timeout=5,
            )
            pid = int(result.stdout.strip())
            if pid <= 1:
                raise ValueError()
            return pid
        except (OSError, subprocess.SubprocessError, ValueError):
            raise ManagerError("could not obtain a valid container init PID")

    def _container_cgroup(self):
        pid = self.docker_lookup()
        try:
            rows = (self.proc_root / str(pid) / "cgroup").read_text().splitlines()
        except OSError:
            raise ManagerError("could not read container init cgroup")
        unified = [line.split(":", 2)[2] for line in rows if line.startswith("0::")]
        if len(unified) != 1:
            raise ManagerError("container init is not in a unified cgroup v2 hierarchy")
        rel = unified[0].lstrip("/")
        candidate = (self.root / rel).resolve()
        # bootstrap moves the container init into the managed `api` leaf. On
        # retries (including service restarts), resolve that leaf back to the
        # original container parent instead of nesting another api/users tree.
        while candidate.name == "api" and (candidate.parent / "users").is_dir():
            candidate = candidate.parent
        root = self.root.resolve()
        if candidate == root or root not in candidate.parents or not candidate.is_dir():
            raise ManagerError("container cgroup path is invalid")
        return candidate

    def bootstrap(self):
        with self.lock:
            parent = self._container_cgroup()
            api = parent / "api"
            users = parent / "users"
            try:
                # Keep the API in its own leaf cgroup. Resource-controlled user
                # cgroups must be siblings: enabling controllers beneath `api`
                # is invalid because the API process lives there.
                api.mkdir(exist_ok=True)
                users.mkdir(exist_ok=True)
                procs = parent / "cgroup.procs"
                pids = [line.strip() for line in procs.read_text().splitlines() if line.strip()]
                for pid in pids:
                    if not pid.isdecimal() or int(pid) <= 0:
                        raise ManagerError("parent cgroup contains an invalid process ID")
                    (api / "cgroup.procs").write_text(pid)

                available = set((parent / "cgroup.controllers").read_text().split())
                required = {"cpu", "memory"}
                if not required <= available:
                    raise ManagerError("cpu and memory controllers are not available on the container cgroup")
                control = parent / "cgroup.subtree_control"
                enabled = set(control.read_text().split())
                missing = required - enabled
                if missing:
                    control.write_text(" ".join("+" + name for name in sorted(missing)))

                # `users` is a controller-bearing domain node with no processes.
                users_control = users / "cgroup.subtree_control"
                users_enabled = set(users_control.read_text().split())
                users_missing = required - users_enabled
                if users_missing:
                    users_control.write_text(" ".join("+" + name for name in sorted(users_missing)))
                # The current pilot VPS has about 908 MiB total RAM and two
                # vCPUs. This parent limit caps the combined customer workload
                # pool (bots and web apps), regardless of larger plan cgroups.
                users.joinpath("memory.max").write_text(str(HOST_WORKLOAD_MEMORY_BYTES))
                users.joinpath("cpu.max").write_text(f"{cpu_quota(HOST_WORKLOAD_CPU_PERCENT)} {CPU_PERIOD}")
            except ManagerError:
                raise
            except OSError:
                raise ManagerError("cgroup bootstrap failed; check service privileges and cgroup layout")
            self.base = parent
            self.api = api
            self.users = users
            return {"ok": True, "action": "bootstrap"}

    def _base(self):
        # Re-resolve and re-bootstrap on every operation so container recreation
        # or restart cannot leave the manager pointing at a stale cgroup path.
        self.bootstrap()
        return self.base

    def ensure_user(self, user_id, memory, cpu):
        uid = validate_user_id(user_id)
        mem = memory_bytes(memory)
        quota = cpu_quota(cpu)
        with self.lock:
            group = self._base() / "users" / uid
            try:
                group.mkdir(parents=True, exist_ok=True)
                (group / "memory.max").write_text(str(mem))
                (group / "cpu.max").write_text(f"{quota} {CPU_PERIOD}")
            except OSError:
                raise ManagerError("could not create or configure user cgroup")
        return {"ok": True, "action": "ensure_user", "userId": uid, "memoryBytes": mem, "cpuPercent": cpu}

    def attach(self, user_id, inner_pid):
        uid = validate_user_id(user_id)
        if not isinstance(inner_pid, int) or isinstance(inner_pid, bool) or not 1 <= inner_pid <= 2147483647:
            raise ManagerError("pid must be a positive numeric container-inner PID")
        with self.lock:
            base = self._base()
            target = base / "users" / uid
            if not target.is_dir():
                raise ManagerError("user cgroup does not exist; call ensure_user first")
            api = base / "api"
            try:
                # Search host proc entries; require exact NSpid namespace match and ancestry.
                matches = []
                for proc in self.proc_root.iterdir():
                    if not proc.name.isdecimal():
                        continue
                    try:
                        status = (proc / "status").read_text()
                        ns = re.search(r"^NSpid:\s*(.*)$", status, re.M)
                        cg = (proc / "cgroup").read_text().splitlines()
                        unified = [line.split(":", 2)[2] for line in cg if line.startswith("0::")]
                        if ns and ns.group(1).split()[-1] == str(inner_pid) and len(unified) == 1:
                            host_cg = (self.root / unified[0].lstrip("/")).resolve()
                            base_real = base.resolve()
                            api_real = api.resolve()
                            if host_cg == api_real or api_real in host_cg.parents:
                                matches.append(int(proc.name))
                    except (OSError, IndexError, ValueError):
                        continue
                if len(matches) != 1:
                    raise ManagerError("container-inner PID did not identify exactly one process in berahost cgroup")
                (target / "cgroup.procs").write_text(str(matches[0]))
            except ManagerError:
                raise
            except OSError:
                raise ManagerError("could not move process into user cgroup")
        return {"ok": True, "action": "attach", "userId": uid, "pid": inner_pid}

    def handle(self, payload):
        if not isinstance(payload, dict) or not isinstance(payload.get("action"), str):
            raise ManagerError("request must be a JSON object with an action")
        action = payload["action"]
        if action == "bootstrap" and set(payload) == {"action"}:
            return self.bootstrap()
        if action == "ensure_user" and set(payload) == {"action", "userId", "memoryBytes", "cpuPercent"}:
            return self.ensure_user(payload["userId"], payload["memoryBytes"], payload["cpuPercent"])
        if action == "attach" and set(payload) == {"action", "userId", "pid"}:
            return self.attach(payload["userId"], payload["pid"])
        raise ManagerError("unknown action or invalid request fields")


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "BerahostResourceManager/1"
    sys_version = ""

    def log_message(self, fmt, *args):
        # Never log headers, request bodies, or exception details that may contain secrets.
        print(f"resource-manager client={self.client_address[0]} request handled", flush=True)

    def reply(self, code, data):
        raw = json.dumps(data, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if self.path != "/v1" or self.client_address[0] != EXPECTED_CLIENT:
            self.reply(403, {"error": "forbidden"})
            return
        expected = self.server.token
        supplied_header = self.headers.get("Authorization", "")
        supplied = supplied_header[7:] if supplied_header.startswith("Bearer ") else ""
        if not hmac.compare_digest(supplied.encode(), expected):
            self.reply(401, {"error": "unauthorized"})
            return
        try:
            length = int(self.headers.get("Content-Length", "-1"))
            if length < 0 or length > MAX_BODY:
                raise ManagerError("request body size must be 1..4096 bytes")
            body = self.rfile.read(length)
            if len(body) != length:
                raise ManagerError("incomplete request body")
            payload = json.loads(body)
            result = self.server.manager.handle(payload)
            self.reply(200, result)
        except (ManagerError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            message = str(exc) if isinstance(exc, ManagerError) else "invalid JSON request"
            self.reply(400, {"error": message})
        except Exception:
            self.reply(500, {"error": "internal error"})

    def do_GET(self):
        self.reply(405, {"error": "method not allowed"})


def load_token(path=TOKEN_FILE):
    try:
        token = path.read_bytes().strip()
    except OSError:
        raise SystemExit("resource manager token file is unavailable")
    if len(token) < 32:
        raise SystemExit("resource manager token must contain at least 32 bytes")
    return token


def main():
    token = load_token()
    server = http.server.ThreadingHTTPServer((BIND_ADDRESS, PORT), Handler)
    server.daemon_threads = True
    server.timeout = READ_TIMEOUT
    server.token = token
    server.manager = CgroupManager()
    print(f"resource manager listening on {BIND_ADDRESS}:{PORT}", flush=True)
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
