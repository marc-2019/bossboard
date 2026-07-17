# App Review reply package — Guideline 2.1 Information Needed

**Rejection:** iOS 1.0 / **0.5.0 (5)** — 2026-03-19  
**Submission ID:** `db6c8996-bb1a-418b-a2b5-4669cb9da497`  
**Guideline:** 2.1 Performance: App Completeness / Information Needed  
**Resubmit with:** new build (recommend **0.5.1+** dual-rail IAP) + this package in **App Review Information → Notes**

Paste the **“ASC Notes (paste-ready)”** section into App Store Connect. Attach the screen recording per checklist.

---

## Status of infra (2026-07-18)

| Item | Status |
|------|--------|
| `IAP_APPLE_SHARED_SECRET` on Railway `bossboard-api` | **SET** (len confirmed; value never logged) |
| IAP product ID env vars | SET (Tradie/Team weekly) |
| API health | 200 |
| Dual-rail IAP on master | Yes (native StoreKit on iOS) |
| Public App Store | Still rejected / not live until resubmit accepted |

---

## 1. Screen recording checklist (physical device)

Record on a **real iPhone** (not Simulator). Start cold-launch. Aim 2–4 minutes, silent or soft voiceover.

| # | Show | Notes |
|---|------|--------|
| 1 | **Launch** splash → home | Cold start |
| 2 | **Register** or **Login** | Use demo account (below) |
| 3 | **Core flow A — SWMS** | New SWMS → trade type → generate (AI optional) → list |
| 4 | **Core flow B — Invoice** | Invoices list → open/create draft if possible |
| 5 | **Permissions** | If prompted: camera and/or location — allow once so purpose strings appear |
| 6 | **Subscription / paid** | Settings → Subscription → show Tradie/Team prices; if IAP products active, open purchase sheet (Sandbox OK); show **Restore Purchases** |
| 7 | **Account deletion** | Settings → path to delete account (or Settings → open https://api.instilligent.com/legal/delete-account ) |
| 8 | **Feedback** (optional) | Settings → Send Feedback |

**Upload:** App Store Connect → App Review Information → attach video, **and** reply in Messages with “recording attached / link”.

---

## 2. App purpose (for Notes)

BossBoard is an all-in-one business app for **New Zealand tradies** (builders, electricians, plumbers, and similar sole traders and small crews). It solves fragmented job admin: compliance documents (SWMS), quoting/invoicing, certifications, job logs, expenses, and team seats in one place. Value: less admin time, clearer compliance records, and simple subscription tiers (Free / Tradie / Team) so a tradie can run the business from a phone.

---

## 3. How to review + demo credentials

**Primary environment:** Production API `https://api.instilligent.com` · marketing `https://bossboard.instilligent.com`

### Demo account (Marc: create before resubmit if missing)

| Field | Value |
|-------|--------|
| Email | `apple-review@instilligent.com` *(or existing review account)* |
| Password | *(set in ASC App Review Information → Sign-in required; also paste in Notes)* |
| Notes | Account is **Tradie-tier or free with full demo data**; not a production customer. Password rotated after each major review if shared broadly. |

**Main feature path for reviewer:**

1. Launch → Log In with demo credentials.  
2. Home → **New SWMS** → pick trade → enter short job description → Generate → open document.  
3. **Invoices** → view list (session refresh supported on web; mobile uses API JWT).  
4. **Settings → Subscription** → view Free / Tradie ($4.99 NZD/wk) / Team ($9.99 NZD/wk); **Restore Purchases** available.  
5. **Settings → Send Feedback** → optional.  
6. Account deletion: Settings → follow in-app link, or open  
   `https://api.instilligent.com/legal/delete-account`

**Sign-in required:** Yes  
**Contact:** Marc Armstrong · `marmstrong@instilligent.com` · same as ASC team contact  

---

## 4. External services / platforms (core functionality)

| Service | Role |
|---------|------|
| **Instilligent BossBoard API** (`api.instilligent.com`) | Auth, SWMS, invoices, subscriptions, feedback |
| **PostgreSQL / Redis** (Railway) | App data + session/cache |
| **Stripe** | **Web** billing only (not primary unlock path inside iOS binary) |
| **Apple In-App Purchase / StoreKit** | iOS paid subscription unlock (Tradie / Team weekly) |
| **Anthropic Claude API** | Optional AI hazard/control suggestions when generating SWMS |
| **Sentry** | Crash/error monitoring |
| **Expo / EAS** | Build & updates infrastructure |
| **Resend / SMTP** | Transactional email (verification, invoices) |
| **GA4** (server Measurement Protocol) | Analytics events (no ads / ATT required for ads) |

---

## 5. Regional differences

The app is built for **New Zealand** tradies (GST-oriented pricing display, NZ privacy framing, NZ-focused compliance SWMS language). Feature set is **consistent** across App Store regions where the app is available; there is no separate country-gated feature matrix. Pricing is displayed in **NZD**. No region-specific content packs.

---

## 6. Regulated industry

BossBoard helps tradies create **workplace safety documentation (SWMS)** and business records. It is **not** a medical device, not a bank, and not a licensed professional practice management system. Users remain responsible for accuracy of safety documents and for complying with NZ law (e.g. HSWA). We do **not** claim to be a regulator or to issue official certifications. No special industry licence is required to offer this software tool.

---

## ASC Notes (paste-ready)

Copy everything between the lines into **App Review Information → Notes**:

```
BossBoard (nz.instilligent.bossboard) — App Review Information

PURPOSE
BossBoard is an all-in-one mobile business app for New Zealand tradies (builders, electricians, plumbers, small crews). It combines SWMS/compliance documents, invoices/quotes, certifications, job logs, expenses, and optional team seats so sole traders spend less time on admin. Primary audience: NZ tradespeople.

DEMO LOGIN
Email: apple-review@instilligent.com
Password: [MARC: paste password here]
Sign-in required: Yes

HOW TO REVIEW CORE FEATURES
1. Launch app → Log In with demo credentials above.
2. Home → New SWMS → select trade → enter a short job description → Generate → open the SWMS.
3. Open Invoices → view list / create if prompted.
4. Settings → Subscription → view Free / Tradie (NZ$4.99/week) / Team (NZ$9.99/week). Use Restore Purchases if needed. Sandbox Apple ID may be used for IAP.
5. Settings → Send Feedback (optional).
6. Account deletion: open https://api.instilligent.com/legal/delete-account or in-app Settings link.

SCREEN RECORDING
Physical-device recording attached: cold launch → login → SWMS generate → invoices → subscription screen (prices + restore) → account deletion info. Includes any system permission prompts (camera/location) if shown.

EXTERNAL SERVICES
- BossBoard API (api.instilligent.com): auth, data, subscriptions, feedback
- Apple IAP/StoreKit: iOS paid subscription unlock
- Stripe: web billing only (not used to unlock iOS digital features as primary path)
- Anthropic Claude API: optional AI suggestions inside SWMS generation
- Sentry: crash reporting
- Railway (Postgres/Redis): hosting
- Resend: email
- GA4 Measurement Protocol: analytics (no advertising ID tracking for ads)

REGIONAL
Built for New Zealand (NZD pricing, NZ privacy/compliance language). Features work consistently in all regions where the app is available; no separate regional feature forks.

REGULATED INDUSTRY
Software tool for business/compliance documentation. Not a medical device, financial licence product, or government service. Users remain responsible for SWMS accuracy and legal compliance.

LEGAL
Privacy: https://api.instilligent.com/legal/privacy
Terms: https://api.instilligent.com/legal/terms
Support: https://api.instilligent.com/legal/support
Delete account: https://api.instilligent.com/legal/delete-account

CONTACT
Marc Armstrong — marmstrong@instilligent.com — Instilligent Limited
```

---

## Also set in App Review Information fields

| Field | Value |
|-------|--------|
| Sign-in required | **Yes** |
| User name | demo email |
| Password | demo password |
| Contact email | marmstrong@instilligent.com |
| Contact phone | *(Marc)* |
| Notes | Full paste-ready block above |

### Subscription metadata (3.1.2 prevention)

On **Subscription** screen and ASC metadata, ensure:

- Title, duration, price for Tradie & Team  
- Links: Terms + Privacy (URLs above)  
- Restore Purchases visible  

---

## Resubmit sequence (order)

1. [x] DPLA accepted; shared secret on Railway  
2. [ ] ASC: weekly IAP products live / ready for review  
3. [ ] Create/rotate **apple-review** demo account on prod  
4. [ ] Screen recording on physical device  
5. [ ] EAS **new iOS build** (0.5.1+ dual-rail IAP) → TestFlight → select for App Review  
6. [ ] Paste Notes + credentials + attach recording  
7. [ ] Reply in App Review message thread: “Additional information provided; new build X uploaded”  
8. [ ] Submit for Review  

---

## CF tracking

- Secret: `IAP_APPLE_SHARED_SECRET` on `bossboard-api` only (never git).  
- Rejection context: this file + submission id above.  
- Related: `APPLE_STORE_LAUNCH.md`, `apple-dpla-2026-07-18-bossboard-cf-checklist.md`, dual-rail IAP.  

---

## Changelog

- 2026-07-18: Package for March 2026 2.1 rejection; secret verified SET on Railway.
