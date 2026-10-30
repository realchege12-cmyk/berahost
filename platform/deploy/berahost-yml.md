# `berahost.yml` for BERAHOST deployments

BERAHOST can read a small, strict YAML manifest from the repository root. It is optional: when absent, BERAHOST detects common package managers, build scripts, and static output directories. The dashboard choice remains explicit: select either **Static Site** or **Web Service**. If the manifest declares a different type, the deployment fails with a clear correction message.

## Current constrained-pilot scope

The current runner supports static repositories and Node.js web services. Project source is connected from a public GitHub URL or an authorized GitHub repository; the dashboard's file upload imports `.env` values only, not a project archive. Per-project Dockerfiles and non-Node runtime stacks are not supported yet. The platform-wide customer workload pool is capped at 256 MiB RAM and 100% CPU (one vCPU total), below the published per-plan ceilings. Deployment files live in the container filesystem rather than a persistent Docker volume, so important application data must live in an external database or object store.

## Static site

```yaml
version: 1
project:
  type: static
  root: .
install: npm ci
build: npm run build
output: dist
```

`output` must resolve to a directory inside the selected project root after the build. If omitted, BERAHOST checks common directories such as `dist`, `build`, `out`, and `public`, then checks for an `index.html` in the project root.

## Web service

```yaml
version: 1
project:
  type: service
  root: backend
install: npm ci
build: npm run build
start: npm start
service:
  health_path: /health
```

The service must listen on the dynamically assigned `PORT` environment variable. The optional `health_path` is polled during startup and while the service runs; it must return an HTTP success or redirect response. BERAHOST records a `service.port` value from a manifest as metadata, but the current runner does not reserve fixed host ports, so applications should use `PORT` instead.

## Supported keys and precedence

- `version`: required integer `1`.
- `project.type`: required `static` or `service`.
- `project.root`: optional repository-relative project directory; defaults to `.`.
- `install`, `build`, `start`: optional single-line commands, each limited to 1,000 characters.
- `output`: optional repository-relative static output directory; static sites only.
- `service.port`: optional integer from 1–65535, recorded as a hint only; the platform-assigned `PORT` remains authoritative.
- `service.health_path`: optional safe URL path beginning with `/`.

For supported command settings, the precedence is **dashboard override → `berahost.yml` → automatic detection**. Paths cannot escape the repository, duplicate YAML keys and unknown keys are rejected, and static/service-only settings cannot be mixed.

Environment values may be pasted or uploaded as a `.env` file in the dashboard. BERAHOST scans `.env.example`, `.env.sample`, `.env.template`, and `.env.defaults` for variable names; it does not return example defaults in the API. New environment values are encrypted before database storage and are not included in deployment API responses.
