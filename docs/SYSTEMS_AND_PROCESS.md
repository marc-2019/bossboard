# Instilligent — Systems Map & Reusable Product Process

**Purpose**: A single source of truth for all systems, services, and the repeatable process we use to take any idea from concept to market. Designed to be reusable across all Instilligent products.

**Owner**: Instilligent Limited | **Updated**: March 2026

---

## Part 1: Complete Systems Map

### 1.1 System Architecture (All Products)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INSTILLIGENT PLATFORM                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  BossBoard   │  │  [Future     │  │  [Future     │              │
│  │  (Product 1) │  │  Product 2]  │  │  Product 3]  │              │
│  └──────┬───────┘  └──────────────┘  └──────────────┘              │
│         │                                                           │
│  ┌──────┴────────────────────────────────────────────────────┐     │
│  │                    PRODUCT LAYER                           │     │
│  │                                                            │     │
│  │  Mobile App ──── API Server ──── Web App                   │     │
│  │  (Expo/RN)      (Express/TS)    (Next.js)                  │     │
│  │      │               │               │                     │     │
│  │      └───────────────┼───────────────┘                     │     │
│  │                      │                                     │     │
│  │  ┌──────────┐  ┌─────┴─────┐  ┌──────────┐               │     │
│  │  │PostgreSQL│  │   Redis   │  │  SQLite  │               │     │
│  │  │ (cloud)  │  │  (cloud)  │  │ (device) │               │     │
│  │  └──────────┘  └───────────┘  └──────────┘               │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                 SHARED SERVICES LAYER                       │     │
│  │                                                            │     │
│  │  CortexForge ─── Claude API ─── Resend ─── Stripe         │     │
│  │  (project mgmt)  (AI/LLM)      (email)    (payments)      │     │
│  │                                                            │     │
│  │  Expo Push ────── EAS Build ─── GitHub Actions             │     │
│  │  (notifications)  (mobile CI)   (API CI/CD)                │     │
│  │                                                            │     │
│  │  Railway ──────── App Store ─── Play Store                 │     │
│  │  (hosting)        (iOS dist)    (Android dist)             │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                  OPERATIONS LAYER                           │     │
│  │                                                            │     │
│  │  GA4 ──── Plausible ──── UptimeRobot ──── CortexForge     │     │
│  │  (analytics) (privacy)   (monitoring)     (content/CMS)    │     │
│  │                                                            │     │
│  │  Xero (accounting) ──── IPONZ (trademark) ──── NZBN       │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 System Inventory

#### Development & Build Systems

| System | Purpose | Access | Status |
|--------|---------|--------|--------|
| **GitHub** | Source control, PR reviews, Actions CI | github.com/[org] | Active |
| **GitHub Actions** | CI/CD — test, build, deploy notifications | `.github/workflows/` | Active |
| **Docker / Docker Compose** | Local dev environment (PG, Redis, API, Web) | `docker-compose.yml` | Active |
| **EAS Build** | Mobile app builds (iOS + Android) | `eas.json` | Configured |
| **npm Workspaces** | Monorepo package management | `package.json` | Active |
| **TypeScript** | Type safety across all packages | `tsconfig.json` (per workspace) | Active |
| **Jest** | Unit + integration testing | `jest.config.*` (per workspace) | Active |
| **Playwright** | Web E2E testing | `apps/web/playwright.config.ts` | Active |
| **ESLint** | Code linting | `.eslintrc.*` | Active |

#### Hosting & Infrastructure

| System | Purpose | Access | Status |
|--------|---------|--------|--------|
| **Railway** | API + DB + Redis hosting (production) | railway.app dashboard | Ready to deploy |
| **Railway PostgreSQL** | Production database (plugin) | Auto-injected `DATABASE_URL` | Pending |
| **Railway Redis** | Production cache (plugin) | Auto-injected `REDIS_URL` | Pending |
| **Cloudflare Pages** | Landing page / marketing site (option) | cloudflare.com | Not started |
| **Apple App Store** | iOS distribution | App Store Connect | Account exists |
| **Google Play Store** | Android distribution | Play Console | Account exists |

#### External APIs & Services

