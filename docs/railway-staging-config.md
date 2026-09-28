# Railway staging config note (2026-09-28)

Root `railway.toml` was renamed to `railway.api.toml` on the **staging** branch only.

Reason: Railway auto-applies root `railway.toml` / `railway.json` Config-as-Code to every
service in the environment. That forced `bossboard-web-staging` to build `Dockerfile.api`
even when the service `dockerfilePath` was set to `Dockerfile.nextweb`.

Service-level settings (dashboard / GraphQL) now pin:
- bossboard-api-staging → `Dockerfile.api`
- bossboard-web-staging → `Dockerfile.nextweb` + `node apps/web/server.js`

Do **not** merge this rename to `master` without an IaC (`.railway/railway.ts`) plan —
production web still relies on `railway.web.toml` via the legacy `railwayConfigFile` setting.
