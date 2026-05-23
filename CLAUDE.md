# BossBoard - Mobile-First Compliance & Cashflow Platform

## Project Brain

**Version**: 0.5.0 | **Status**: Beta-Ready | **Updated**: 2026-05-12

> **Brand history**: This product was previously named "TradeMate NZ". Marc consolidated
> the product line into a single brand on 2026-05-11 (CF op `da31d539`); see
> recall PR #3 + Marc-direct 2026-05-12. The on-disk repo path
> `/home/marc/projects/trademate-nz` is the pre-rename legacy path; the GitHub
> repo rename `marc-2019/trademate-nz` → `marc-2019/bossboard` is a coordinated
> Marc-action pending. The Stripe metadata field `trademate_user_id` is a
> contract surface — do NOT rename without a coordinated Stripe-metadata
> migration. The third-party domain `trademate.co.nz` is owned by an
> unrelated company (Trademate NZ Ltd, WooCommerce sunscreen retailer) — do
> NOT link customers to it.

---

## What Is This Project?

BossBoard is a **mobile-first micro-SaaS platform** for New Zealand tradies and small service businesses (plumbers, electricians, builders, landscapers). Built by Instilligent Limited, leveraging RegTech expertise from Modular Compliance.

### Core Identity
- **Target Market**: 100-150k NZ SMEs (tradies, service businesses)
- **Price Point**: Less than a coffee a week ($4.99-$9.99 NZD/week)
- **Margins**: 85%+ gross margin target
- **Key Differentiator**: AI-powered NZ-specific compliance + full business management in one affordable app

### Business Model
- **Free tier**: 3 invoices/mo, 2 SWMS/mo, basic dashboard ($0)
- **Tradie tier**: Unlimited everything, single user ($4.99 NZD/week ~ $19.99/mo)
- **Team tier**: Everything + up to 5 team members ($9.99 NZD/week ~ $39.99/mo)
- Currently in **beta mode** - all features free for all users

### Product Modules
1. **Compliance + Business Module** (v0.5.0 - COMPLETE) - SWMS, invoicing, quotes, expenses, jobs, teams
2. **Cashflow Forecasting Module** (Q2-Q3 2026) - Xero integration
3. **Hiring/Visa Compliance Module** (Q3-Q4 2026)

### Competitor Analysis & Gaps We Fill

| Competitor | Price | Their Weakness | Our Advantage |
|------------|-------|----------------|---------------|
| Tradify | $30-50/mo | No offline, slow, basic compliance | Offline-first, AI compliance |
| Fergus | $53-75/mo | Overkill for solos, expensive | Right-sized, affordable |
| ServiceM8 | ~$40/mo | Battery drain, no offline, weak compliance | Efficient, offline, NZ-focused |
| Jobber | $50-100/mo | US-centric, no NZ compliance | 100% NZ-specific |

---

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React Native (Expo) | iOS + Android from single codebase |
| **Offline Storage** | SQLite (expo-sqlite) | Offline-first local database |
| **Backend** | Node.js/Express + TypeScript | API server |
| **Database** | PostgreSQL 16 | Primary data store |
| **Cache** | Redis 7 | Session cache, job queues |
| **AI Layer** | Claude API (Anthropic) | Compliance doc generation, suggestions |
| **Integrations** | Xero, Stripe NZ, Twilio | Accounting, payments, SMS |

### Services & Ports

> `docker-compose.yml` declares services with the `bossboard-*` prefix.
> Per-environment containers (e.g. `bossboard-dev-api`, `bossboard-staging-postgres`)
> are created from those services. The historical `trademate-*` prefix is no
> longer in use anywhere in compose state or CI — verified 2026-05-23.

| Service | Port | Purpose |
|---------|------|---------|
| bossboard-api | 29000 | Express API server |
| bossboard-postgres | 29432 | PostgreSQL database |
| bossboard-redis | 29379 | Redis cache |
| bossboard-web | 3000 | Next.js web app |

### Project Structure