| System | Purpose | Env Var | Status |
|--------|---------|---------|--------|
| **Anthropic Claude** | AI SWMS generation, hazard suggestions | `ANTHROPIC_API_KEY` | Active |
| **Resend** | Transactional email (verification, invoices) | `RESEND_API_KEY` | Active |
| **Stripe NZ** | Subscription billing | `STRIPE_SECRET_KEY` + 4 more | Ready (Phase B) |
| **Expo Push** | Mobile push notifications | Auto (Expo SDK) | Active |
| **Expo Updates** | OTA mobile updates | Auto (EAS) | Configured |
| **Google Analytics 4** | Web analytics | `G-83NPHN0QP5` | Active (web) |
| **LM Studio** | Local LLM fallback (dev only) | `USE_LOCAL_LLM`, `LM_STUDIO_URL` | Optional |

#### Future Integrations (Planned)

| System | Purpose | Timeline | Status |
|--------|---------|----------|--------|
| **Xero** | Cashflow forecasting (Module 2) | Q2-Q3 2026 | Planned |
| **Twilio** | SMS notifications + 2FA | Q3 2026 | Planned |
| **AWS S3** | Production file storage | When needed | Schema ready |
| **Plausible** | Privacy-friendly analytics | Launch | Not started |

#### Project Management & Content

