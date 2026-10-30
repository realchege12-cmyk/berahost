# BERAHOST Subscription and Web Hosting Plan

## Scope
Replace coin-based access with monthly Starter, Silver, and Gold subscriptions for bot and web hosting while preserving the existing bot deployment engine. Add GitHub-based static/Node web deployments, unique hosted URLs, optional paid custom-domain requests, automatic suspension at subscription expiry, and audited admin controls.

## Implementation approach
- Keep the existing bot process, WhatsApp session backup, Socket.IO logs, and bot template/env scanning paths intact; remove coins from deployment eligibility and user-facing navigation.
- Create one canonical subscription catalog: Starter KES 200 / 5 bots, Silver KES 500 / 13 bots, Gold KES 800 / 30 bots, each for 30 days. PayHero callbacks extend expiry from the later of now or current expiry.
- Centralize entitlement checks for create/start/restore/restart and run an expiry reconciler that stops processes but retains deployment records and web project metadata for later renewal.
- Add a separate `web_deployments` model and runtime service. Clone a validated public GitHub URL, scan package/env configuration, run a build when configured, serve static output or proxy a Node process, and expose a unique `/web/<slug>` URL. Do not route web projects through the bot deployment tables.
- Add custom-domain orders at KES 134 through PayHero, with verification-token and paid/active states. A domain becomes routable when paid and verified; DNS/TLS remains platform/provider controlled.
- Add audited admin delete-user, ban/unban, force-plan, and subscription expiry controls. User deletion is soft deletion so payment/audit history remains consistent.
- Use server-returned plan data in the UI. Replace wallet/coin purchase surfaces with subscription status, plan cards, payment history, and a web deployment console.

## Design
### Candidate styles
- **Bera Signal Console** — probability 0.06: dark operator-console surfaces with electric lime accents and dense status cues.
- **Warm SaaS Command Center** — probability 0.04: soft panels, amber highlights, and an approachable operational hierarchy.
- **Minimal Cloud Terminal** — probability 0.08: monochrome interface with restrained green state indicators.

### Chosen direction: Bera Signal Console
- **Design Movement:** cyber-operations dashboard fused with contemporary SaaS product polish.
- **Core Principles:** high signal-to-noise; visible system state; fast scan paths; confident but readable controls.
- **Color Philosophy:** near-black surfaces make logs and status colors legible; Bera green signals active infrastructure; warm amber marks billing attention.
- **Layout Paradigm:** persistent command rail with asymmetrical operational panels and full-width activity bands rather than a centered marketing grid.
- **Signature Elements:** lime status pips, terminal-inspired data rows, and rounded glass panels with thin luminous borders.
- **Interaction Philosophy:** every action exposes pending, active, suspended, and expired state immediately.
- **Animation:** short state transitions only; no decorative loops competing with logs or payment feedback.
- **Typography System:** Inter for UI; JetBrains Mono for IDs, domains, timestamps, and deployment logs.
- **Brand Essence:** a sharp hosting command center for bots and web apps — operational, transparent, empowering.
- **Brand Voice:** direct, technical, and encouraging. “Your deployment is live.” “Renew before the runtime sleeps.”
- **Wordmark & Logo:** retain the existing BERA mark with compact uppercase wordmark treatment.
- **Signature Brand Color:** electric Bera green as the action and health signal.

## Project structure
- `artifacts/api-server/src/lib/subscriptions.ts`: canonical plans and entitlement helpers.
- `artifacts/api-server/src/lib/webProcess.ts`: isolated web clone/build/run/stop and request proxy helpers.
- `artifacts/api-server/src/routes/payments.ts`: PayHero subscription and domain payment flows.
- `artifacts/api-server/src/routes/webDeployments.ts`: web project CRUD, env scan, lifecycle, and domain orders.
- `artifacts/api-server/src/routes/admin.ts`: audited user and subscription administration.
- `lib/db/src/schema`: web deployment and domain order tables; existing bot tables remain compatible.
- `artifacts/berahost/src/pages/subscriptions.tsx`: canonical plan purchase/status UI.
- `artifacts/berahost/src/pages/web-deployments.tsx`: GitHub web deployment workflow and hosted URLs.
- `artifacts/berahost/public/manus-routes.json`: synchronized route manifest.

