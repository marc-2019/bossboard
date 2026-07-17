# In-App Feedback Capture (Lane A)

**BossBoard implements** Instilligent’s universal product feedback pattern.  
**SSOT:** `cortexforge/docs/governance/product-feedback-universal-pattern-2026-07-17.md`  
**Migration:** `database/migrations/017_feedback.sql`

Products capture feedback in their **own** database; CortexForge ingests via service-token poller (products on Railway cannot call CF loopback).

## Surfaces

| Surface | Affordance |
|---------|------------|
| Web | Sidebar footer **Send feedback** → modal (`feedback-button.tsx`) |
| Mobile | Settings → **Send Feedback** → `app/settings/feedback.tsx` |
| Fallback | mailto:support@instilligent.com (secondary only) |

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/feedback` | User JWT |
| GET | `/api/v1/feedback` | User JWT (own only) |
| GET | `/api/v1/feedback/export` | Service token |
| PATCH | `/api/v1/feedback/:id/status` | Service token |

Service token: `FEEDBACK_SERVICE_TOKEN` (or `SERVICE_TOKEN`).  
Headers: `Authorization: Bearer …` or `X-Service-Token: …`.

Body fields: `category` (`bug`\|`idea`\|`other`\|`rating`), `message`, optional `rating`, `pageContext`, `appVersion`.

## CF registration

```json
[
  {
    "product": "bossboard",
    "url": "https://<api-host>/api/v1/feedback/export?status=new",
    "api_key_env": "BOSSBOARD_FEEDBACK_SERVICE_TOKEN"
  }
]
```

Env `PRODUCT_FEEDBACK_SOURCES` for `task_product_feedback_poller.py`.