| System | Purpose | Access | Status |
|--------|---------|--------|--------|
| **CortexForge** | Project management, SDLC tracking, content automation | `localhost:9000` (Project #495) | Dev only |
| **CortexForge Content** | Marketing post generation + scheduling | Company: `f103b8fd-...` | 8 posts drafted |
| **Claude Code** | AI-assisted development | CLI + hooks + memory | Active |
| **Claude Code Memory** | Persistent project context | `~/.claude/projects/.../memory/` | Active |

#### Legal & Business

| System | Purpose | Status |
|--------|---------|--------|
| **Instilligent Limited** | NZ registered company | Active |
| **NZBN** | NZ Business Number | 9429041896853 |
| **D-U-N-S** | Dun & Bradstreet | 594912489 (2026-07-31) |
| **IPONZ** | Trademark registry | Not yet filed |
| **NZ Privacy Act 2020** | Data privacy compliance | Disclosure in emails + legal pages |
| **Xero (for Instilligent)** | Company accounting | To set up |

### 1.3 Port Map (Local Development)

| Port | Service | Health Check |
|------|---------|-------------|
| 29000 | API (Express) | `GET /health` |
| 29432 | PostgreSQL 16 | `pg_isready -U bossboard` |
| 29379 | Redis 7 | `redis-cli ping` |
| 29080 | Web (nginx static) | HTTP 200 |
| 3000 | Web (Next.js dev) | HTTP 200 |
| 9000 | CortexForge | `GET /health` |
| 1234 | LM Studio (optional) | `GET /v1/models` |

### 1.4 Environment Variables (Complete Reference)

```bash
# === Application ===
APP_NAME=BossBoard                    # Configurable brand name
APP_DOMAIN=https://bossboard.co.nz   # Configurable domain
NODE_ENV=production                   # development | production
PORT=29000                            # Dynamic on Railway

# === Database ===
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
POSTGRES_USER=bossboard
POSTGRES_PASSWORD=<secure>
POSTGRES_DB=bossboard

# === Cache ===
REDIS_URL=redis://host:6379

# === Auth ===
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>

# === AI ===
ANTHROPIC_API_KEY=sk-ant-...

# === Email ===
RESEND_API_KEY=re_...
SMTP_FROM_NAME=${APP_NAME}            # Falls back to APP_NAME
SMTP_FROM_EMAIL=hello@domain.co.nz

# === Payments (Phase B) ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_TRADIE=price_...
STRIPE_PRICE_ID_TEAM=price_...
STRIPE_RETURN_URL=https://domain.co.nz/subscription

# === CORS ===
CORS_ORIGINS=http://localhost:3000,https://app.domain.co.nz

# === Storage ===
STORAGE_TYPE=local                    # local | s3
STORAGE_PATH=/app/uploads

# === Logging ===
LOG_LEVEL=info

# === Local Dev Only ===
USE_LOCAL_LLM=false
LM_STUDIO_URL=http://host.docker.internal:1234
LM_STUDIO_MODEL=qwen/qwen3-vl-4b
```

---

## Part 2: Reusable Idea-to-Market Process

### Purpose

This is the **Instilligent Product Playbook** — a repeatable, automatable process for taking any product idea from concept to paying customers. Each phase has:
- **Gate criteria**: what must be true before moving on
- **CortexForge phase**: maps to SDLC tracking
- **Automation opportunities**: what can Claude Code / CortexForge automate

---

### Phase 0: SPARK (Idea Capture)

**CortexForge Phase**: `requirements` (status: `not_started`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 0.1 | Write down the idea in one sentence | No (human insight) |
| 0.2 | Identify the target user (who has this problem?) | No |
| 0.3 | Identify the pain (what hurts?) | No |
| 0.4 | Estimate market size (how many people?) | Partially (web search) |
| 0.5 | Check competitors (who else solves this?) | Yes (web search + analysis) |
| 0.6 | Define unique angle (why us?) | No |

**Gate**: One-pager exists with problem, audience, competitors, and differentiator.

**CortexForge Artifact**: Create `product-brief` artifact on project.

---

### Phase 1: VALIDATE (Is It Worth Building?)

**CortexForge Phase**: `requirements` (status: `in_progress`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 1.1 | Create ICP (Ideal Customer Profile) with 2-3 personas | Partially |
| 1.2 | Competitive analysis matrix (price, features, weaknesses) | Yes |
| 1.3 | Pricing model (tiers, margins, unit economics) | Partially |
| 1.4 | Revenue targets (Month 1, 3, 6, 12) | Template |
| 1.5 | Talk to 5+ potential users (validation interviews) | No (human only) |
| 1.6 | Regulatory scan (NZ-specific compliance needs?) | Yes (web search) |
| 1.7 | Write Product & Market Positioning doc | Template + AI assist |

**Gate**: Positioning doc complete, 5+ user conversations done, go/no-go decision made.

**CortexForge Artifact**: Create `product-positioning` artifact.

**Template**: `docs/product/PRODUCT_AND_MARKET_POSITIONING.md` (reuse BossBoard's structure)

---

### Phase 2: DESIGN (Architecture & API)

**CortexForge Phase**: `design` (status: `in_progress`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 2.1 | Choose tech stack (consider existing Instilligent infra) | Decision |
| 2.2 | Design database schema | AI-assisted |
| 2.3 | Design API endpoints | AI-assisted |
| 2.4 | Design UI/UX (screens, navigation, flows) | Partially |
| 2.5 | Choose hosting/infra (Railway, Vercel, etc.) | Decision |
| 2.6 | Set up monorepo structure (if applicable) | Yes (scaffold) |
| 2.7 | Document architecture in CLAUDE.md | Yes |

**Gate**: CLAUDE.md is the complete project brain. API contract defined. DB schema designed.

**Reusable Stack Pattern** (proven with BossBoard):
- API: Express + TypeScript + PostgreSQL + Redis
- Mobile: React Native (Expo) with expo-router
- Web: Next.js App Router + Tailwind
- Shared: `packages/shared/` for types + theme + utils
- AI: Claude API (with LM Studio local fallback)
- Email: Resend (with SMTP fallback)
- Payments: Stripe
- Hosting: Railway (API + DB + Redis) + Vercel/Cloudflare (web)

---

### Phase 3: BUILD (MVP)

**CortexForge Phase**: `implementation` (status: `in_progress`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 3.1 | Set up Docker Compose (local dev) | Template |
| 3.2 | Build API (auth, core routes, services) | AI-assisted |
| 3.3 | Build mobile app (screens, navigation, offline) | AI-assisted |
| 3.4 | Build web app (auth, dashboard, core pages) | AI-assisted |
| 3.5 | Create shared package (types, theme, utils) | AI-assisted |
| 3.6 | Set up CI pipeline (GitHub Actions) | Template |
| 3.7 | Configure EAS for mobile builds | Template |
| 3.8 | Create Dockerfile(s) | Template |
| 3.9 | Configure Railway (`railway.toml`) | Template |

**Gate**: All core features work locally. API builds with zero TS errors. Mobile runs on simulator.

**Templates Available**:
- `docker-compose.yml` — adapt from BossBoard
- `.github/workflows/api-ci.yml` — adapt from BossBoard
- `Dockerfile.api` — multi-stage Node 20 Alpine (reusable)
- `railway.toml` — standard config (reusable)
- `eas.json` — 3-profile EAS config (reusable)

---

### Phase 4: TEST (Does It Work?)

**CortexForge Phase**: `testing` (status: `in_progress`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 4.1 | Write API unit/integration tests (Jest) | AI-assisted |
| 4.2 | Write mobile tests (Jest) | AI-assisted |
| 4.3 | Write web E2E tests (Playwright) | AI-assisted |
| 4.4 | Run full test suite — all green | Yes (CI) |
| 4.5 | Security audit (OWASP top 10) | Partially |
| 4.6 | Accessibility audit (WCAG 2.1 AA) | Partially |
| 4.7 | Load testing (concurrent users) | Yes (k6/Artillery) |
| 4.8 | Offline sync reliability testing | Manual |

**Gate**: 80%+ coverage on critical paths. All tests green in CI. No critical security issues.

---

### Phase 5: BRAND & LEGAL (What Are We Called?)

**CortexForge Phase**: `review` (status: `in_progress`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 5.1 | Decide product name | No (human decision) |
| 5.2 | Check domain availability | Yes (WHOIS lookup) |
| 5.3 | Check trademark availability (IPONZ) | Partially |
| 5.4 | Register domain | No (requires purchase) |
| 5.5 | Create logo + visual identity | AI-assisted (then human review) |
| 5.6 | Create privacy policy (NZ Privacy Act 2020) | Template + legal review |
| 5.7 | Create terms of service (NZ jurisdiction) | Template + legal review |
| 5.8 | Set up business bank account | No (human action) |
| 5.9 | GST registration (if >$60k revenue) | No (human action) |

**Gate**: Name decided, domain secured, legal pages live, brand assets created.

**Templates**: Privacy policy + ToS templates from BossBoard (`/legal/*` routes)

---

### Phase 6: DEPLOY (Get It Running)

**CortexForge Phase**: `deployment` (status: `in_progress`)

| Step | Action | Automatable? |
|------|--------|-------------|
| 6.1 | Create Railway project | No (dashboard action) |
| 6.2 | Add PostgreSQL + Redis plugins | No (dashboard action) |
| 6.3 | Set environment variables | Partially (Railway CLI) |
| 6.4 | Deploy API (push to master triggers CI → Railway) | Yes (git push) |
| 6.5 | Run database migrations | Yes (`scripts/migrate-railway.sh`) |
| 6.6 | Verify health check | Yes (`curl /health`) |
| 6.7 | Set up custom domain + SSL | No (dashboard + DNS) |
| 6.8 | Set up uptime monitoring | Partially (UptimeRobot API) |
| 6.9 | Deploy web app (Vercel/Railway) | Yes (git push) |
| 6.10 | Deploy landing page | Yes (Cloudflare Pages) |

**Gate**: Production API healthy. Web app accessible. Custom domain working. Monitoring active.

---

### Phase 7: DISTRIBUTE (Get on Phones)

**CortexForge Phase**: `deployment` (continued)

| Step | Action | Automatable? |
|------|--------|-------------|
| 7.1 | Apple Developer account ($99/yr) | No (purchase) |
| 7.2 | Google Play Developer account ($25) | No (purchase) |
| 7.3 | Generate app screenshots (5 per platform) | Partially |
| 7.4 | Write store descriptions (NZ English) | AI-assisted |
| 7.5 | Build production binaries (`eas build`) | Yes |
| 7.6 | Submit to App Store | Yes (`eas submit`) |
| 7.7 | Submit to Play Store | Yes (`eas submit`) |
| 7.8 | Respond to rejection feedback | No (human judgement) |
| 7.9 | Test on physical devices | No (manual) |

**Gate**: Apps live on both stores. No critical review feedback.

---

### Phase 8: MONETISE (Get Paid)

| Step | Action | Automatable? |
|------|--------|-------------|
| 8.1 | Create Stripe account (stripe.com/nz) | No (signup) |
| 8.2 | Configure products + prices | No (Stripe dashboard) |
| 8.3 | Implement Stripe Checkout flow | AI-assisted |
| 8.4 | Implement webhook handler | AI-assisted |
| 8.5 | Test with Stripe test mode | Yes |
| 8.6 | Go live (switch to live keys) | No (manual switch) |
| 8.7 | Beta → paid transition plan | Template |

**Gate**: Payments working in test. Webhook events processed. Ready to flip live.

---

### Phase 9: LAUNCH (Get Users)

| Step | Action | Automatable? |
|------|--------|-------------|
| 9.1 | Register in CortexForge (company + products) | Yes (API) |
| 9.2 | Generate marketing content (CortexForge) | Yes (Content API) |
| 9.3 | Create social media accounts | No (manual) |
| 9.4 | Set up content schedule (3-4x/week) | Yes (CortexForge) |
| 9.5 | Personal network outreach | No (human) |
| 9.6 | Grassroots marketing (site visits, flyers, trade stores) | No (human) |
| 9.7 | SEO setup (Search Console, sitemap, keywords) | Partially |
| 9.8 | Blog content (compliance guides, tips) | AI-assisted |
| 9.9 | Referral program | AI-assisted (build) |
| 9.10 | Paid ads (Month 2+): Facebook/IG, Google | No (manual setup) |

**Gate**: 50 beta users. Feedback loop established. Content publishing regularly.

---

### Phase 10: GROW (Keep & Scale)

| Step | Action | Automatable? |
|------|--------|-------------|
| 10.1 | Welcome email sequence (3 emails) | Template + Resend |
| 10.2 | In-app onboarding refinement | AI-assisted |
| 10.3 | Push notification strategy | Template |
| 10.4 | Weekly email summary | Template + cron |
| 10.5 | User feedback collection (NPS, in-app) | Partially |
| 10.6 | Feature iteration based on feedback | AI-assisted |
| 10.7 | Metrics dashboard (DAU, retention, churn, NPS) | AI-assisted |
| 10.8 | Partnership outreach (trade associations) | No (human) |
| 10.9 | Press/media outreach | No (human) |
| 10.10 | Next module development | Restart from Phase 2 |

**Gate**: 200 paying users. <5% monthly churn. NPS >50.

---

## Part 3: CortexForge Integration Points

### SDLC Phase Mapping

| Our Phase | CortexForge SDLC Phase | Auto-Update? |
|-----------|----------------------|-------------|
| 0-1 (Spark + Validate) | `requirements` | Yes — artifact creation triggers |
| 2 (Design) | `design` | Yes — CLAUDE.md creation triggers |
| 3 (Build) | `implementation` | Yes — commit activity triggers |
| 4 (Test) | `testing` | Yes — CI results trigger |
| 5 (Brand & Legal) | `review` | Manual |
| 6-7 (Deploy + Distribute) | `deployment` | Yes — Railway/EAS events trigger |
| 8-10 (Monetise + Launch + Grow) | `deployment` (completed) | Manual → metrics |

### CortexForge API Automation

```bash
# === Project Lifecycle ===

# Register new product idea
POST /api/projects
{
  "name": "ProductName",
  "slug": "product-slug",
  "language": "TypeScript",
  "framework": "React Native + Express",
  "localPath": "D:\\ProductName"
}

# Update SDLC phase
PUT /api/projects/{id}/sdlc/{phase}
{ "status": "in_progress", "notes": "Starting build phase" }

# Create artifact (positioning doc, architecture, etc.)
POST /api/projects/{id}/artifacts
{ "name": "product-positioning", "type": "markdown", "content": "..." }

# === Content Marketing Automation ===

# Register company
POST /content/companies
{ "name": "Product Name", "industry": "...", "target_audience": "..." }

# Create product listings
POST /content/products
{ "company_id": "...", "name": "Feature Name", "description": "..." }

# Auto-generate marketing post
POST /content/onn/automation/generate
{ "company_id": "...", "product_id": "...", "post_type": "awareness" }

# Schedule content
POST /content/posts
{ "company_id": "...", "content": "...", "scheduled_at": "2026-04-01T07:00:00+13:00" }

# Generate AI image for post
POST /content/posts/{post_id}/generate-media
```

### Gap Detection Automation

CortexForge can automatically detect gaps by comparing a product's current state against this process template:

```bash
# Query: "What phases are incomplete for project X?"
GET /api/projects/{id}/sdlc
# Returns phase statuses → compare against required gates

# Query: "What artifacts are missing?"
GET /api/projects/{id}/artifacts
# Compare against required artifacts per phase
```

**Proposed CortexForge Enhancement**: A `/api/projects/{id}/health-check` endpoint that:
1. Compares current SDLC state against this process template
2. Identifies missing artifacts (no positioning doc? no test results?)
3. Flags stale phases (implementation started 30+ days ago with no testing?)
4. Returns a structured "gaps" report

---

## Part 4: Automation Opportunities

### What Claude Code Can Automate Today

| Task | How | Trigger |
|------|-----|---------|
| Competitive analysis | Web search + structured comparison | Phase 1 |
| CLAUDE.md creation | Template + project-specific details | Phase 2 |
| Scaffold monorepo | `npm init -w`, copy templates | Phase 3 |
| Write tests | AI-generated from route/service code | Phase 4 |
| Run full test suite | `npm test` across workspaces | Phase 4 (CI) |
| Generate store descriptions | AI from product positioning doc | Phase 7 |
| Build mobile binaries | `eas build --platform all` | Phase 7 |
| Generate marketing content | CortexForge Content API | Phase 9 |
| Create email templates | AI from brand guidelines | Phase 10 |
| Gap detection | Compare checklist vs actual state | Any phase |

### What Requires Human Action (Cannot Automate)

| Task | Why |
|------|-----|
| User validation interviews | Requires human empathy + judgement |
| Brand name decision | Creative + legal + business decision |
| Domain purchase | Requires payment |
| Developer account signup | Requires payment + identity verification |
| Stripe account creation | Requires business verification |
| Legal review | Requires qualified lawyer |
| Grassroots marketing | Requires physical presence |
| Partnership negotiations | Requires relationship building |

### Proposed Scheduled Tasks

| Task | Schedule | Action |
|------|----------|--------|
| Health check all products | Daily 8am | `curl /health` for each deployed product |
| Gap detection | Weekly Monday | Compare each product against process template |
| Content generation | 3x/week | CortexForge auto-generate + schedule |
| Cert expiry check | Daily | Already built (cron service in API) |
| Metrics snapshot | Weekly | Query API stats, store in CortexForge |
| Dependency audit | Monthly | `npm audit` across all workspaces |

---

## Part 5: BossBoard — Current Gap Analysis

Comparing BossBoard's actual state against this process:

| Phase | Status | Gaps |
|-------|--------|------|
| 0. Spark | **COMPLETE** | — |
| 1. Validate | **COMPLETE** | No real user interviews documented |
| 2. Design | **COMPLETE** | — |
| 3. Build | **95%** | Web app phases 2-7 incomplete |
| 4. Test | **90%** | No mobile E2E, no load testing, no security audit |
| 5. Brand & Legal | **BLOCKED** | Name undecided, domain unsecured, no lawyer review |
| 6. Deploy | **READY** | API not yet deployed (commits unpushed, Railway not set up) |
| 7. Distribute | **READY** | Dev accounts exist, screenshots not captured |
| 8. Monetise | **READY** | Stripe code exists, not connected to live account |
| 9. Launch | **PARTIALLY READY** | CortexForge content drafted, no social accounts created |
| 10. Grow | **PLANNED** | Email sequences not built, metrics dashboard not built |

### Critical Path to Market

```
1. Push unpushed commits (production fix)          ← 5 minutes
2. Decide brand name                               ← Human decision (BLOCKER)
3. Secure domain                                   ← 1 hour
4. Deploy API to Railway                           ← 2 hours
5. Deploy web app                                  ← 2 hours
6. Capture screenshots + submit to app stores      ← 1 day
7. Create social media accounts + start posting     ← 1 day
8. Personal network outreach (first 10-20 users)   ← 1 week
9. Iterate based on feedback                       ← Ongoing
10. Stripe integration when 50 users reached       ← 1 day of dev
```

**Estimated time from "brand decision" to "first user signup": 1 week.**

---

## Part 6: New Product Kickstart Checklist

When starting a **new** Instilligent product, run through this quick-start:

```bash
# 1. Create project in CortexForge
POST /api/projects { name, slug, language, framework, localPath }

# 2. Copy process template
cp docs/SYSTEMS_AND_PROCESS.md new-project/docs/

# 3. Scaffold monorepo (if applicable)
mkdir -p apps/api apps/mobile packages/shared
npm init -w apps/api
npm init -w apps/mobile
npm init -w packages/shared

# 4. Copy reusable infrastructure
cp Dockerfile.api new-project/
cp railway.toml new-project/
cp docker-compose.yml new-project/  # adapt ports
cp .github/workflows/api-ci.yml new-project/.github/workflows/

# 5. Create CLAUDE.md (project brain)
# Use BossBoard's CLAUDE.md as template, customise for new product

# 6. Register in CortexForge Content (for marketing)
POST /content/companies { name, industry, target_audience }
POST /content/products { company_id, name, description }

# 7. Start Phase 0 (Spark)
# Write the one-pager, do competitive analysis, create personas
```

---

*This document is the Instilligent Product Playbook. Update it as processes evolve.*
*Managed by CortexForge | Instilligent Limited | March 2026*
