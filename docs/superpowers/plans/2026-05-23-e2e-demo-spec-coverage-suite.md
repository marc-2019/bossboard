# E2E Demo + Spec Coverage Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive headed-Playwright + Maestro demo suite that doubles as end-to-end tests for every v0.5.0 feature, mapped against a freshly-derived spec (from CLAUDE.md + PRODUCT_AND_MARKET_POSITIONING.md), with full gap analysis vs the existing 45-test API suite + 11-spec web e2e suite.

**Architecture:** 5 phases. Phase 0 verifies real-services env. Phase 1 derives the spec into `docs/testing/SPEC_AND_DEMOS_MATRIX.md`. Phase 2 sets up Maestro for mobile e2e (RN can't be driven by Playwright). Phase 3 dispatches 14 parallel agents (one per feature-module) using a TEMPLATE that ensures consistent structure across Web (Playwright headed), API (Playwright API), and Mobile (Maestro). Phase 4 aggregates per-agent reports, cross-checks against existing tests, produces `docs/testing/EXECUTIVE_GAP_REPORT.md`. Phase 5 wraps a one-command demo runner.

**Tech Stack:** Playwright `@playwright/test` (already installed in apps/web), Maestro CLI (new install for mobile), Node.js 20+, Stripe **test mode** (sk_test_*), Resend test domain, Anthropic Claude API (existing key), docker-compose (existing postgres + redis on 29432/29379).

**Scope estimate:** ~96 demo/test files across web/api/mobile × 32 features. ~12-15K LOC. Expected agent wall-clock with parallel dispatch: 8-12 hours.

**Out-of-scope (do not let agents bleed into):** Stripe webhook signature verification (already tested in `apps/api/__tests__`). Database migrations (use existing). New feature work (this is test-only).

---

## Phase 0: Pre-flight environment check

**Owner:** Single agent (claude or general-purpose). Sequential — blocks everything else.

### Task 0.1: Verify all required env vars present

**Files:**
- Read: `apps/api/.env` (exists locally, gitignored)
- Read: `apps/web/.env.local` (exists locally, gitignored)
- Create: `docs/testing/env-required.md` (new, tracked)

- [ ] **Step 1: Probe each required env var**

Run:
```bash
cd /home/marc/projects/bossboard
for v in STRIPE_TEST_SECRET_KEY STRIPE_TEST_WEBHOOK_SECRET RESEND_API_KEY ANTHROPIC_API_KEY DATABASE_URL REDIS_URL JWT_SECRET; do
  test -n "${!v}" && echo "  $v: SET (len=${#v})" || echo "  $v: MISSING"
done
# Source apps/api/.env first if vars empty:
set -a; source apps/api/.env 2>/dev/null; set +a
for v in STRIPE_TEST_SECRET_KEY STRIPE_TEST_WEBHOOK_SECRET RESEND_API_KEY ANTHROPIC_API_KEY DATABASE_URL REDIS_URL JWT_SECRET; do
  test -n "${!v}" && echo "  $v: SET (len=${#v})" || echo "  $v: MISSING"
done
```

Expected: All 7 set. If any missing, **STOP and report to Marc**. Do not proceed.

- [ ] **Step 2: Verify docker-compose services healthy**

Run:
```bash
docker compose ps --format json | jq -r '.[] | "\(.Name): \(.State) \(.Health)"'
docker exec trademate-postgres pg_isready -U trademate
docker exec trademate-redis redis-cli ping
```

Expected: postgres + redis up, pg_isready=accepting, redis=PONG.

- [ ] **Step 3: Probe Stripe test-mode key works**

Run:
```bash
curl -sS -u "$STRIPE_TEST_SECRET_KEY:" https://api.stripe.com/v1/customers?limit=1 | jq -r '.url'
```

Expected: `/v1/customers` (i.e. Stripe responded with a list URL). If 401 → key invalid; STOP.

- [ ] **Step 4: Probe Resend test send works**

Run:
```bash
curl -sS -X POST -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" \
  -d '{"from":"onboarding@resend.dev","to":"delivered@resend.dev","subject":"e2e-preflight","html":"<p>ping</p>"}' \
  https://api.resend.com/emails | jq -r '.id // .message'
```

Expected: Returns an email ID. If error message, **STOP and report** — Resend domain may not be verified for the from address.

- [ ] **Step 5: Probe Claude API works**

Run:
```bash
curl -sS https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' \
  | jq -r '.content[0].text // .error.message'
```

Expected: 1–2 word response (model says hi back). If error, **STOP and report**.

- [ ] **Step 6: Write env-required.md**

Create `docs/testing/env-required.md`:
```markdown
# E2E Demo Suite — Required Environment

Verified working as of {DATE}.

| Var | Purpose | Source |
|---|---|---|
| STRIPE_TEST_SECRET_KEY | Live Stripe test mode | dashboard.stripe.com (test) |
| STRIPE_TEST_WEBHOOK_SECRET | Verify Stripe webhooks in tests | Stripe CLI listen --print-secret |
| RESEND_API_KEY | Real email sends in tests | resend.com api keys |
| ANTHROPIC_API_KEY | SWMS / hazard / control AI | console.anthropic.com |
| DATABASE_URL | Postgres for tests | docker-compose `trademate-postgres` |
| REDIS_URL | Redis for tests | docker-compose `trademate-redis` |
| JWT_SECRET | Auth | apps/api/.env |

Run `docs/testing/preflight.sh` (separate task) before any demo run.
```

- [ ] **Step 7: Commit**

```bash
git add docs/testing/env-required.md
git commit -m "chore(testing): document env required for e2e demo suite

Pre-flight check verified all 7 env vars + docker services + external API
reachability (Stripe test, Resend, Claude). Foundation for Phase 1+ work
in 2026-05-23-e2e-demo-spec-coverage-suite plan."
```

---

## Phase 1: Spec derivation

**Owner:** Single agent. Sequential — Phase 3 depends on this artifact.

### Task 1.1: Read all spec source docs

**Files:**
- Read: `CLAUDE.md` (full, esp. "What's Built" section lines 419–462 and "APIs & Endpoints" section lines 306–411)
- Read: `docs/product/PRODUCT_AND_MARKET_POSITIONING.md` (full, 476 lines)
- Read: `docs/testing/E2E_TESTING_MATRIX.md` (existing, 197 lines — for inspiration only, will be superseded)

- [ ] **Step 1: Inventory every feature claim**

Extract claims into a flat list. Each claim must answer:
- Feature name (e.g. "Create invoice")
- User story ("As a tradie, I want to create an invoice for a customer so I get paid")
- Acceptance criteria (3-5 testable assertions)
- Surfaces (Web / API / Mobile — which apply)
- Existing test coverage (read `apps/api/__tests__`, `apps/web/e2e/`, `apps/mobile/__tests__` directories; cross-reference)

### Task 1.2: Cross-reference with actual code

**Files:**
- Read: `apps/api/src/routes/*.ts` (12 route files — every endpoint must map to ≥1 feature claim)
- Read: `apps/mobile/app/**/*.tsx` (every user-facing screen)
- Read: `apps/web/src/app/**/page.tsx` (every web page)

- [ ] **Step 1: Find feature drift**

For every endpoint in `apps/api/src/routes/`, confirm a feature claim exists. For every claim, confirm the implementing route/screen exists. Drift in either direction is a spec gap to flag in Phase 4.

### Task 1.3: Write `docs/testing/SPEC_AND_DEMOS_MATRIX.md`

**Files:**
- Create: `docs/testing/SPEC_AND_DEMOS_MATRIX.md` (new, tracked)

- [ ] **Step 1: Write the matrix doc**

Structure (use this exact skeleton — Phase 3 agents will read it):

```markdown
# BossBoard E2E Demo + Spec Coverage Matrix

**Derived:** 2026-05-23 from CLAUDE.md + PRODUCT_AND_MARKET_POSITIONING.md
**Coverage target:** 32 features × 3 surfaces (Web / API / Mobile) = 96 demo/test cells
**Existing coverage baseline:** 45 Jest tests (apps/api), 11 Playwright specs (apps/web/e2e), some Jest tests (apps/mobile)

---

## Surface notation

- **W** = apps/web (Next.js, Playwright headed)
- **A** = apps/api (Express, Playwright API tests via baseURL)
- **M** = apps/mobile (Expo React Native, Maestro YAML flows)

## Coverage cells

For each cell: `[F-id]` = feature id; `[Spec✓]`/`[Spec✗]` = spec exists; `[Demo✓]`/`[Demo✗]` = demo exists; `[Test✓]`/`[Test✗]` = automated test exists.

---

## Module 1 — Authentication (4 features)

### F-AUTH-01 — Register account

**User story:** As a new tradie, I want to register with email+password so I can start using BossBoard.
**Acceptance criteria:**
1. POST /auth/register with valid email+password returns 201 + access_token + refresh_token + user.id
2. Duplicate email returns 409
3. Weak password (<8 chars) returns 400
4. Successful registration sends a 6-digit verification email via Resend
5. Mobile + Web register screens collect email+password+confirm and call the API

**Surfaces:** W ✓ A ✓ M ✓
**Existing test coverage:** apps/api/__tests__/auth.test.ts (lines TBD-read), apps/web/e2e/auth.spec.ts (1 spec)
**Demo script outline:**
- W: open /register, fill form with throwaway email (unique-per-run), submit, assert /verify-email page loaded, assert email arrived at inbox proxy
- A: POST /auth/register with curl-equivalent, parse JWT, assert claims
- M: Maestro flow `mobile-auth-register.yaml` — launch app, tap "Sign up", fill form, assert next screen

### F-AUTH-02 — Login

(same structure)

### F-AUTH-03 — Email verification (6-digit code)

### F-AUTH-04 — Password reset (6-digit code)

### F-AUTH-05 — Onboarding wizard (trade type, company, bank)

---

## Module 2 — Compliance (4 features)

### F-COMP-01 — SWMS generator (AI-powered)
### F-COMP-02 — Risk assessment builder
### F-COMP-03 — WorkSafe checklists
### F-COMP-04 — PDF export

---

## Module 3 — Certifications (3 features)

### F-CERT-01 — Create/list/edit certifications
### F-CERT-02 — Expiry tracking + notifications (30/14/7/1 days)
### F-CERT-03 — Cert document upload (photo attachment)

---

## Module 4 — Invoices (8 features)

### F-INV-01 — Create invoice (with line items + GST)
### F-INV-02 — List invoices (filter by status)
### F-INV-03 — Update invoice (draft only)
### F-INV-04 — Mark as sent
### F-INV-05 — Mark as paid
### F-INV-06 — PDF export
### F-INV-07 — Email invoice to customer (real Resend send)
### F-INV-08 — Public share link (no auth)
### F-INV-09 — Recurring invoices (weekly/fortnightly/monthly/quarterly/annually)
### F-INV-10 — Bank reconciliation (auto-match)

---

## Module 5 — Quotes (3 features)

### F-QUO-01 — Create quote
### F-QUO-02 — PDF export
### F-QUO-03 — Convert to invoice

---

## Module 6 — Expenses (3 features)

### F-EXP-01 — Create expense (with category + receipt photo)
### F-EXP-02 — List/filter expenses by category
### F-EXP-03 — Update/delete expense

---

## Module 7 — Job logs (3 features)

### F-JOB-01 — Create job log + clock in
### F-JOB-02 — Clock out + add notes
### F-JOB-03 — Job log stats

---

## Module 8 — Photos (2 features)

### F-PHOTO-01 — Upload photo from camera/gallery
### F-PHOTO-02 — List photos by entity (invoice/expense/job/swms/cert)

---

## Module 9 — Teams (4 features)

### F-TEAM-01 — Create team (owner)
### F-TEAM-02 — Invite member (6-char invite code via email)
### F-TEAM-03 — Accept/decline invite
### F-TEAM-04 — Member role management (owner/admin/worker)

---

## Module 10 — Subscriptions (4 features)

### F-SUB-01 — View tier definitions
### F-SUB-02 — Tier gating (free/tradie/team feature access)
### F-SUB-03 — Usage tracking (invoice count, SWMS count)
### F-SUB-04 — Limit enforcement (free → 3 invoices/mo, 2 SWMS/mo)

---

## Module 11 — Stats & insights (1 feature)

### F-STAT-01 — Dashboard stats (revenue, aging, top customers, chart)

---

## Module 12 — Push notifications (1 feature)

### F-PUSH-01 — Cert expiry reminders (30/14/7/1 days via Expo Push)

---

## Module 13 — Public invoice sharing (already F-INV-08 in Module 4)

(Skip — already in Module 4)

---

## Module 14 — Stripe billing (subscription flow)

### F-STRIPE-01 — Checkout session creation (tradie tier)
### F-STRIPE-02 — Checkout session creation (team tier)
### F-STRIPE-03 — Webhook handling (subscription.created/updated/deleted)
### F-STRIPE-04 — Subscription status sync to users.subscription_tier

---

## Cross-cutting features (not module-scoped)

### F-X-01 — Multi-tenant isolation (verified per-entity in apps/web/e2e/multi-tenant-isolation*.spec.ts already)
### F-X-02 — Offline sync (mobile)
### F-X-03 — CSP / security headers
```

This document is the **input to every Phase 3 agent**. They read their assigned module slice and produce demos.

- [ ] **Step 2: Commit**

```bash
git add docs/testing/SPEC_AND_DEMOS_MATRIX.md
git commit -m "docs(testing): derive E2E demo + spec coverage matrix

Authoritative spec for the 2026-05-23-e2e-demo-spec-coverage-suite work.
32 features across 14 modules × 3 surfaces (W/A/M) = 96 coverage cells.
Inputs: CLAUDE.md (32 [x] What's Built lines + APIs section),
PRODUCT_AND_MARKET_POSITIONING.md (476 lines).

Cross-references existing test coverage for gap analysis baseline:
- apps/api: 45 Jest test files
- apps/web/e2e: 11 Playwright specs
- apps/mobile: some Jest tests

Phase 1 of e2e demo plan; Phase 3 agents will read their module slice."
```

---

## Phase 2: Mobile e2e tooling (Maestro)

**Owner:** Single agent. Sequential — Phase 3 mobile work depends on this.

**Why Maestro over Detox:** Maestro uses simple YAML flows (no native build required, no JS bridge knowledge), works headed by default, faster setup. Detox is more powerful but requires building the app + native dependencies; overkill for demo+test work.

### Task 2.1: Install Maestro CLI

**Files:**
- Modify: `apps/mobile/package.json` (add npm scripts)
- Create: `apps/mobile/.maestro/.gitkeep`

- [ ] **Step 1: Install Maestro globally**

Run:
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$PATH":"$HOME/.maestro/bin"
maestro --version
```

Expected: Version like `1.x.x`.

- [ ] **Step 2: Add npm scripts to apps/mobile/package.json**

Edit `apps/mobile/package.json` `scripts`:
```json
"e2e:install-maestro": "curl -Ls 'https://get.maestro.mobile.dev' | bash",
"e2e:mobile": "maestro test .maestro/",
"e2e:mobile:single": "maestro test"
```

### Task 2.2: Write the first mobile demo flow

**Files:**
- Create: `apps/mobile/.maestro/00-smoke-app-launches.yaml`

- [ ] **Step 1: Smoke flow**

```yaml
appId: com.instilligent.bossboard
---
- launchApp:
    clearState: true
- assertVisible: "BossBoard"
- takeScreenshot: 00-app-launched
```

- [ ] **Step 2: Run smoke flow**

Run:
```bash
cd apps/mobile
# Start iOS simulator OR Android emulator first (Maestro will pick it up)
npm run e2e:mobile:single .maestro/00-smoke-app-launches.yaml
```

Expected: Flow passes, screenshot lands in `.maestro/screenshots/`. If "no devices" error, **STOP and report** — Marc needs to start a simulator (xcrun simctl boot, or Android Studio AVD).

### Task 2.3: Document mobile e2e in README

**Files:**
- Modify: `apps/mobile/README.md` (or create if absent)

- [ ] **Step 1: Add e2e section**

Add to README:
```markdown
## End-to-end testing with Maestro

Install once: `npm run e2e:install-maestro`

Run all mobile flows: `npm run e2e:mobile`

Run single flow: `maestro test .maestro/<flow>.yaml`

Flows live in `.maestro/`. Each flow is a YAML file describing user actions and assertions. Screenshots land in `.maestro/screenshots/`.

A device or simulator must be running before invoking Maestro:
- iOS: `xcrun simctl boot "iPhone 15"`
- Android: Open Android Studio → AVD Manager → Play
```

- [ ] **Step 2: Commit Phase 2**

```bash
git add apps/mobile/.maestro/ apps/mobile/package.json apps/mobile/README.md
git commit -m "feat(test): add Maestro mobile e2e tooling + smoke flow

Phase 2 of e2e demo plan. Maestro CLI for headed mobile e2e (Expo RN can't
be driven by Playwright). YAML flows in apps/mobile/.maestro/, npm script
e2e:mobile to run all, screenshots to .maestro/screenshots/.

Smoke flow 00-smoke-app-launches.yaml verifies app launches + brand text
visible. Phase 3 module agents will add per-feature flows."
```

---

## Phase 3: Per-module test + demo construction (TEMPLATE + 14 parallel agents)

**Owner:** 14 parallel agents (one per module). Use `Agent` tool with `subagent_type: general-purpose`. Dispatch all in a single message for true parallelism.

**Critical:** every agent must follow the TEMPLATE below. The dispatcher provides the agent with: (a) the module slice from `SPEC_AND_DEMOS_MATRIX.md`, (b) the env file path, (c) the template instructions, (d) explicit governance constraints from `~/.claude/CLAUDE.md`.

### Module assignment table

| Agent | Module | Feature IDs | Spec section | Surfaces |
|---|---|---|---|---|
| 1 | Authentication | F-AUTH-01…05 | Module 1 | W A M |
| 2 | Compliance | F-COMP-01…04 | Module 2 | W A M |
| 3 | Certifications | F-CERT-01…03 | Module 3 | W A M |
| 4 | Invoices | F-INV-01…10 | Module 4 | W A M |
| 5 | Quotes | F-QUO-01…03 | Module 5 | W A M |
| 6 | Expenses | F-EXP-01…03 | Module 6 | W A M |
| 7 | Job logs | F-JOB-01…03 | Module 7 | W A M |
| 8 | Photos | F-PHOTO-01…02 | Module 8 | M (primarily) |
| 9 | Teams | F-TEAM-01…04 | Module 9 | W A M |
| 10 | Subscriptions | F-SUB-01…04 | Module 10 | A (primarily) |
| 11 | Stats & insights | F-STAT-01 | Module 11 | W A M |
| 12 | Push notifications | F-PUSH-01 | Module 12 | A M |
| 13 | Stripe billing | F-STRIPE-01…04 | Module 14 | W A |
| 14 | Cross-cutting | F-X-01…03 | Cross-cutting section | W A M |

### TEMPLATE — every Phase 3 agent follows this

**Inputs to each agent:**
- The module's spec section from `docs/testing/SPEC_AND_DEMOS_MATRIX.md`
- The verified env vars (Phase 0)
- The Maestro tooling (Phase 2)
- The existing test patterns (must read `apps/web/e2e/auth.spec.ts` + `apps/api/__tests__/auth.test.ts` first — these are reference patterns)
- Explicit governance: do NOT push to master. Do NOT delete branches. Open a PR for review.

**Per-module work each agent does:**

#### TEMPLATE Task M.1: Read inputs + write per-feature test plan

- [ ] Read assigned module's spec section
- [ ] Read existing reference patterns (auth.spec.ts, auth.test.ts)
- [ ] Read code under test: `apps/api/src/routes/<module>.ts`, `apps/mobile/app/<module>/**`, `apps/web/src/app/**` (if applicable)
- [ ] Write `apps/web/e2e/demos/<module>.spec.ts` skeleton with one `test()` per feature ID

Example skeleton:
```typescript
// apps/web/e2e/demos/auth.spec.ts
import { test, expect } from '@playwright/test';
import { uniqueEmail, registerAndVerify, cleanupUser } from './helpers/auth';

test.describe('F-AUTH (Authentication module)', () => {
  test('F-AUTH-01: register account (web)', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/register');
    await page.fill('[data-testid="email"]', email);
    await page.fill('[data-testid="password"]', 'CorrectHorseBatteryStaple1!');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.locator('text=Check your email')).toBeVisible();
    await cleanupUser(email);
  });
  // ... one test() per F-AUTH-XX
});
```

#### TEMPLATE Task M.2: Web demos (Playwright headed)

**Files:**
- Create: `apps/web/e2e/demos/<module>.spec.ts`
- Create: `apps/web/e2e/demos/helpers/<module>.ts` (per-module helpers — unique-email, cleanup, fixture data)

- [ ] **Step 1: Write each test red-first**

Follow TDD discipline (per superpowers:test-driven-development skill):
- Write one test for one acceptance criterion
- Run it (`npx playwright test e2e/demos/<module>.spec.ts -g "<feature-id>" --headed`)
- Expect FAIL with explicit reason (route doesn't exist / selector missing / assertion wrong)
- If the test fails for the WRONG reason (e.g. app crashes before assertion), fix the test setup before declaring red-green cycle
- Now make it green by writing the demo flow

- [ ] **Step 2: Demo must be visually credible**

The "demo" framing means: when Marc watches `--headed`, he should see realistic data, not "test123@test.com" / "Lorem ipsum". Use the per-module helper to generate plausible data:
- Tradie names: `Mike from Mike's Plumbing`, `Sarah Builds Ltd`
- Customer names: `Te Whanau Whānau Trust`, `Auckland Council`, `Smith Residence`
- Amounts: realistic NZ tradie invoice ranges ($150–$8,500)
- Addresses: real-looking NZ addresses
- Job types: realistic for module (plumbing job, electrical install, etc.)

- [ ] **Step 3: One assertion per acceptance criterion**

Don't write monolithic assertions. Each AC from the spec → its own `expect()` call. Makes gap analysis tractable.

- [ ] **Step 4: Enable stakeholder video recording**

Configure Playwright to record video + retain screenshots for every demo so Marc can review asynchronously without watching live.

Edit `apps/web/playwright.config.ts` (or add `apps/web/playwright.demos.config.ts` to keep this isolated):

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/demos',
  fullyParallel: false,            // serial = watchable
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report-demos' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on',                   // record everything for replay
    video: 'on',                   // record video of every demo
    screenshot: 'only-on-failure', // plus full-page screenshot on failure
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

Each test's video lands in `apps/web/test-results/<test-name>/video.webm` and is linked from the HTML report.

- [ ] **Step 5: Run the module's full web demo set headed**

Run:
```bash
cd apps/web
npx playwright test --config=playwright.demos.config.ts e2e/demos/<module>.spec.ts --headed
```

Expected: All tests pass. Workers=1 enforced by config = serial = demo-watchable. Videos in `test-results/`.

#### TEMPLATE Task M.3: API demos (Playwright API tests)

**Files:**
- Create: `apps/web/e2e/demos/api/<module>.api.spec.ts` (or `apps/api/__tests__/e2e/<module>.api.spec.ts` — pick ONE location and document choice)

- [ ] **Step 1: Decide location**

Default: `apps/web/e2e/demos/api/<module>.api.spec.ts` (uses Playwright's `request` fixture). Reuses Playwright's tooling + reporting.

- [ ] **Step 2: Write API-only tests**

Example pattern:
```typescript
import { test, expect } from '@playwright/test';

const API = process.env.API_BASE_URL || 'http://localhost:29000';

test.describe('F-AUTH api', () => {
  test('F-AUTH-01: POST /auth/register — happy path', async ({ request }) => {
    const email = `e2e-${Date.now()}@test.bossboard.nz`;
    const res = await request.post(`${API}/auth/register`, {
      data: { email, password: 'CorrectHorseBatteryStaple1!' }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ access_token: expect.any(String), user: { email } });
  });
  // ...
});
```

- [ ] **Step 3: API tests must hit REAL services per Marc's directive**

Real Stripe test → call actual Stripe API in test mode.
Real Resend → ensure Resend test domain, do NOT spam real inboxes (use Resend's `delivered@resend.dev`).
Real Claude → cost is real ($ ≈ $0.01 per SWMS gen × N tests). Note in module README.

- [ ] **Step 4: Run API demo set**

```bash
cd apps/web
npx playwright test e2e/demos/api/<module>.api.spec.ts --workers=1
```

#### TEMPLATE Task M.4: Mobile demos (Maestro)

**Files:**
- Create: `apps/mobile/.maestro/<NN>-<module>-<feature>.yaml` (one per feature ID)

- [ ] **Step 1: Write one Maestro flow per feature ID**

Numbered NN matches table order so flows run in a sensible demo sequence: `01-`, `02-`, etc.

Example:
```yaml
# apps/mobile/.maestro/02-auth-register.yaml
appId: com.instilligent.bossboard
env:
  EMAIL: "e2e-${TIMESTAMP}@test.bossboard.nz"
---
- launchApp:
    clearState: true
- tapOn:
    text: "Sign up"
- inputText: ${EMAIL}
- tapOn:
    id: "password-input"
- inputText: "CorrectHorseBatteryStaple1!"
- tapOn:
    id: "register-submit"
- assertVisible:
    text: "Check your email"
- takeScreenshot: 02-after-register
```

- [ ] **Step 2: Run the mobile flow set**

```bash
cd apps/mobile
maestro test .maestro/ --include-tags=<module>
```

Note: requires simulator/emulator running. If not, Phase 3 mobile work for this module is BLOCKED — agent reports gap, does not pretend it passed.

#### TEMPLATE Task M.5: Per-feature spec-vs-demo cross-reference

**Files:**
- Create: `docs/testing/coverage/<module>.md`

- [ ] **Step 1: Write per-module coverage report**

Structure:
```markdown
# <Module> — Spec vs Demo coverage

**Generated:** 2026-05-23 by agent <N>
**Spec source:** docs/testing/SPEC_AND_DEMOS_MATRIX.md § Module <N>

| Feature ID | Spec ACs | W demo | A demo | M demo | Notes |
|---|---|---|---|---|---|
| F-AUTH-01 | 5 ACs | ✅ all 5 | ✅ all 5 | ✅ 3 of 5 (verification email not yet inspectable from Maestro) | Mobile gap: need Maestro mailbox-proxy integration to inspect verification code email |
| F-AUTH-02 | … | … | … | … | … |

## Gaps surfaced
1. <gap 1 — with proposed fix>
2. <gap 2>

## Existing test coverage cross-check
- apps/api/__tests__/auth.test.ts covers: F-AUTH-01 (lines 23-45), F-AUTH-02 (lines 47-68)
- apps/web/e2e/auth.spec.ts covers: F-AUTH-01 (whole file)
- apps/mobile/__tests__: no auth tests found

## Commands to run this module's demos
- Web: `cd apps/web && npx playwright test e2e/demos/auth.spec.ts --headed --workers=1`
- API: `cd apps/web && npx playwright test e2e/demos/api/auth.api.spec.ts --workers=1`
- Mobile: `cd apps/mobile && maestro test .maestro/0{2..6}-auth-*.yaml`
```

#### TEMPLATE Task M.6: Open PR for module

- [ ] **Step 1: Branch + push + PR**

Each agent works on its own branch `feat/e2e-demos-<module>-2026-05-23` and opens a PR titled `feat(test): e2e demos + spec coverage for <module>`.

The PR body MUST include:
- Link to `docs/testing/coverage/<module>.md`
- List of commands to run all 3 surfaces
- Real-services cost note (if non-trivial, e.g. SWMS gen module hits Claude API)
- Out-of-scope items observed during the work (so Phase 4 picks them up)

DO NOT push to master. DO NOT delete branches. Wait for Marc's review.

### Dispatching Phase 3

Use the `Agent` tool with `subagent_type: general-purpose`. Send ALL 14 agents in a SINGLE message with multiple Agent tool calls (parallel dispatch).

Each agent's prompt MUST include:
1. Their module's section verbatim from `SPEC_AND_DEMOS_MATRIX.md`
2. The TEMPLATE Tasks M.1–M.6 above verbatim
3. Path to env file + verified-env confirmation from Phase 0
4. Reference test patterns (file paths to `apps/web/e2e/auth.spec.ts` + `apps/api/__tests__/auth.test.ts`)
5. Governance constraints: NO pushes to master, NO branch deletes, PR for review, use `git commit --only`
6. Cost note: real Claude API calls cost money — keep generation tests minimal (1-2 SWMS gens max, not per-test)
7. Verification gate: before claiming done, MUST run all module's tests headed + show pass count

---

## Phase 4: Gap analysis + executive report

**Owner:** Single agent. Sequential — runs AFTER all 14 Phase 3 PRs are merged.

### Task 4.1: Aggregate per-module coverage reports

**Files:**
- Read: `docs/testing/coverage/*.md` (14 files from Phase 3)
- Create: `docs/testing/EXECUTIVE_GAP_REPORT.md`

- [ ] **Step 1: Build the aggregate matrix**

Read every per-module coverage report. Produce a single table with:
- 32 features (rows)
- 3 surfaces × 2 columns each (demo / test) = 6 columns
- Existing-test column (cross-ref against apps/api/__tests__ + apps/web/e2e + apps/mobile/__tests__)
- Status: 🟢 covered / 🟡 partial / 🔴 gap

### Task 4.2: Cross-check against existing test files

- [ ] **Step 1: Map existing tests to feature IDs**

For each of:
- 45 files in `apps/api/__tests__/` and `apps/api/src/__tests__/`
- 11 specs in `apps/web/e2e/`
- N files in `apps/mobile/__tests__/`

Assign each to a feature ID. Tests with no feature-ID home are "orphan tests" — flag them.

- [ ] **Step 2: Identify untested feature claims**

Features in `SPEC_AND_DEMOS_MATRIX.md` that have neither a demo nor an existing test = priority gaps. Flag for Marc.

### Task 4.3: Write executive report

**Files:**
- Create: `docs/testing/EXECUTIVE_GAP_REPORT.md`

- [ ] **Step 1: Report structure**

```markdown
# E2E Demo + Spec Coverage — Executive Gap Report

**Generated:** 2026-05-23
**Coverage baseline:** 32 features × 3 surfaces = 96 cells

## Top-line numbers
- Cells with demo: X / 96
- Cells with automated test: Y / 96
- Cells with neither: Z / 96 ← THE GAP LIST

## Per-feature status table
(32-row table)

## Orphan tests (test files not mapped to any feature claim)
- ...

## Spec gaps (features mentioned in spec but no implementing code found)
- ...

## Recommended next actions (ordered)
1. (gap with highest customer impact)
2. ...
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing/EXECUTIVE_GAP_REPORT.md
git commit -m "docs(testing): executive gap report — e2e demo + spec coverage

Aggregates 14 module coverage reports into single matrix. Identifies:
- Demo coverage: X/96 cells
- Test coverage: Y/96 cells
- True gaps: Z/96 cells (no demo, no existing test)
- N orphan tests (no feature-ID home)
- M spec-vs-code drift cases

Phase 4 of 2026-05-23-e2e-demo-spec-coverage-suite plan."
```

---

## Phase 5: Demo runner + docs

**Owner:** Single agent. Sequential — after Phase 4.

### Task 5.1: One-command demo runner

**Files:**
- Create: `scripts/run-all-demos.sh`
- Modify: `package.json` (root scripts)

- [ ] **Step 1: Write the runner script**

```bash
#!/usr/bin/env bash
# scripts/run-all-demos.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Phase 0: preflight"
bash docs/testing/preflight.sh

echo "==> Web demos (headed, workers=1)"
cd apps/web
npx playwright test e2e/demos/ --headed --workers=1
cd "$REPO_ROOT"

echo "==> API demos"
cd apps/web
npx playwright test e2e/demos/api/ --workers=2
cd "$REPO_ROOT"

echo "==> Mobile demos (requires simulator running)"
cd apps/mobile
maestro test .maestro/

echo "✅ All demos complete"
```

- [ ] **Step 2: npm script wrapper**

In root `package.json` scripts:
```json
"demo:all": "bash scripts/run-all-demos.sh",
"demo:web": "cd apps/web && npx playwright test e2e/demos/ --headed --workers=1",
"demo:api": "cd apps/web && npx playwright test e2e/demos/api/ --workers=2",
"demo:mobile": "cd apps/mobile && maestro test .maestro/"
```

### Task 5.1b: Stakeholder demo highlights doc

**Files:**
- Create: `docs/testing/DEMO_HIGHLIGHTS.md`

- [ ] **Step 1: Index every recorded video + screenshot**

After Phase 3 completes, every web demo has a `.webm` video at `apps/web/test-results/<test-name>/video.webm` and every Maestro flow has screenshots at `apps/mobile/.maestro/screenshots/`. Aggregate them into a single browseable index.

Structure:
```markdown
# BossBoard Demo Highlights

**For stakeholders / asynchronous review.** Each feature has a recorded video (web) and screenshot sequence (mobile). No need to run the demos live.

## Module 1 — Authentication
### F-AUTH-01 — Register account
- Web: [video](../apps/web/test-results/F-AUTH-01-register-account/video.webm) (45s)
- Mobile: [screenshot sequence](../apps/mobile/.maestro/screenshots/02-after-register.png)

(... 32 features ...)
```

Phase 4 gap report cross-references this doc for the "demo coverage" column.

### Task 5.2: Demo README

**Files:**
- Create: `docs/testing/DEMO_RUNBOOK.md`

- [ ] **Step 1: How to run demos for stakeholder viewing**

```markdown
# BossBoard Demo Runbook

## Pre-requisites
1. docker-compose up -d (postgres + redis on 29432/29379)
2. apps/api running: `cd apps/api && npm run dev` (on 29000)
3. apps/web running: `cd apps/web && npm run dev` (on 3000)
4. Mobile simulator running (iOS or Android)
5. Env vars: see docs/testing/env-required.md

## Run all demos (45-60 minutes wall clock)
`npm run demo:all`

## Run a single feature
`cd apps/web && npx playwright test e2e/demos/auth.spec.ts -g "F-AUTH-01" --headed`

## Reset state between demo runs
`cd apps/api && npm run db:reset && npm run db:seed`

## Troubleshooting
- "no devices" → start a simulator
- "401 from Stripe" → check STRIPE_TEST_SECRET_KEY is test-mode (`sk_test_...`)
- "Resend 422" → from-address domain not verified in your Resend account
```

### Task 5.3: Final commit + summary

- [ ] **Step 1: Commit**

```bash
git add scripts/run-all-demos.sh package.json docs/testing/DEMO_RUNBOOK.md
git commit -m "feat(test): one-command demo runner + runbook

Phase 5 of e2e demo plan. npm run demo:all executes:
1. preflight env check
2. web demos (headed, serial)
3. API demos
4. mobile demos via Maestro

Individual surface runners via demo:web / demo:api / demo:mobile.
Runbook covers prerequisites, single-feature runs, and troubleshooting."
```

---

## Self-review of this plan

**1. Spec coverage check:** Every feature claim in CLAUDE.md "What's Built" (32 lines) maps to a Phase 3 module. ✓

**2. Placeholder scan:**
- "TBD" appears once in spec-derivation example ("lines TBD-read") — acceptable since the agent reads the file then records line numbers.
- "..." appears in template task examples where the pattern repeats per feature ID — acceptable because the pattern is explicit and each agent stays inside their module slice.
- No "implement later", "fill in details", "add appropriate error handling" violations. ✓

**3. Type consistency:** Feature IDs follow consistent format `F-<MODULE>-<NN>` throughout. File-path conventions consistent (`apps/web/e2e/demos/<module>.spec.ts`, `apps/mobile/.maestro/<NN>-<module>-<feature>.yaml`). ✓

**4. Sequencing:** Phase 0 → Phase 1 → Phase 2 in parallel with Phase 1 if env is healthy (Maestro install can happen anytime). Phase 3 depends on Phase 1 (spec doc) and Phase 2 (Maestro). Phase 4 depends on all Phase 3 PRs being merged. Phase 5 is after Phase 4. ✓

**5. Risk callouts:**
- **Real Claude API costs** — SWMS gen test will hit `claude-sonnet-4-20250514`; cost is ~$0.01 per generation. Module 2 agent must limit to 2 calls max for the full test run.
- **Mobile e2e requires simulator** — if no simulator runs, the mobile portion of Phase 3 reports "blocked" rather than fake-passes.
- **Real Resend sends** — use `delivered@resend.dev` recipient to avoid spamming real inboxes. Module 1/4 agents must enforce this.
- **Phase 3 parallel agent count = 14** — heavy. If wall-clock budget < 4 hours, recommend splitting into two batches of 7.

---

## Execution handoff

Per writing-plans skill: present this plan to Marc, get explicit execution-mode choice, then dispatch.

**Recommended execution mode:** Subagent-driven (per skill default), with Phase 3 using **dispatching-parallel-agents** for the 14-agent fan-out.