```
/home/marc/projects/trademate-nz/   (legacy on-disk path; package.json name = "bossboard")
|-- apps/
|   |-- api/                    # Node.js/Express backend
|   |   |-- src/
|   |   |   |-- routes/         # API routes
|   |   |   |   |-- auth.ts           # Register, login, refresh, logout
|   |   |   |   |-- compliance.ts     # SWMS generation
|   |   |   |   |-- certifications.ts # Certification CRUD
|   |   |   |   |-- invoices.ts       # Invoice CRUD + send/paid/pdf/email
|   |   |   |   |-- quotes.ts         # Quote CRUD + convert to invoice
|   |   |   |   |-- expenses.ts       # Expense CRUD
|   |   |   |   |-- job-logs.ts       # Job log CRUD + clock in/out
|   |   |   |   |-- photos.ts         # Universal photo attachments
|   |   |   |   |-- teams.ts          # Team CRUD + invites + members
|   |   |   |   |-- subscriptions.ts  # Tier info, usage, limits
|   |   |   |   |-- stats.ts          # Dashboard stats + insights
|   |   |   |   `-- public.ts         # Public invoice sharing (no auth)
|   |   |   |-- services/       # Business logic
|   |   |   |   |-- claude.ts         # AI document generation
|   |   |   |   |-- pdf.ts            # PDF generation (invoices + quotes)
|   |   |   |   |-- email.ts          # Email service (Nodemailer)
|   |   |   |   |-- invoices.ts       # Invoice business logic
|   |   |   |   |-- quotes.ts         # Quote business logic
|   |   |   |   |-- expenses.ts       # Expense business logic
|   |   |   |   |-- job-logs.ts       # Job log business logic
|   |   |   |   |-- photos.ts         # Photo upload/management
|   |   |   |   |-- teams.ts          # Team management + invites
|   |   |   |   |-- subscriptions.ts  # Tier definitions + limits
|   |   |   |   |-- notifications.ts  # Push notifications (Expo)
|   |   |   |   |-- stats.ts          # Dashboard aggregation
|   |   |   |   `-- cron.ts           # Cert expiry checking
|   |   |   |-- middleware/
|   |   |   |   |-- auth.ts           # JWT authentication
|   |   |   |   `-- subscription.ts   # Tier/feature/limit gating
|   |   |   |-- templates/      # SWMS templates
|   |   |   `-- index.ts        # Entry point
|   |   `-- package.json
|   |
|   `-- mobile/                 # React Native (Expo)
|       |-- app/                # expo-router pages
|       |   |-- (auth)/         # Auth screens (login, register, verify, onboarding)
|       |   |-- (tabs)/         # Tab navigation (Home, Work, People, Money)
|       |   |-- invoices/       # Invoice create/detail screens
|       |   |-- quotes/         # Quote create/detail screens
|       |   |-- expenses/       # Expense list/create screens
|       |   |-- jobs/           # Job log screens
|       |   |-- settings.tsx    # Settings screen
|       |   |-- subscription.tsx # Subscription management
|       |   `-- team.tsx        # Team management
|       |-- src/
|       |   |-- contexts/       # AuthContext (user state, subscription tier)
|       |   |-- components/     # Reusable components (PhotoPicker, etc.)
|       |   |-- services/       # API client (all endpoint groups)
|       |   `-- hooks/          # Custom React hooks
|       `-- package.json
|
|-- packages/
|   `-- shared/                 # Shared types & utilities
|
|-- docs/                       # Documentation
|   |-- product/                # Product positioning, roadmap, gaps
|   |-- testing/                # Test plans
|   `-- technical/              # CortexForge integration, architecture
|
|-- database/                   # Migration SQL files (001-010)
|-- docker-compose.yml
|-- CLAUDE.md                   # This file - project brain
|-- README.md
`-- PORTS.md
```

---

## Module 1: Compliance (BUILD FIRST)

### Purpose
One-tap generation of NZ-specific safety documentation. Reduces admin burden and audit anxiety for tradies.

