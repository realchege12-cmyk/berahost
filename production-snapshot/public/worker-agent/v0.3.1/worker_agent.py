#!/usr/bin/env python3
"""Minimal Berahost VPS telemetry agent. It has no command-execution interface."""

import json
import os
import shutil
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

AGENT_VERSION = "0.3.1"
DEFAULT_CONTROL_PLANE = "https://host.jchege.tech"
DEFAULT_CAPABILITIES = ("telemetry",)
DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 30
REQUEST_TIMEOUT_SECONDS = 15
MAX_RESPONSE_BYTES = 65536
MAX_SAFE_INTEGER = 2**53 - 1


def _read_meminfo(path="/proc/meminfo"):
    values = {}
    try:
        for line in Path(path).read_text(encoding="ascii").splitlines():
            parts = line.split()
            if len(parts) >= 2 and parts[0].endswith(":"):
                values[parts[0][:-1]] = int(parts[1]) * 1024
    except (OSError, ValueError):
        pass
    total = max(0, min(MAX_SAFE_INTEGER, values.get("MemTotal", 0)))
    available = max(0, min(total, values.get("MemAvailable", values.get("MemFree", 0))))
    return total, available


def _cpu_counters(path="/proc/stat"):
    try:
        first = Path(path).read_text(encoding="ascii").splitlines()[0].split()
        counters = [int(value) for value in first[1:]]
        idle = counters[3] + (counters[4] if len(counters) > 4 else 0)
        return sum(counters), idle
    except (OSError, ValueError, IndexError):
        return None


def cpu_usage_percent(previous, current):
    """Return an integer 0-100 as required by the current API schema."""
    if previous is None or current is None:
        return 0
    total_delta = max(0, current[0] - previous[0])
    idle_delta = max(0, current[1] - previous[1])
    if total_delta == 0:
        return 0
    used = 100.0 * (total_delta - idle_delta) / total_delta
    return int(round(min(100.0, max(0.0, used))))


def _bounded_bytes(value, upper=MAX_SAFE_INTEGER):
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return 0
    return max(0, min(upper, number))


def collect_metrics(previous_cpu=None, root_path="/"):
    cores = max(1, min(512, os.cpu_count() or 1))
    memory_total, memory_available = _read_meminfo()
    current_cpu = _cpu_counters()
    try:
        disk = shutil.disk_usage(root_path)
        disk_total = _bounded_bytes(disk.total)
        disk_available = min(disk_total, _bounded_bytes(disk.free))
    except OSError:
        disk_total = disk_available = 0
    payload = {
        "cpuCores": cores,
        "cpuUsagePercent": cpu_usage_percent(previous_cpu, current_cpu),
        "memoryTotalBytes": memory_total,
        "memoryAvailableBytes": min(memory_total, memory_available),
        "diskTotalBytes": disk_total,
        "diskAvailableBytes": min(disk_total, disk_available),
    }
    return payload, current_cpu


def build_enrollment_payload(enrollment_token, hostname=None):
    token = str(enrollment_token)
    if not token:
        raise ValueError("An enrollment token is required")
    return {
        "enrollmentToken": token,
        "hostname": str(hostname or socket.gethostname())[:255],
        "agentVersion": AGENT_VERSION,
        "capabilities": list(DEFAULT_CAPABILITIES),
    }


def build_heartbeat_payload(hostname, metrics):
    """Return only fields accepted by the strict live heartbeat schema."""
    total_memory = _bounded_bytes(metrics.get("memoryTotalBytes"))
    total_disk = _bounded_bytes(metrics.get("diskTotalBytes"))
    return {
        "hostname": str(hostname)[:255],
        "agentVersion": AGENT_VERSION,
        "capabilities": list(DEFAULT_CAPABILITIES),
        "cpuCores": max(1, min(512, int(metrics.get("cpuCores", 1)))),
        "cpuUsagePercent": max(0, min(100, int(round(float(metrics.get("cpuUsagePercent", 0)))))),
        "memoryTotalBytes": total_memory,
        "memoryAvailableBytes": min(total_memory, _bounded_bytes(metrics.get("memoryAvailableBytes"))),
        "diskTotalBytes": total_disk,
        "diskAvailableBytes": min(total_disk, _bounded_bytes(metrics.get("diskAvailableBytes"))),
    }


def _https_json(url, body, headers=None):
    if not url.startswith("https://"):
        raise ValueError("Control-plane requests require HTTPS")
    request_headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=request_headers,
        method="POST",
    )
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS, context=context) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise ValueError("Control-plane response exceeded size limit")
        result = json.loads(raw.decode("utf-8"))
        if not isinstance(result, dict):
            raise ValueError("Control-plane returned an invalid response")
        return result