## GitHub-connected deployment extension

Add GitHub OAuth for signed-in users and a GitHub sign-in path that uses the same callback. OAuth access tokens are encrypted at rest with a server-side key. The integration stores the GitHub account identity on the BERAHOST user and exposes repository metadata through GitHub's API, including private repositories permitted by the OAuth `repo` scope.

Web deployments will accept a selected GitHub repository and branch instead of requiring a pasted public URL. The deployment record stores the repository identity, whether it is private, and whether automatic deployment is enabled. Repository downloads use the user's encrypted GitHub token when needed; public URL deployments remain backward compatible.

When a connected deployment is created with automatic deployment enabled, BERAHOST creates a GitHub push webhook for the selected repository using a per-deployment signing secret. The webhook validates GitHub's HMAC signature, filters to the selected branch, records commit metadata, and queues a safe redeploy. Deleting a deployment removes its GitHub webhook and temporary build files. Existing manually configured bot webhooks remain supported.

### GitHub-connected product behavior

- Users can connect GitHub from BERAHOST and see the connected GitHub account.
- Users can sign in with GitHub; existing accounts are matched by verified GitHub identity or email, and new accounts are created with a generated password hash.
- Repository selection shows repositories the connected GitHub account can access, including private repositories allowed by the OAuth grant.
- A selected repository can be deployed without pasting its URL.
- Auto deploy is enabled by default for connected web deployments and redeploys on pushes to the selected branch.
- Users can disable auto deploy, change the branch, disconnect GitHub, and delete deployments.
- Existing public URL deployments and existing manual webhook records continue to work.

### GitHub-connected design direction

Use a **Git-native control room**: repository identity is primary, branch and commit state are visible, automation is explicit, and the existing dark BERAHOST command-center styling is preserved. Cyan marks connected actions, green marks healthy automation, amber marks permissions or pending hooks, and red is reserved for destructive or failed states. Use concise headings such as “Connect your source once.” and “Every push, shipped safely.”

### GitHub-connected project structure

- `lib/db/src/schema/users.ts`: GitHub identity and encrypted token fields.
- `lib/db/src/schema/web_deployments.ts`: repository identity, auto-deploy state, and commit metadata.
- `artifacts/api-server/src/lib/github.ts`: OAuth, GitHub API, token encryption, repository listing, and webhook helpers.
- `artifacts/api-server/src/routes/auth.ts`: GitHub sign-in and callback.
- `artifacts/api-server/src/routes/github.ts`: connect/disconnect, repository listing, and managed webhook operations.
- `artifacts/api-server/src/routes/webDeployments.ts`: selected-repository deployment creation and deletion cleanup.
- `artifacts/api-server/src/lib/webProcess.ts`: authenticated repository download and redeploy startup.
- `artifacts/berahost/src/pages/github-integration.tsx`: connection state, repository picker, and automation settings.
- `artifacts/berahost/src/pages/web-deployments.tsx`: connected-repository deployment flow and auto-deploy controls.

GitHub OAuth requires an OAuth App callback URL of `https://berahost-bfer3udn.manus.space/api/auth/github/callback` and secrets `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_TOKEN_ENCRYPTION_KEY`. Use the GitHub `repo` scope for private repository contents and webhook management. Webhook endpoints remain unauthenticated but HMAC-protected; tokens are never returned to browsers or logs.

## Google sign-in extension

Add Google OAuth as a second external sign-in provider while preserving password and GitHub login. Use server-side authorization-code exchange with `openid email profile`, validate the returned verified email, match an existing BERAHOST account by Google subject or email, and create a new account with a generated password hash when no match exists. Store only the Google subject and avatar metadata; never store or expose Google access tokens. Bind OAuth state to the existing session, use the fixed public callback URL `https://berahost-bfer3udn.manus.space/api/auth/google/callback`, and keep return paths limited to internal application routes.
