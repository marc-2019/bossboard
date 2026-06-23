# BossBoard — Pre-Submission Checklist

**Version**: 0.5.0 | **Last Updated**: February 23, 2026

This checklist covers everything needed to go from current state to iOS App Store + Google Play submission.

---

## Status Legend

- [x] Done
- [ ] **Requires your action**

---

## 1. Codebase Readiness

### Completed
- [x] All 57 screen files created across 12 feature directories
- [x] All 12 feature directories have `_layout.tsx` navigation files
- [x] TypeScript API builds with zero errors
- [x] TypeScript mobile builds with zero errors
- [x] Store listing metadata prepared (`store-listing.json`)
- [x] App icon, splash, adaptive-icon, notification-icon assets generated
- [x] `app.json` fully configured (permissions, privacy manifests, plugins)
- [x] `eas.json` build profiles configured (development, preview, production)
- [x] Railway deployment config prepared (`railway.toml`, `Dockerfile.api`)
- [x] Database migrations ready (init.sql + 001–010)
- [x] Screenshots guide created (`docs/APP_STORE_SCREENSHOTS.md`)
- [x] EAS project initialized (project ID: `e5d4e8a5-631b-45c8-8e29-2a7c88981c02`)
- [x] Privacy policy served from API at `/legal/privacy`
- [x] Terms of service served from API at `/legal/terms`
- [x] Support page served from API at `/legal/support`

### Requires Action
- [ ] **Run `npx expo install --check`** in `apps/mobile/` to verify dependency compatibility
- [ ] **Run `npx expo-doctor`** to check for common issues
- [ ] **Test a local dev build** with `eas build --profile development --platform all`

---

## 2. Placeholders to Replace

These `REPLACE_ME_*` values exist in config files and MUST be set before building.

### app.json (0 placeholders — DONE)

All placeholders have been filled. EAS project ID `e5d4e8a5-631b-45c8-8e29-2a7c88981c02` is set in both `extra.eas.projectId` and `updates.url`.

### eas.json (6 placeholders)

| Location | Current Value | What You Need |
|----------|---------------|---------------|
| `build.preview.env.EXPO_PUBLIC_API_URL` | `https://api.instilligent.com` | Your Railway deployment URL (e.g., `https://api.instilligent.com`) |
| `build.production.env.EXPO_PUBLIC_API_URL` | `https://api.instilligent.com` | Same Railway URL |
| `submit.production.ios.ascAppId` | `REPLACE_ME_APP_STORE_CONNECT_APP_ID` | From App Store Connect > App Information > Apple ID |
| `submit.production.ios.appleTeamId` | `REPLACE_ME_APPLE_TEAM_ID` | From developer.apple.com > Membership > Team ID |
| `submit.preview.ios.ascAppId` | `REPLACE_ME_APP_STORE_CONNECT_APP_ID` | Same as production |
| `submit.preview.ios.appleTeamId` | `REPLACE_ME_APPLE_TEAM_ID` | Same as production |

### store-listing.json (2 placeholders)

| Location | Current Value | What You Need |
|----------|---------------|---------------|
| `contact.phone` | `+64 XX XXX XXXX` | Real NZ business phone number |
| `reviewAccount.password` | `SET_BEFORE_SUBMISSION` | Password for the reviewer@instilligent.com test account |

---

## 3. Missing Files

These files are referenced in config but don't exist yet.

| File | Referenced By | How to Get It |
|------|--------------|---------------|
| `apps/mobile/google-services.json` | `app.json` > android.googleServicesFile | Firebase Console > Project Settings > Add Android app > Download `google-services.json` |
| `apps/mobile/google-service-account.json` | `eas.json` > submit.production.android.serviceAccountKeyPath | Google Cloud Console > IAM > Service Accounts > Create key (JSON) with Play Console permissions |

**Note**: If you're not using Firebase/push notifications on Android initially, you can remove the `googleServicesFile` line from `app.json` temporarily.

---

## 4. Accounts & Services Setup

### Apple (iOS submission)
- [x] **Apple Developer Program** ($99 USD/year) — enrolled at developer.apple.com
- [ ] **Create App in App Store Connect** — generates the App ID needed for `ascAppId`
- [ ] **Note your Team ID** from Membership page — needed for `appleTeamId`