### MVP Features
1. **SWMS Generator** - Safe Work Method Statements pre-populated by trade type
2. **Risk Assessment Builder** - Site-specific hazard identification with AI suggestions
3. **WorkSafe Checklists** - Compliance checklists mapped to NZ Health & Safety at Work Act
4. **Certification Tracker** - Trade license expiry reminders
5. **PDF Export** - Professional documents for site submission

### Key NZ Regulations
- Health and Safety at Work Act 2015
- WorkSafe NZ Guidelines
- PCBU (Person Conducting a Business or Undertaking) duties
- Worker participation requirements

### AI Integration
Claude API provides:
- Hazard suggestions based on job description
- Control measure recommendations (hierarchy of controls)
- NZ-specific regulation references
- Auto-completion of common sections

---

## Module 2: Cashflow Forecasting (Q2-Q3)

### Purpose
AI-powered cash position forecasting via Xero integration. Addresses the #1 SME killer (51% cite cashflow as top issue).

### MVP Features
1. **Xero OAuth Connection** - One-tap authorisation
2. **Cash Position Dashboard** - Current balance + 30/60/90 day forecast
3. **Invoice Chaser** - Outstanding AR list with auto SMS/email reminders
4. **GST Countdown** - Due date alerts with estimated liability
5. **Weekly Summary** - Push notification with cash health score

---

## Module 3: Hiring/Visa Compliance (Q3-Q4)

### Purpose
Track employee visa status and compliance requirements. Urgent due to August 2026 NZ visa deadline changes.

### MVP Features
1. **Visa Tracker** - Employee visa type, expiry, conditions
2. **Document Vault** - Upload with expiry reminders
3. **AEWV Checklist** - Accredited Employer Work Visa compliance
4. **Audit Report** - One-tap 'immigration ready' PDF
5. **Certification Sync** - Trade license tracking

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Expo CLI (`npm install -g expo-cli`)
- Anthropic API key

### Local Development

```bash
# Clone and setup
cd /home/marc/projects/trademate-nz

# Start infrastructure
docker-compose up -d

# Install dependencies
npm install

# Start API (in separate terminal)
cd apps/api
npm run dev

# Start mobile (in separate terminal)
cd apps/mobile
expo start
```

### Environment Setup
Copy `.env.example` to `.env` and fill in your credentials.

---

## Key Files

### Project Root
| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file - project brain for all AI interactions |
| `docs/product/PRODUCT_AND_MARKET_POSITIONING.md` | Full product & market positioning document |
| `docs/CHANGELOG.md` | Version history (v0.1.0 through v0.5.0) |
| `docker-compose.yml` | Infrastructure (PostgreSQL, Redis) |
| `PORTS.md` | Port assignments |

### API (apps/api/src/)
| File | Purpose |
|------|---------|
| `index.ts` | API entry point |
| `middleware/auth.ts` | JWT authentication middleware |
| `middleware/subscription.ts` | Tier/feature/limit gating middleware |
| `routes/auth.ts` | Register, login, refresh, logout, verify, onboarding |
| `routes/invoices.ts` | Invoice CRUD + send/paid/pdf/email |
| `routes/quotes.ts` | Quote CRUD + convert to invoice |
| `routes/expenses.ts` | Expense CRUD with categories |
| `routes/job-logs.ts` | Job log CRUD + clock in/out |
| `routes/photos.ts` | Universal photo attachments |
| `routes/teams.ts` | Team CRUD + invites + members |
| `routes/subscriptions.ts` | Tier info, usage, limits |
| `routes/stats.ts` | Dashboard stats + insights |
| `routes/public.ts` | Public invoice sharing (no auth) |
| `services/claude.ts` | AI integration (SWMS generation) |
| `services/pdf.ts` | PDF generation (invoices + quotes) |
| `services/email.ts` | Email service (Nodemailer) |
| `services/subscriptions.ts` | Tier definitions, limits, beta mode |
| `services/teams.ts` | Team management + invites |
| `services/notifications.ts` | Push notifications (Expo Push API) |
| `services/cron.ts` | Cert expiry daily check |
| `services/stripe.ts` | Stripe billing — uses `trademate_user_id` metadata field (contract: do not rename without coordinated migration) |

