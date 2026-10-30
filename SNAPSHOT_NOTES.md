# BERAHOST snapshot notes

This branch is a **sanitized, incomplete snapshot**, not a verified source release or a reproducible copy of production.

## Snapshot contents

- `platform/` is copied from the app VPS working tree `/home/ubuntu/berahost-platform`, branch `main`, baseline commit `80ab864` (`Harden web dependency resolution`), including that checkout’s local tracked changes and untracked source files.
- `production-snapshot/public/` contains the exact live admin `index.html` and compiled frontend bundle, the published v0.3.1 telemetry-only worker package, and its installation guide.
- The repository’s original README is retained at the root.

## Important mismatch and sanitization

The available `platform/` source does **not** match the current production dashboard/API. In particular, the current dashboard labels/navigation are absent from the source, and the host checkout’s frontend/API files differ from the active container. The current dashboard is preserved only as a compiled browser bundle; its original frontend component source was not found. Do not assume that building `platform/` will recreate the live dashboard.

The source copy is sanitized for public publication: environment files, Git history, dependencies, generated build directories, logs, database dumps, attached uploads, screenshots, key files, and the compiled production API bundle are excluded. Credential-like README examples were replaced with placeholders. In the staged API source only, the fixed admin/demo seed credentials were removed: first-admin seeding now requires `ADMIN_PASSWORD`, and demo seeding is opt-in via `DEMO_EMAIL` plus `DEMO_PASSWORD`. These staged-only source edits were **not deployed** and have not been build- or integration-tested. The compiled production API bundle is omitted because it contains the same unsafe defaults.

No database, customer/payment records, environment secrets, SSH keys, or production container files were included or changed. This snapshot has not been built or tested as a whole; it is intended as a reference snapshot only until the full current source is recovered and reconciled.