### Google (Android submission)
- [x] **Google Play Console** ($25 one-time) — enrolled at play.google.com/console
- [ ] **Create app listing** in Play Console
- [ ] **Create Firebase project** for push notifications (optional for v1)
- [ ] **Create service account** with Play Console API access for automated submission

### Expo (build service)
- [x] **Create Expo account** at expo.dev (free tier works)
- [x] **Run `eas init`** to link project — EAS project ID set: `e5d4e8a5-631b-45c8-8e29-2a7c88981c02`
- [ ] **Run `eas credentials`** to configure signing certificates

---

## 5. Backend Deployment (Railway)

Full guide: `memory/railway-deployment-guide.md`

### Steps
- [ ] **Create Railway project** at railway.app
- [ ] **Add PostgreSQL service** (Railway plugin)
- [ ] **Add Redis service** (Railway plugin)
- [ ] **Deploy API** from GitHub repo (or `railway up`)
- [ ] **Run database migrations** using `scripts/migrate-railway.sh`
- [ ] **Set environment variables** (see section 6 below)
- [ ] **Note the deployment URL** — needed for `EXPO_PUBLIC_API_URL` in eas.json

---

## 6. Production Environment Variables

Set these in Railway dashboard. Reference: `.env.production.example`

### Required — App Won't Start Without These

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `PORT` | Auto-set by Railway | Don't set manually |
| `DATABASE_URL` | Auto-injected by Railway PostgreSQL plugin | |
| `REDIS_URL` | Auto-injected by Railway Redis plugin | |
| `JWT_SECRET` | Generate: `openssl rand -hex 32` | 64-char hex string |
| `JWT_REFRESH_SECRET` | Generate: `openssl rand -hex 32` | Different from JWT_SECRET |
| `ANTHROPIC_API_KEY` | From console.anthropic.com | For AI SWMS generation |
| `CORS_ORIGINS` | Your Railway URL | e.g., `https://api.instilligent.com` |

### Required for Email Features

| Variable | Value | Notes |
|----------|-------|-------|
| `SMTP_HOST` | Your email provider | e.g., `smtp.gmail.com`, `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` | TLS port |
| `SMTP_USER` | Email account | |
| `SMTP_PASS` | Email password or app password | |
| `SMTP_FROM_NAME` | `TradeMate NZ` | Configurable branding |
| `SMTP_FROM_EMAIL` | `noreply@yourdomain.com` | |

### Optional — Can Add Later

| Variable | Value | Notes |
|----------|-------|-------|
| `APP_NAME` | `TradeMate NZ` | Configurable if name changes |
| `APP_DOMAIN` | `https://yourdomain.com` | For links in emails |
| `STORAGE_TYPE` | `local` | Switch to `s3` later if needed |
| `STORAGE_PATH` | `/app/uploads` | Railway persistent volume |
| `LOG_LEVEL` | `info` | |

### Phase B — Stripe (Not Needed Yet)

| Variable | Notes |
|----------|-------|
| `STRIPE_SECRET_KEY` | After 50 beta users |
| `STRIPE_WEBHOOK_SECRET` | After 50 beta users |
| `STRIPE_PRICE_TRADIE` | After creating Stripe products |
| `STRIPE_PRICE_TEAM` | After creating Stripe products |

---

## 7. Legal & Support Pages (DONE)

Privacy policy, terms of service, and support pages are now served directly from the API as server-rendered HTML pages. No separate website or hosting is needed for store submission.

| URL | Purpose | Required For | Status |
|-----|---------|-------------|--------|
| `https://api.instilligent.com/legal/privacy` | Privacy policy | Both stores (mandatory) | Done |
| `https://api.instilligent.com/legal/terms` | Terms of service | Both stores | Done |
| `https://api.instilligent.com/legal/support` | Support page | Both stores | Done |

These URLs are already configured in `store-listing.json`. They will go live once the API is deployed to Railway at the `api.instilligent.com` domain.

**Note**: A marketing/landing page is not required for store submission but can be added later at `instilligent.com/trademate` or similar.

---

## 8. App Store Screenshots

Guide: `docs/APP_STORE_SCREENSHOTS.md`