### Mobile (apps/mobile/)
| File | Purpose |
|------|---------|
| `app/(auth)/login.tsx` | Login screen |
| `app/(auth)/register.tsx` | Registration screen |
| `app/(auth)/verify-email.tsx` | Email verification (6-digit code) |
| `app/(auth)/onboarding.tsx` | 3-step onboarding wizard |
| `app/(tabs)/_layout.tsx` | Tab navigation (Home, Work, People, Money) |
| `app/(tabs)/index.tsx` | Home screen with stats + insights |
| `app/(tabs)/work.tsx` | SWMS document list |
| `app/(tabs)/people.tsx` | Certifications list |
| `app/(tabs)/money.tsx` | Invoices + quotes list |
| `app/invoices/create.tsx` | Create invoice form |
| `app/invoices/[id].tsx` | Invoice detail (send, paid, PDF, email, share) |
| `app/quotes/create.tsx` | Create quote form |
| `app/expenses/index.tsx` | Expense list with filters |
| `app/jobs/index.tsx` | Job log list + clock in/out |
| `app/settings.tsx` | Settings screen |
| `app/subscription.tsx` | Subscription management + tier comparison |
| `app/team.tsx` | Team management + invites |
| `src/contexts/AuthContext.tsx` | User state + subscription tier |
| `src/services/api.ts` | API client (all endpoint groups) |

---

## APIs & Endpoints

### API Base URL: `http://localhost:29000`

### Health
- `GET /health` - Service health check

### Authentication
- `POST /auth/register` - Create account
- `POST /auth/login` - Login (email/password)
- `POST /auth/refresh` - Refresh JWT token
- `POST /auth/logout` - Logout
- `POST /auth/verify-email` - Verify email with 6-digit code
- `POST /auth/resend-verification` - Resend verification code
- `POST /auth/onboarding` - Complete onboarding (trade type, company, bank details)

### Compliance Module
- `GET /compliance/templates` - List available SWMS templates
- `GET /compliance/templates/:tradeType` - Get template for trade
- `POST /compliance/swms` - Generate SWMS document (AI-powered)
- `GET /compliance/swms/:id` - Get saved SWMS
- `POST /compliance/swms/:id/pdf` - Export to PDF
- `POST /compliance/ai/hazards` - AI hazard suggestions
- `POST /compliance/ai/controls` - AI control measures

### Certifications
- `GET /api/v1/certifications` - List certifications
- `POST /api/v1/certifications` - Add certification
- `GET /api/v1/certifications/expiring` - Get expiring certifications
- `GET /api/v1/certifications/:id` - Get certification
- `PUT /api/v1/certifications/:id` - Update certification
- `DELETE /api/v1/certifications/:id` - Delete certification

### Invoices
- `POST /api/v1/invoices` - Create invoice *(checkLimit: invoice)*
- `GET /api/v1/invoices` - List invoices (with ?status filter)
- `GET /api/v1/invoices/:id` - Get invoice
- `PUT /api/v1/invoices/:id` - Update invoice (draft only)
- `DELETE /api/v1/invoices/:id` - Delete invoice
- `POST /api/v1/invoices/:id/send` - Mark as sent
- `POST /api/v1/invoices/:id/paid` - Mark as paid
- `GET /api/v1/invoices/:id/pdf` - Download invoice PDF *(requireFeature: pdfExport)*
- `POST /api/v1/invoices/:id/email` - Email invoice to customer *(requireFeature: emailInvoice)*

