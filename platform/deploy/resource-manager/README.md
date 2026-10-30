# Berahost host-side cgroup v2 resource manager

This standalone Python 3 standard-library service provides only three fixed operations for the existing `berahost` container. It keeps the application container unprivileged; requests are accepted only at `172.17.0.1:18765` from `172.17.0.2` and require `Authorization: Bearer <token>`. The token is read from `/etc/berahost-resource-manager.token`; never include it in logs or command-line arguments.

## Operations

Send JSON by `POST /v1`:

```json
{"action":"bootstrap"}
{"action":"ensure_user","userId":123,"memoryBytes":536870912,"cpuPercent":100}
{"action":"attach","userId":123,"pid":456}
```

`bootstrap` resolves the current init PID using the fixed `docker inspect` query for container `berahost`, reads its unified cgroup path, creates sibling `api` and `users` nodes, migrates direct processes to `api`, and enables `cpu` and `memory` controllers in the now-empty container parent and the process-free `users` node. Keeping the API process in a leaf avoids cgroup v2's no-internal-process restriction. The operation is scoped to the detected container cgroup, not a caller-supplied path, and re-resolves the path after restarts or recreations.

`ensure_user` accepts IDs 1–2147483647 (canonical positive decimal), memory limits of 16 MiB–2 GiB, and CPU percentages 1–200, matching the current published maximum plan. CPU `100` is exactly one vCPU (`cpu.max` quota/period = `100000 100000`); `50` is half a vCPU. It creates `users/<id>` and applies `memory.max` and `cpu.max`.

For the current constrained pilot, `users` itself is capped at **256 MiB RAM and 100% CPU (one vCPU) in aggregate across all customer bot and web workloads**. Parent cgroup limits are hierarchical, so a larger per-account plan value cannot exceed this host-wide ceiling. This is deliberately below the published Gold entitlement and is not a production capacity promise; raise the host limit only after adding measured capacity and applying a host-wide tenancy policy.

`attach` accepts an integer container-inner PID and numeric user ID. It searches host `/proc`, requires an exact final `NSpid` match and verifies the process's unified cgroup is the `api` cgroup or its descendant before writing that one host PID to the user's `cgroup.procs`. This allows moving only verified application processes, never arbitrary host PIDs.

Requests are limited to 4096 bytes, use exact action schemas, and return JSON errors. No shell or caller-selected executable is invoked. Logs contain only the client IP and a fixed message, never credentials or request content.

## Install (on the host)

These are instructions only; do not run them from the repository or during tests. Copy this directory to `/opt/berahost-resource-manager` and create a random token file readable only by root, for example:

```sh
sudo install -d -m 0755 /opt/berahost-resource-manager
sudo install -m 0755 resource_manager.py /opt/berahost-resource-manager/resource_manager.py
sudo sh -c 'umask 077; python3 -c "import secrets; print(secrets.token_urlsafe(48))" > /etc/berahost-resource-manager.token'
sudo chmod 0600 /etc/berahost-resource-manager.token
sudo install -m 0644 berahost-resource-manager.service /etc/systemd/system/berahost-resource-manager.service
sudo systemctl daemon-reload
sudo systemctl enable --now berahost-resource-manager.service
```

The service unit runs as root because cgroup migration requires host privileges, but restricts writable paths to cgroupfs and exposes only the dedicated listener. Confirm `172.17.0.1` exists on the host bridge and the container reaches it at `172.17.0.1`. Restrict firewall access to the bridge/container as additional defense. Provide the same token to the app through a secure deployment secret mechanism and send it as the Bearer header; do not bake it into source, image, or logs. Verify the unit's `CapabilityBoundingSet` and cgroup mount behavior on the target distribution: systemd/cgroupfs permission models vary, and cgroup writes may require `CAP_SYS_ADMIN` or different service sandbox settings. Do not broaden the API to work around permission failures; review host policy first.

## Local tests (safe)

From this directory run:

```sh
python3 -m unittest -v
```

Tests use temporary fake `/proc` and cgroup trees and never invoke Docker, bind a socket, or perform privileged actions. Python 3 standard library only.

## Caveats

- The service assumes Docker's host-side cgroup v2 path is visible under `/sys/fs/cgroup`, and that `cpu` and `memory` are delegated/available. `bootstrap` intentionally errors if not.
- Writing `cgroup.subtree_control` follows cgroup v2's no-internal-process constraint by moving direct parent processes first. This moves all direct processes (typically the container init) into `api`; ensure that this behavior is acceptable for the container runtime before enabling in production.
- A container restart changes its cgroup path. Re-run `bootstrap` after recreation. The service deliberately does not monitor Docker events.
- The application must call `ensure_user` before `attach`. It launches workload shells stopped, attaches them, then resumes them so children inherit the account cgroup. Process exits/races can still cause a safe request failure; callers may retry after checking process state.
- The unit's static IP allowlist is based on the supplied current topology. If Docker assigns a different app IP, update and review the allowlist. Authentication and source-IP filtering complement, but do not replace, host firewalling.
- Resource values are capped but represent host-enforced cgroup limits; choose values consistent with overall host capacity and tenancy policy. The 256 MiB/100% aggregate pilot values are specific to the current low-memory VPS and should be revisited before public scale.
