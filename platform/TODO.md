# BERAHOST Subscription and Web Hosting TODO

## ✅ Canonical monthly subscriptions replace coin access
- Starter is KES 200/month with a maximum of 5 hosted bots or web deployments.
- Silver is KES 500/month with a maximum of 13 hosted bots or web deployments.
- Gold is KES 800/month with a maximum of 30 hosted bots or web deployments.
- PayHero is the payment provider for plan purchases and paid custom-domain requests; coin purchases, coin deployment charges, daily coin claims, and voucher-based access are no longer part of the user deployment flow.
- Successful payments extend the subscription for 30 days from the later of the current expiry or the callback time, and expose the resulting expiry to the user.

## ✅ Bot lifecycle and environment configuration
- Existing bot deployment, session backup, auto-restart, and Socket.IO console behavior remains available.
- Creating and starting a bot requires an active subscription and stays within the subscribed plan limit.
- When a subscription expires or a user is banned, all running bots are stopped and their deployment records/session data remain stored for renewal or admin review.
- Bot templates continue to scan `.env`, JSON, and JavaScript configuration values; deployment forms show required and optional variables without exposing server secrets.
- Startup restore, crash restart, scheduled restart, and GitHub redeploy paths refuse expired or banned users.

## ✅ GitHub web deployment hosting
- An authenticated user can submit a public GitHub repository URL, branch, optional build/start commands, and environment values.
- The server validates the repository URL, scans env configuration, builds when a build script/command is present, serves static output when present, and runs Node web apps when a start command is present.
- Every web deployment receives a unique hosted identity and URL, with status, logs, env scan, start/stop, and expiry state.
- Web deployments use the same subscription limit as bot deployments, are stopped and taken offline when entitlement expires, and remain stored until renewal.
- Users can request a custom domain for KES 134 through PayHero. Paid requests require the requested TXT verification token and become routable only after DNS verification.

## ✅ Admin controls
- Admin can ban/unban users, delete users through an audited soft-delete flow, force a subscription plan and expiry, revoke/expire a subscription, stop deployments, and see web deployment/payment state.
- Every administrative mutation is recorded in audit logs.

## ✅ Verification and delivery
- Updated UI navigation, dashboard, subscription page, payment history, API-key documentation, and route manifest so coin purchasing is not presented as the access model.
- Kept the existing bot deployment code paths functional while adding separate web runtime code.
- Completed schema push, TypeScript diagnostics, typecheck, production build, API health checks, canonical plan checks, and web deployment route checks.
- Saved and pushed checkpoint `26815492d86b81b648efb096ccb4a76de930fb76`; managed auto-publication was submitted from the checkpoint.

## ⏳ GitHub OAuth and connected repository deployment
- A user can connect GitHub from BERAHOST using OAuth and see the connected GitHub account; the OAuth grant permits access to private repositories.
- A user can sign in with GitHub; an existing BERAHOST account is matched by GitHub identity or verified email, and a new account can be created safely.
- The connected account can list accessible repositories and branches, select a private or public repository, and deploy it without pasting a repository URL.
- Connected web deployments store repository identity, branch, private/public state, and encrypted access credentials without returning tokens to the browser or logs.
- Auto deploy is enabled by default for connected web deployments, creates a signed GitHub push webhook, filters to the selected branch, records commit metadata, and redeploys the latest revision after each matching commit.
- Users can disable auto deploy, reconnect/disconnect GitHub, and delete a deployment; deletion removes its managed webhook, runtime, temporary build files, and dependent domain orders.
- Existing pasted public URL deployments and existing manually configured bot webhooks remain functional.

## ⏳ Google OAuth sign-in
- The login screen offers “Continue with Google” alongside password and GitHub sign-in.
- Google OAuth uses the public callback `https://berahost-bfer3udn.manus.space/api/auth/google/callback`, validates state, exchanges the authorization code server-side, and requests only OpenID profile/email identity scopes.
- Existing BERAHOST accounts are matched by Google subject or verified email; new accounts receive a generated password hash and verified status.
- Google client credentials are stored as protected server secrets and are never shipped to the browser, logged, or persisted as access tokens.