### Quotes
- `POST /api/v1/quotes` - Create quote *(requireFeature: quotes)*
- `GET /api/v1/quotes` - List quotes (with ?status filter)
- `GET /api/v1/quotes/:id` - Get quote
- `PUT /api/v1/quotes/:id` - Update quote
- `DELETE /api/v1/quotes/:id` - Delete quote
- `GET /api/v1/quotes/:id/pdf` - Download quote PDF
- `POST /api/v1/quotes/:id/convert` - Convert quote to invoice

### Expenses
- `POST /api/v1/expenses` - Create expense *(requireFeature: expenses)*
- `GET /api/v1/expenses` - List expenses (with ?category filter)
- `GET /api/v1/expenses/:id` - Get expense
- `PUT /api/v1/expenses/:id` - Update expense
- `DELETE /api/v1/expenses/:id` - Delete expense

### Job Logs
- `POST /api/v1/job-logs` - Create/start job log *(requireFeature: jobLogs)*
- `GET /api/v1/job-logs` - List job logs
- `GET /api/v1/job-logs/active` - Get active (clocked-in) job
- `GET /api/v1/job-logs/:id` - Get job log
- `PUT /api/v1/job-logs/:id` - Update job log (clock out, add notes)
- `DELETE /api/v1/job-logs/:id` - Delete job log
- `GET /api/v1/job-logs/stats` - Job log statistics

### Photos
- `POST /api/v1/photos` - Upload photo *(requireFeature: photos)*
- `GET /api/v1/photos/:entityType/:entityId` - List photos for entity
- `GET /api/v1/photos/:id` - Get photo
- `DELETE /api/v1/photos/:id` - Delete photo

### Teams
- `POST /api/v1/teams` - Create team (user becomes owner)
- `GET /api/v1/teams/my-team` - Get current user's team
- `GET /api/v1/teams/:teamId` - Get team details
- `PUT /api/v1/teams/:teamId` - Update team name
- `GET /api/v1/teams/:teamId/members` - List members
- `DELETE /api/v1/teams/:teamId/members/:memberId` - Remove member
- `PUT /api/v1/teams/:teamId/members/:memberId/role` - Update member role
- `POST /api/v1/teams/:teamId/leave` - Leave team
- `POST /api/v1/teams/:teamId/invites` - Invite member *(checkLimit: teamMember)*
- `GET /api/v1/teams/:teamId/invites` - List pending invites
- `DELETE /api/v1/teams/:teamId/invites/:inviteId` - Cancel invite
- `GET /api/v1/teams/invites/pending` - My pending invites
- `POST /api/v1/teams/invites/:inviteCode/accept` - Accept invite
- `POST /api/v1/teams/invites/:inviteCode/decline` - Decline invite

### Subscriptions
- `GET /api/v1/subscriptions/tiers` - List all tier definitions
- `GET /api/v1/subscriptions/me` - Get current user's subscription
- `GET /api/v1/subscriptions/usage` - Get current usage stats
- `GET /api/v1/subscriptions/limits` - Get tier limits for current user

### Stats & Insights
- `GET /api/v1/stats/dashboard` - Dashboard stats (SWMS, invoices, certifications, insights)
  - Revenue comparison (this month vs last, % change)
  - Outstanding invoice aging (0-30, 31-60, 61-90, 90+ days)
  - Top 5 customers by revenue
  - Monthly revenue chart data (last 6 months)

### Public (No Auth)
- `GET /api/v1/public/invoices/:token` - View shared invoice (HTML page)

---

## Current Status

**Version**: 0.5.0 | **Phase**: Beta-Ready | **All Core Features Complete**

### What's Built (v0.1.0 - v0.5.0)

#### Foundation (v0.1.0)
- [x] Docker infrastructure (PostgreSQL 16, Redis 7)
- [x] Express API server with TypeScript
- [x] JWT authentication (register, login, refresh, logout)
- [x] AI-powered SWMS generation (Claude API)
- [x] SWMS templates (electrician, plumber, builder)
- [x] Database schema with 10 migrations
- [x] Test suite (33+ passing tests)
- [x] React Native/Expo mobile app with expo-router
- [x] Offline SQLite setup with sync queue

