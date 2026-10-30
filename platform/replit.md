# BERAHOST

A WhatsApp bot deployment platform — users can deploy, manage, and monitor WhatsApp bots from a web dashboard with coin-based billing, subscriptions, and real-time log streaming.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/berahost run dev` — run the frontend (port 23312)
- `pnpm --filter @workspace/berahost-deck run dev` — run the slides deck (port 24990)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `SESSION_SECRET` — express-session secret
- Optional env: `GH_TOKEN` — GitHub token for private bot repo access
- Optional env: `ADMIN_EMAIL` / `ADMIN_PASSWORD` — override default admin credentials (default: admin@berahost.com / [redacted-default-password])

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- API: Express 5 + Socket.io (real-time bot logs)
- DB: PostgreSQL + Drizzle ORM
- Bot runtime: @whiskeysockets/baileys (WhatsApp)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/` — Drizzle DB schema (all tables)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/berahost/src/` — React frontend
- `artifacts/berahost-deck/src/` — Pitch deck slides

## Architecture decisions

- Coin economy: users spend coins to deploy bots; coins are purchased via M-Pesa (PayHero STK push)
- Real-time logs stream to the browser via Socket.io; bot processes are child processes on the server
- Session auth using express-session + connect-pg-simple (no JWT)
- Self-keepalive: server pings its own `/api/healthz` every 30s to prevent Replit autoscale from killing bot processes
- Admin user + bot templates are seeded on every startup (idempotent)

## Product

- Bot marketplace: browse and deploy pre-built WhatsApp bots
- Dashboard: manage active deployments, view real-time logs, start/stop/restart bots
- Coin wallet: buy coins via M-Pesa, redeem vouchers, claim daily bonus
- Subscriptions: free / starter / pro / enterprise plans
- Admin panel: user management, revenue stats, broadcast messages
- Support tickets: in-app support chat

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `SESSION_SECRET` env var must be set for express-session to work in production
- The `@whiskeysockets/baileys` package requires `sharp` as an optional peer dep (warning is safe to ignore)
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Bot processes run as child processes of the API server — they die if the API server restarts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
