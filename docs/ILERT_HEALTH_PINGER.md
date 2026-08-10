# ilert production monitoring (BossBoard)

## Problem (2026-08-11)

ilert emailed “Production: bossboard-* is DOWN” when **home internet** failed.

Those sources are **Heartbeat** integrations (interval 180s). A pinger must
`GET https://api.ilert.com/api/heartbeats/<key>` regularly. When the pinger
host loses network, heartbeats **expire** even if Railway apps are healthy.

## Fix

Cloud-side pinger in **bossboard-api** cron (`apps/api/src/services/ilert-health-pinger.ts`):

1. Probe public health URL  
2. Only if healthy → ping ilert heartbeat  

Runs every **2 minutes** when enabled.

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

Optional same pattern for other products once health URLs are known:

- `ILERT_HB_MODULAR_COMPLIANCE` + `ILERT_HEALTH_MODULAR_COMPLIANCE`
- `ILERT_HB_MASTERING_MOSS` + `ILERT_HEALTH_MASTERING_MOSS`
- `ILERT_HB_R3_FLEET` + `ILERT_HEALTH_R3_FLEET`
- `ILERT_HB_TRADEMATE_NZ` + `ILERT_HEALTH_TRADEMATE_NZ` (can share API health)

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