#### Business Features (v0.2.0)
- [x] Full invoicing system (CRUD + send/paid workflow)
- [x] Certifications API (CRUD + expiry tracking)
- [x] Dashboard stats (SWMS, invoices, certifications)
- [x] 4-tab navigation (Home, Work, People, Money)

#### Core Value Features (v0.3.0)
- [x] PDF generation (invoices + quotes via PDFKit)
- [x] Universal photo attachments (camera + gallery, all entities)
- [x] Quote/estimate builder (CRUD + convert to invoice)
- [x] Expense tracking (7 categories, receipt photos)
- [x] Job/site logger (clock in/out, timer, site address)
- [x] Push notifications (cert expiry at 30/14/7/1 days)
- [x] Team management (invite, accept/decline, roles: owner/admin/worker)
- [x] Recurring invoices (weekly/fortnightly/monthly/quarterly/annually)
- [x] Bank reconciliation (auto-matching with confidence scoring)

#### Growth Features (v0.4.0)
- [x] Client portal (shareable invoice links, no auth required)
- [x] Email invoice (one-tap send with PDF attachment)
- [x] Dashboard insights (revenue comparison, aging, top customers, chart data)

#### Monetisation Ready (v0.5.0)
- [x] Subscription tiers (free/tradie/team with limits + feature gating)
- [x] Subscription middleware (attachSubscription, requireTier, requireFeature, checkLimit)
- [x] Mobile subscription management screen
- [x] Email verification (6-digit code)
- [x] Password reset (6-digit code, Mobile + Web)
- [x] 3-step onboarding wizard (trade type, company details, bank details)
- [x] Beta mode (all users get tradie-level access)

### Database Migrations (10 total)
```
001_initial.sql            - users, swms_documents, certifications
002_quotes.sql             - quotes table
003_photos.sql             - universal photos table
004_job_logs.sql           - job_logs table
005_expenses.sql           - expenses table
006_teams.sql              - teams + team_members + invites
007_invoice_sharing.sql    - share_token on invoices
008_push_tokens.sql        - expo_push_token on users
009_subscription.sql       - subscription_tier, stripe fields on users
010_email_verification.sql - is_verified, verification_code on users
```

### Subscription Middleware Pattern
All feature routes use this middleware chain:
```typescript
// Basic auth only
router.get('/', authenticate, handler);

// Auth + subscription check for creation
router.post('/', authenticate, attachSubscription, checkLimit('invoice'), handler);

// Auth + feature gate
router.post('/', authenticate, attachSubscription, requireFeature('photos'), handler);
```

### What's Next (Unreleased)
- [ ] Stripe NZ integration (paid subscriptions - target: ~50 beta users)
- [ ] App Store submission (iOS + Android)
- [ ] Landing page and marketing site
- [ ] Xero integration (Module 2 - Cashflow Forecasting)
- [ ] Digital signature capture for SWMS
- [ ] In-app messaging (team chat)

---

## Development Workflow

### SDLC Phases
1. **Requirements** - User stories, acceptance criteria
2. **Design** - Architecture, API contracts
3. **Implementation** - Code development
4. **Testing** - Unit, integration, E2E
5. **Review** - Security, code review
6. **Deployment** - Staging, production

### Code Standards
- **TypeScript**: Strict mode, proper typing
- **API**: RESTful conventions, consistent error handling
- **Mobile**: React Native best practices, offline-first
- **Git**: Conventional commits (`feat:`, `fix:`, `docs:`)

### Testing Requirements
- Minimum 80% coverage for critical paths
- E2E tests for all user flows
- Offline functionality testing

---

## Integrations

### Anthropic Claude API
- Model: `claude-sonnet-4-20250514`
- Use cases: Hazard suggestions, control measures, document completion
- Rate limits: Respect API quotas

### Xero (Module 2)
- OAuth2 flow
- Scopes: `accounting.transactions.read`, `accounting.contacts.read`
- Webhook for real-time updates