def enroll(control_plane, enrollment_token, hostname=None):
    url = control_plane.rstrip("/") + "/api/worker-agent/enroll"
    result = _https_json(url, build_enrollment_payload(enrollment_token, hostname))
    worker_id = result.get("workerId")
    worker_key = result.get("workerKey")
    worker_token = result.get("workerToken")
    if not isinstance(worker_id, (str, int)) or isinstance(worker_id, bool) or not str(worker_id):
        raise ValueError("Enrollment response is missing workerId")
    if not isinstance(worker_key, str) or not worker_key:
        raise ValueError("Enrollment response is missing workerKey")
    if not isinstance(worker_token, str) or not worker_token:
        raise ValueError("Enrollment response is missing workerToken")
    interval = result.get("heartbeatIntervalSeconds", DEFAULT_HEARTBEAT_INTERVAL_SECONDS)
    if not isinstance(interval, int) or isinstance(interval, bool) or interval < 10 or interval > 300:
        interval = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
    return {
        "workerId": str(worker_id),
        "workerKey": worker_key,
        "workerToken": worker_token,
        "heartbeatIntervalSeconds": interval,
        "executionReady": result.get("executionReady") is True,
    }


def load_credentials(path):
    """Read the root-provisioned credential file; never log credential values."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    worker_id = data.get("workerId")
    # v0.2.0 stored the same bearer secret under `credential`.
    worker_token = data.get("workerToken") or data.get("credential")
    interval = data.get("heartbeatIntervalSeconds", DEFAULT_HEARTBEAT_INTERVAL_SECONDS)
    if not isinstance(worker_id, str) or not worker_id:
        raise ValueError("Credential file is missing workerId")
    if not isinstance(worker_token, str) or not worker_token:
        raise ValueError("Credential file is missing workerToken or legacy credential")
    if not isinstance(interval, int) or isinstance(interval, bool) or interval < 10 or interval > 300:
        interval = DEFAULT_HEARTBEAT_INTERVAL_SECONDS
    return worker_id, worker_token, interval


def heartbeat(control_plane, worker_token, payload):
    url = control_plane.rstrip("/") + "/api/worker-agent/heartbeat"
    result = _https_json(url, payload, {"Authorization": "Bearer " + worker_token})
    if result.get("ok") is not True:
        raise RuntimeError("Heartbeat was not accepted")
    return result


def check_heartbeat(credentials_path="/etc/berahost-worker/credentials.json", control_plane=DEFAULT_CONTROL_PLANE):
    """Send exactly one telemetry heartbeat; never print credentials or response content."""
    try:
        _worker_id, worker_token, _interval = load_credentials(credentials_path)
        if not control_plane.startswith("https://"):
            raise ValueError("Control-plane requests require HTTPS")
        metrics, _current_cpu = collect_metrics()
        heartbeat(control_plane, worker_token, build_heartbeat_payload(socket.gethostname(), metrics))
    except urllib.error.HTTPError as exc:
        print("Heartbeat check failed (HTTP {})".format(exc.code), file=sys.stderr, flush=True)
        return 2 if exc.code in (401, 403) else 3
    except urllib.error.URLError:
        print("Heartbeat check failed (network error)", file=sys.stderr, flush=True)
        return 4
    except (OSError, ValueError, RuntimeError, TimeoutError):
        print("Heartbeat check failed (local or response error)", file=sys.stderr, flush=True)
        return 5
    print("Heartbeat accepted (HTTP 200)", flush=True)
    return 0


def run(credentials_path="/etc/berahost-worker/credentials.json", control_plane=DEFAULT_CONTROL_PLANE):
    _worker_id, worker_token, interval = load_credentials(credentials_path)
    if not control_plane.startswith("https://"):
        raise ValueError("Control-plane requests require HTTPS")
    hostname = socket.gethostname()[:255]
    previous_cpu = None
    while True:
        metrics, current_cpu = collect_metrics(previous_cpu)
        payload = build_heartbeat_payload(hostname, metrics)
        try:
            heartbeat(control_plane, worker_token, payload)
        except urllib.error.HTTPError as exc:
            print("Heartbeat failed (HTTP {}); will retry".format(exc.code), flush=True)
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            # Deliberately omit credentials, request headers, URLs, and response bodies.
            print("Heartbeat failed ({}); will retry".format(type(exc).__name__), flush=True)
        previous_cpu = current_cpu
        time.sleep(interval)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--credentials", default="/etc/berahost-worker/credentials.json")
    parser.add_argument("--control-plane", default=DEFAULT_CONTROL_PLANE)
    parser.add_argument("--check", action="store_true", help="send one heartbeat and exit")
    args = parser.parse_args()
    if not args.control_plane.startswith("https://"):
        parser.error("--control-plane must use HTTPS")
    if args.check:
        raise SystemExit(check_heartbeat(args.credentials, args.control_plane))
    run(args.credentials, args.control_plane)
