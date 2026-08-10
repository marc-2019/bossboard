# ilert production monitoring (BossBoard)

## Problem (2026-08-11)

ilert emailed “Production: bossboard-* is DOWN” when **home internet** failed.

Those sources are **Heartbeat** integrations (interval 180s). A pinger must
`GET https://api.ilert.com/api/heartbeats/<key>` regularly. When the pinger
host loses network, heartbeats **expire** even if Railway apps are healthy.

## Fix

Cloud-side pinger as a **dedicated Railway service** `ilert-pinger`
(`services/ilert-pinger/`) — not on bossboard-api (API monorepo deploy is
CJS/ESM-fragile; this tiny Node service is independent):

1. Probe public health URL  
2. Only if healthy → ping ilert heartbeat  

Runs every **2 minutes** (+ once on boot). Public status:
`https://ilert-pinger-production.up.railway.app/health`

There is also optional code in **bossboard-api** cron
(`apps/api/src/services/ilert-health-pinger.ts`) if that process is built
with the feature and `ILERT_HEALTH_PINGER_ENABLED=true` — prefer the
standalone service as the production path.

## Railway env vars

```bash
ILERT_HEALTH_PINGER_ENABLED=true

# BossBoard API
ILERT_HB_BOSSBOARD_API=https://api.ilert.com/api/heartbeats/<secret>
ILERT_HEALTH_BOSSBOARD_API=https://api.instilligent.com/health

# BossBoard Web
ILERT_HB_BOSSBOARD_WEB=https://api.ilert.com/api/heartbeats/<secret>
ILERT_HEALTH_BOSSBOARD_WEB=https://bossboard.instilligent.com/
```

Also configured (health + heartbeat pairs):

```bash
# Modular Compliance (launched)
ILERT_HB_MODULAR_COMPLIANCE=https://api.ilert.com/api/heartbeats/<secret>
ILERT_HEALTH_MODULAR_COMPLIANCE=https://app.modularcompliance.com/api/health

# Mastering-MOSS (maritime safety)
ILERT_HB_MASTERING_MOSS=https://api.ilert.com/api/heartbeats/<secret>
ILERT_HEALTH_MASTERING_MOSS=https://masteringmoss.co.nz/health

# TradeMate NZ (shares BossBoard API health for now)
ILERT_HB_TRADEMATE_NZ=https://api.ilert.com/api/heartbeats/<secret>
ILERT_HEALTH_TRADEMATE_NZ=https://api.instilligent.com/health
```

Optional when ready:

- `ILERT_HB_R3_FLEET` + `ILERT_HEALTH_R3_FLEET`

**Never commit heartbeat URLs** — treat as secrets.

Get keys from ilert → Alert sources → source detail → Integration URL
(or API: `GET /api/alert-sources/{id}` while logged in).

## Verify

1. Deploy API with env set  
2. Logs: `[ilert-pinger] BOSSBOARD_API: health OK → heartbeat OK`  
3. ilert source status leaves **EXPIRED** within ~3 minutes  

## Do not

- Ping heartbeats from home Mac only for “Production” product names  
- Label home-agent heartbeats as Production product outages  

Home/Spark agent health can remain a **separate** source with a softer name.
