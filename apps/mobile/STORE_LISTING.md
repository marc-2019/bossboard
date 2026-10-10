# BossBoard - App Store Listing

## App Name
**BossBoard** (iOS & Android)

## Short Description (80 chars)
Invoicing, quotes & job records for NZ tradies. GST built in.

## Subtitle (iOS, 30 chars)
Invoicing, Quotes & Jobs

## Full Description (4000 chars max)

Source of truth: `apps/mobile/store-listing.json` (`descriptions.full`). Keep the two identical.

### English (NZ)

BossBoard is invoicing, quotes and job records for New Zealand tradespeople: sparkies, plumbers, builders, landscapers and other trades.

Start on the Free tier, then upgrade in the app to Tradie or Team when you need more invoices, SWMS and team seats. iOS subscriptions are billed through the App Store.

INVOICING & QUOTES
- Create GST-inclusive or GST-exclusive invoices with 15% GST built in
- Professional PDF invoices with your business details
- Email invoices to customers with one tap
- Share an invoice with your customer by link
- Build quotes and convert them to invoices with one tap
- Track draft, sent and paid statuses

JOB LOGGING
- One-tap clock in and clock out
- Hours per site and per worker
- Site address, notes and photos for every job

EXPENSES
- Seven expense categories for trades, including subcontractors
- Receipt photo capture from camera or gallery

TEAM
- Invite team members by email (Team plan, up to 5)
- Roles: Owner, Admin, Worker

CERTIFICATIONS
- Track trade licences and certifications
- Push reminders 30, 14, 7 and 1 day before expiry

SWMS DRAFTS
- AI-assisted SWMS drafts with hazard and control suggestions for your trade
- SWMS templates aligned to the Health and Safety at Work Act 2015 — you stay the PCBU and sign off.
- PDF export
Templates and starting material, not legal advice.

DASHBOARD
- Revenue this month vs last month
- Outstanding invoice aging (0-30, 31-60, 61-90, 90+ days)
- Top customers by revenue

BUILT FOR NEW ZEALAND
- 15% GST
- NZD pricing
- NZ trade licence types
- Works offline and syncs when back online

Questions or feedback? support@instilligent.com

BossBoard is a product of Instilligent Limited, New Zealand.

---

## Keywords (100 chars)
tradies, invoicing, quotes, GST, NZ, SWMS, job log, HSWA, business, tradesperson

## Categories

### iOS
- Primary: Business
- Secondary: Productivity

### Android
- Primary: Business
- Secondary: Productivity

## Age Rating
- 4+ (iOS)
- Everyone (Android) — complete **IARC content rating** in Play Console (do not leave unrated)
- **Not designed for children** / not Families Policy program
- No objectionable content; multi-user within a business, not anonymous chat

## Privacy Policy URL
https://api.instilligent.com/legal/privacy  
(Source of truth for store + in-app: also `apps/mobile/PRIVACY_POLICY.md` — keep in sync)

## Support URL
https://api.instilligent.com/legal/support

## Marketing URL
https://bossboard.instilligent.com

## Android package
`nz.instilligent.bossboard`  
**Expo SDK 54** defaults `targetSdkVersion` **36** (meets Play requirement for new apps/updates from 31 Aug 2026).

---

## Google Play — Data safety worksheet (copy into Play Console)

**Data shared with third parties for advertising / selling:** No.

| Data type | Collected | Optional | Linked to user | Purpose | Notes |
|-----------|-----------|----------|----------------|---------|--------|
| Name | Yes | Yes | Yes | App functionality | Account |
| Email | Yes | No | Yes | App functionality | Login |
| Phone | Yes | Yes | Yes | App functionality | Account |
| User ID | Yes | No | Yes | App functionality, security | |
| Photos | Yes | Yes | Yes | App functionality | Job / receipt / site photos — user initiated |
| Approximate location | Yes | Yes | Yes | App functionality | Job site address assist — when permission granted |
| Precise location | Yes | Yes | Yes | App functionality | Same; `ACCESS_FINE` + when-in-use |
| App interactions / diagnostics | Yes | — | Yes | Analytics, crash | Not ads |
| Other user content | Yes | Yes | Yes | App functionality | SWMS text, job descriptions, site/client fields |

### Third-party AI (Play User Data policy — limited use / disclosure / consent)

| Item | Declaration |
|------|-------------|
| Provider | Anthropic (commercial API), via BossBoard backend |
| When | User enables **AI-assisted generation** on SWMS generate and runs generation |
| Data sent | Trade type, job description, site details the user entered (not passwords / cards) |
| Purpose | Hazard and control suggestions for SWMS only |
| Not used for | Ads, resale, tracking |
| Consent | In-app toggle; off = no third-party AI call for that request |
| Privacy | See PRIVACY_POLICY.md §4.1 |

### Permissions declared (app.json) — do not add without policy review

- `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, boot completed, vibrate, internet, network state  
- **Not** used: `READ_SMS`, `RECEIVE_SMS`, `READ_CALL_LOG`, `CALL_LOG`

### Play Console operator checklist (Marc)

- [ ] Android Developer Verification — package registered  
- [ ] Content rating completed (not unrated)  
- [ ] Data safety form matches this worksheet  
- [ ] Privacy policy URL live and includes AI limited-use section  
- [ ] Target audience not “children”  
- [ ] Before paid Android launch: native Play Billing (see CF `app-store-native-iap-requirement-2026-06-30.md`)

---

## Screenshots Required

### iPhone (6.7" - iPhone 15 Pro Max)
Titles mirror `store-listing.json` `screenshots.titles`:
1. Dashboard - "Your business at a glance - revenue & quick actions"
2. SWMS Generator - "Draft SWMS aligned to the HSWA 2015 - you sign off as PCBU"
3. Invoice Creation - "Professional invoices with GST - create, send & track"
4. Expense Tracking - "Track expenses & snap receipt photos on the go"
5. Team Management - "Manage your team with role-based access & invites"

### iPad (12.9")
Same 5 screens, optimised for tablet

### Android Phone
Same 5 screens

### Android Tablet (7")
Same 5 screens, optimised for tablet

---

## App Preview Video (Optional)
Short demo showing:
1. Opening the app - dashboard overview
2. Creating a quote and converting it to an invoice
3. Clocking in to a job and adding site photos
4. Logging an expense with a receipt photo
5. Drafting a SWMS (you stay the PCBU and sign off)
6. "Run your business like a boss" tagline

---

## Version History

### 0.5.0 (Current)
- Complete rebrand to BossBoard
- Invoicing, quotes and payment status
- Job logging with clock in/out
- Expense tracking with receipt photos
- Team management with roles
- Certification expiry reminders
- AI-assisted SWMS drafts
- Offline support with sync
- PDF export

---

## Contact Information

**Developer Name**: Instilligent Limited
**Email**: support@bossboard.co.nz
**Address**: Auckland, New Zealand
**Website**: https://bossboard.co.nz