- [ ] **Seed demo data** into a test account (invoices, quotes, expenses, certifications)
- [ ] **Capture 5 required screenshots** on iPhone 15 Pro Max (6.7") and iPhone 8 Plus (5.5")
- [ ] **Capture phone screenshots** for Google Play (16:9 ratio)
- [ ] **Create 1024x500 feature graphic** for Google Play
- [ ] **Add title overlays** to screenshots (optional but recommended)

---

## 9. Submission Sequence

### Phase A: First Build Test
```bash
cd apps/mobile

# 1. Install/verify dependencies
npx expo install --check

# 2. eas init already done — project ID is e5d4e8a5-631b-45c8-8e29-2a7c88981c02

# 3. Build development APK (test on real device)
eas build --profile development --platform android

# 4. Build iOS simulator (if on Mac)
eas build --profile development --platform ios
```

### Phase B: Preview Build (Internal Testing)
```bash
# After Railway is deployed and URL is set in eas.json:

# 1. Build preview APK
eas build --profile preview --platform android

# 2. Build preview IPA (needs Apple credentials)
eas build --profile preview --platform ios

# 3. Distribute to testers via EAS
```

### Phase C: Production Submission
```bash
# After all placeholders replaced, screenshots ready, legal pages live:

# 1. Production build
eas build --profile production --platform all

# 2. Submit to stores
eas submit --profile production --platform ios
eas submit --profile production --platform android

# 3. Fill in store listings manually in App Store Connect and Google Play Console
```

---

## 10. Pre-Flight Final Checks

Before hitting submit:

- [ ] All `REPLACE_ME_*` placeholders replaced (6 remaining in eas.json)
- [ ] API deployed and `/health` endpoint responding
- [ ] Legal pages live at `https://api.instilligent.com/legal/*`
- [ ] Test account created (reviewer@instilligent.com) with demo data
- [ ] All 5+ screenshots uploaded per platform
- [ ] App description matches current features
- [ ] Version number is 0.5.0 (or later)
- [ ] Push notifications tested on real device
- [ ] Offline mode tested (airplane mode, then reconnect)
- [ ] All CRUD flows tested (create, read, update, delete)
- [ ] PDF generation tested (invoices, quotes)
- [ ] Photo upload tested (camera + gallery)

---

## Quick Reference: What's Done vs What You Need

### Done
| Item | Status |
|------|--------|
| 57 mobile screens | Complete |
| 12 _layout.tsx navigation files | Complete |
| API TypeScript (zero errors) | Complete |
| Mobile TypeScript (zero errors) | Complete |
| app.json configuration | Complete (0 placeholders) |
| eas.json build profiles | Complete (6 placeholders remaining) |
| store-listing.json metadata | Complete (2 placeholders: phone, reviewer password) |
| EAS project initialized | Complete (ID: `e5d4e8a5-...981c02`) |
| App assets (icon, splash, etc.) | Generated |
| Railway config (railway.toml, Dockerfile) | Complete |
| Database migrations (11 files) | Complete |
| Privacy policy (API-served) | Complete (`/legal/privacy`) |
| Terms of service (API-served) | Complete (`/legal/terms`) |
| Support page (API-served) | Complete (`/legal/support`) |
| Apple Developer enrollment | Complete |
| Google Play Console enrollment | Complete |
| Screenshots guide | Complete |
| This checklist | Complete |

### Needs Your Action
| Item | Priority | Est. Time |
|------|----------|-----------|
| Deploy API to Railway | High | 30 min |
| Set env vars in Railway | High | 15 min |
| Create App in App Store Connect (get `ascAppId`) | High | 15 min |
| Note Apple Team ID (get `appleTeamId`) | High | 5 min |
| Set Railway URL in eas.json (2 places) | High | 5 min |
| Create Firebase project + google-services.json | Medium | 15 min |
| Create Google service account | Medium | 15 min |
| Run `eas credentials` for signing certs | Medium | 15 min |
| Capture screenshots | Medium | 1-2 hours |
| Seed demo data for reviewer | Medium | 30 min |
| Set reviewer account password in store-listing.json | Medium | 5 min |
| Set phone number in store-listing.json | Medium | 5 min |
| Final branding decision | Low (can ship as TradeMate NZ) | Ongoing |
| Set up Stripe (Phase B) | Low | After 50 users |
