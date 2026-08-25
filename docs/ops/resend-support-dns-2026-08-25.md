# Resend bounce/SPF records for instilligent.com

Date: 2026-08-25
Do not resend Joan's invoice as part of this change.

## Why

BossBoard invoices send `From: BossBoard <noreply@instilligent.com>` via Resend (Amazon SES).
Joan (matherconsult.co.nz, also Microsoft 365) did not see INV-0002; Marc's BCC did.
Resend last_event was `delivered` — her tenant accepted the message; junk/quarantine is the remaining risk.

Resend domain `instilligent.com` is verified. DKIM `resend._domainkey` is in public DNS.
Resend also requires a bounce/SPF hostname `support`:

| Type | Name | Content |
|------|------|---------|
| MX | support | `feedback-smtp.ap-northeast-1.amazonses.com` (priority 10) |
| TXT | support | `v=spf1 include:amazonses.com ~all` |

Those two were **missing** from public DNS (2026-08-25 probes). Apex SPF stays Outlook-only:

`v=spf1 include:spf.protection.outlook.com -all`

Do not add `amazonses.com` to the apex SPF. Envelope-from for Resend is the `support` subdomain.

`support@instilligent.com` is unaffected: that address uses apex MX (Outlook).

## Apply

Zone-scoped Cloudflare token (`Zone:DNS:Edit` on instilligent.com only) in `CLOUDFLARE_API_TOKEN`:

```bash
python3 docs/ops/upsert_resend_support_dns.py
```

Then Resend domain re-check (from Railway): GET `/domains/4549f3c8-59ad-4f70-8c12-627141852888`.
Re-probe: `dig +short MX support.instilligent.com` and `dig +short TXT support.instilligent.com`.