### Stripe NZ (Planned - Phase B)
- Subscription billing via Stripe Checkout (no custom payment UI)
- NZ pricing: Tradie $4.99/wk, Team $9.99/wk
- Webhook for payment events
- `subscription_tier`, `stripe_customer_id`, `stripe_subscription_id` fields ready on users table

### Twilio
- SMS notifications
- Invoice reminders
- Two-factor auth

---

## Troubleshooting

### API Not Starting
```bash
# Check Docker containers
docker ps

# View logs
docker-compose logs bossboard-api

# Restart
docker-compose restart bossboard-api
```

### Database Connection Issues
```bash
# Check PostgreSQL
docker exec bossboard-postgres pg_isready -U bossboard

# Reset database
docker-compose down -v
docker-compose up -d
```

### Mobile Build Issues
```bash
# Clear Expo cache
expo start -c

# Reinstall dependencies
rm -rf node_modules
npm install
```

---

## Success Metrics

### Beta Phase (Current)
- 50 active users target
- 80% weekly retention
- All features free (beta mode)
- Trigger Stripe integration at ~50 users

### Paid Launch Phase
- 200 paying users in first 3 months
- <$2/user infrastructure cost
- 85%+ gross margin
- Target ARPU: $24 NZD/month (blended)

### Growth Phase
- 1,000 paying users by end of Year 1
- $288k ARR target
- Net Revenue Retention >100%

---

## CortexForge Integration

This project is managed by CortexForge and benefits from:
- **Compound Layer**: Nightly learning extraction and pattern identification
- **Context Store**: Institutional knowledge preservation
- **SDLC Automation**: Phase tracking and quality gates
- **Observability**: Usage metrics and error tracking

### Project Registration
| Field | Value |
|-------|-------|
| **CortexForge ID** | `495` |
| **Project Slug** | `trademate-nz` (legacy slug; canonical for the BossBoard product) |
| **Local Path** | `/home/marc/projects/trademate-nz` |
| **Primary Language** | TypeScript |
| **Framework** | React Native + Express |

### How to keep CF updated (verified 2026-05-23)

The HTTP API stanza previously shown here (port 9000) is **stale** — that
port is Portainer on the current host. CF integrates via a commit-watcher
that picks up two prefixes on `master`:

- `marc_decision(bossboard): ...` — decision records (typically paired with
  an `audit/marc-decision-{topic}-{YYYY-MM-DD}.md` file linked from the
  commit body). Verified: the commit-watcher writes a queue entry into
  `.cf-pending-reviews/{YYYYMMDDTHHMMSSZ}-cross-tree.{diff,meta.json}` per
  commit picked up.
- `compound_priority_item(bossboard): ...` — CF-originated items shipped by
  the autonomous executor (e.g. CF-LLM agent commits like `cca8983`).

Pattern in recent history (`git log --oneline -30 origin/master`) confirms
both prefixes are picked up. The `.cf-pending-reviews/` directory is the
canonical signal that CF saw a commit.

For SDLC phase updates and artifact registration, consult
`docs/technical/CORTEXFORGE_INTEGRATION.md` — but verify the host/port
before relying on any HTTP endpoint listed there; that doc may be subject
to the same staleness.

### Documentation
See [docs/technical/CORTEXFORGE_INTEGRATION.md](docs/technical/CORTEXFORGE_INTEGRATION.md) for full API reference and update procedures.

---

## References

- [Health and Safety at Work Act 2015](https://www.legislation.govt.nz/act/public/2015/0070/latest/DLM5976660.html)
- [WorkSafe NZ](https://www.worksafe.govt.nz/)
- [Xero API Documentation](https://developer.xero.com/)
- [Expo Documentation](https://docs.expo.dev/)
- [Claude API Documentation](https://docs.anthropic.com/)

---

**Ready to work?**
1. Check `PORTS.md` for service ports
2. Run `docker-compose up -d` to start infrastructure
3. Use conventional commits for all changes
4. Run tests before committing
