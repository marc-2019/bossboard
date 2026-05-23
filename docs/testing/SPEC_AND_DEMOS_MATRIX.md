# BossBoard E2E Demo + Spec Coverage Matrix

**Derived:** 2026-05-23 from `CLAUDE.md` + `docs/product/PRODUCT_AND_MARKET_POSITIONING.md`
**Plan reference:** `docs/superpowers/plans/2026-05-23-e2e-demo-spec-coverage-suite.md` (Phase 1, Task 1.3)
**Supersedes (for new work):** `docs/testing/E2E_TESTING_MATRIX.md` (kept on disk for history; that doc is 2026-02 vintage, pre-rename, planning-only — no actual tests against it)
**Coverage target:** 50 features × 3 surfaces (Web / API / Mobile) = 150 nominal coverage cells (some features are intentionally single-surface — e.g. Stripe webhooks have no Mobile cell, push notifications have no Web cell — see "Surface applicability" per feature)
**Existing coverage baseline (cross-ref counted on 2026-05-23):**
- `apps/api/src/__tests__/`: 42 Jest test files (22 in `routes/`, 17 in `services/`, 3 in `middleware/`)
- `apps/web/e2e/`: 10 Playwright spec files (auth, branding, middleware, api-routes, multi-tenant-isolation × 2, nav-link-smoke, page-content-smoke, password-reset-smoke, production-smoke)
- `apps/mobile/__tests__/`: 1 Jest test file (`contexts/AuthContext.test.tsx`)

> **Mocking context for Phase 3 demos:** the dev environment was NOT running when this matrix was authored (no docker containers up, no `.env` file present). Demo script outlines below are phrased agnostic to mocked-vs-real. Phase 3 agents may use Stripe webhook stubs, Resend captured-only sends, and Claude canned SWMS responses if live services remain unavailable; or hit real test-mode services if Phase 0 preflight succeeds.

---

## Surface notation

- **W** = `apps/web` (Next.js 14 App Router, Playwright headed)
- **A** = `apps/api` (Express + TypeScript, Playwright API tests via baseURL, or Jest+Supertest)
- **M** = `apps/mobile` (Expo React Native, Maestro YAML flows)

## Coverage cell legend

For each feature: `[Spec✓]`/`[Spec✗]` = spec exists in this doc; `[Demo✓]`/`[Demo✗]` = demo exists in Phase 3 output; `[Test✓]`/`[Test✗]` = automated test exists today.

Surface applicability per feature is given as `Surfaces: W ? A ? M ?` where `?` is one of:
- `✓` — applies; demo + test expected
- `–` — N/A by design (e.g. Stripe webhook has no UI surface)
- `partial` — only some ACs apply on this surface (rare; explained inline)

---

## Module 1 — Authentication (5 features)

### F-AUTH-01 — Register account

**User story:** As a new tradie, I want to register with email+password (and optional name) so I can start using BossBoard.
**Acceptance criteria:**
1. `POST /auth/register` with valid email+password+optional name returns 201 + `accessToken` + `refreshToken` + `user.id`.
2. Duplicate email returns 409.
3. Weak password (<8 chars) returns 400 (validated by `zod`).
4. Successful registration provisions a verification code on the user record (delivered via email service in non-test envs).
5. Mobile + Web register screens collect email/password/name and call the API; on success they route to the verify-email screen.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/auth.ts:107` (`POST /register`)
- Web: `apps/web/src/app/(auth)/register/page.tsx`
- Mobile: `apps/mobile/app/(auth)/register.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/auth.test.ts`, `apps/api/src/__tests__/services/auth.test.ts`
- Web: `apps/web/e2e/auth.spec.ts` (register form rendering + validation, lines 61–110), `apps/web/e2e/api-routes.spec.ts` (`POST /api/auth/register`)
- Mobile: none

**Demo script outline:**
- W: open `/register`, fill realistic NZ tradie name (e.g. "Mike from Mike's Plumbing"), unique-per-run email, strong password; submit; assert navigation to `/verify-email`; assert "Check your email" copy visible.
- A: POST `/auth/register` with curl-equivalent; parse JWT; assert `accessToken` decodes with expected `userId` claim; second POST with same email returns 409.
- M: Maestro flow `02-auth-register.yaml` — launch app, tap "Sign up", fill form, assert next screen is verify-email.

---

### F-AUTH-02 — Login

**User story:** As a returning tradie, I want to log in with email+password and stay logged in across app restarts.
**Acceptance criteria:**
1. `POST /auth/login` with correct credentials returns 200 + `accessToken` + `refreshToken`.
2. Wrong password returns 401.
3. `POST /auth/refresh` with a valid refresh token returns a new `accessToken`.
4. `POST /auth/logout` invalidates the refresh token (subsequent refresh returns 401).
5. Web + Mobile login screens store tokens and route to dashboard / tabs.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/auth.ts:149` (login), `:189` (refresh), `:226` (logout)
- Web: `apps/web/src/app/(auth)/login/page.tsx`
- Mobile: `apps/mobile/app/(auth)/login.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/auth.test.ts`, `apps/api/src/__tests__/middleware/auth.test.ts`
- Web: `apps/web/e2e/auth.spec.ts` (login lines 4–60), `apps/web/e2e/api-routes.spec.ts` (`POST /api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`)
- Mobile: `apps/mobile/__tests__/contexts/AuthContext.test.tsx` (login state management)

**Demo script outline:**
- W: open `/login`, fill credentials from F-AUTH-01 setup; submit; assert dashboard loaded; reload page; assert still logged in (cookie persisted).
- A: login → refresh → logout sequence; assert refresh after logout returns 401.
- M: Maestro flow `03-auth-login.yaml` — launch app (clearState:false to reuse session), assert auto-routes to (tabs) if already logged in; else login flow.

---

### F-AUTH-03 — Email verification (6-digit code)

**User story:** As a new user, I want to verify my email with a 6-digit code so my account is trusted.
**Acceptance criteria:**
1. On register, a 6-digit code is generated and stored on the user (`verification_code`).
2. `POST /auth/verify-email` with correct code marks user `is_verified=true`.
3. Wrong code returns 400.
4. `POST /auth/resend-verification` regenerates the code.
5. Verified state unlocks downstream behaviour (e.g. some feature gates may require verification — verify in Phase 3 by route inspection).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/auth.ts:434` (verify-email), `:486` (resend-verification)
- Web: there is no dedicated `/verify-email` page route in `apps/web/src/app/(auth)/` — **drift candidate, see Drift Appendix**
- Mobile: `apps/mobile/app/(auth)/verify-email.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/auth.test.ts` (verify-email + resend cases)
- Web: none
- Mobile: none

**Demo script outline:**
- A: register (capture code from DB or test hook) → POST `/auth/verify-email` with code → assert 200 + `is_verified=true` in `/auth/me`; resend-verification regenerates code (old code now invalid).
- M: Maestro flow `04-auth-verify-email.yaml` — after F-AUTH-01 flow, enter the 6-digit code (Phase 3 must wire a test hook to surface the code, since real email inspection from Maestro is impractical).
- W: deferred/blocked pending decision on whether Web should have a verify screen (see Drift Appendix item 1).

---

### F-AUTH-04 — Password reset (6-digit code)

**User story:** As a forgetful user, I want to reset my password via a 6-digit code sent to my email.
**Acceptance criteria:**
1. `POST /auth/forgot-password` with a registered email returns 200 (even for unknown emails — anti-enumeration).
2. The user record receives a password reset code (TTL-bounded).
3. `POST /auth/reset-password` with `{email, code, newPassword}` returns 200 and updates the password hash.
4. Old password no longer logs the user in; new password does.
5. Web + Mobile have forgot-password + reset-password screens that drive the API.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/auth.ts:339` (forgot-password), `:371` (reset-password)
- Web: `apps/web/src/app/(auth)/forgot-password/page.tsx`, `apps/web/src/app/(auth)/reset-password/page.tsx`
- Mobile: `apps/mobile/app/(auth)/forgot-password.tsx`, `apps/mobile/app/(auth)/reset-password.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/auth.test.ts` (password reset flows)
- Web: `apps/web/e2e/password-reset-smoke.spec.ts`
- Mobile: none

**Demo script outline:**
- W: open `/forgot-password`, enter known email; assert success copy; navigate to `/reset-password` with `{email, code}` query params (or copy-paste from test hook); enter new password; submit; assert redirect to login.
- A: forgot → capture code → reset → login with new password (and confirm old password fails).
- M: Maestro flow `05-auth-password-reset.yaml` covering forgot → reset → login.

---

### F-AUTH-05 — Onboarding wizard (trade type, company, bank)

**User story:** As a verified user, I want to complete onboarding in 3 steps (trade type, company details, bank details) so my SWMS, invoices, and tax behaviour are pre-configured.
**Acceptance criteria:**
1. `POST /auth/complete-onboarding` accepts trade type + company fields + bank fields.
2. The user record is updated with `tradeType`, `companyName`, `gstNumber`, `bankAccount`, etc.
3. After onboarding, `GET /auth/me` reflects the new fields.
4. Mobile onboarding screen presents 3 steps with progress indicator.
5. Skipping onboarding (e.g. logging out mid-flow) leaves user in a state where onboarding can be resumed.

**Surfaces:** W partial (no dedicated wizard page — onboarding lives in Settings on Web) A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/auth.ts:515` (`POST /complete-onboarding`); also `apps/api/src/routes/business-profile.ts:48` (GET/PUT business profile is a related surface)
- Web: no `/onboarding` page — **drift candidate, see Drift Appendix item 2** (Web users may onboard via `/settings`)
- Mobile: `apps/mobile/app/(auth)/onboarding.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/auth.test.ts`, `apps/api/src/__tests__/routes/business-profile.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: after F-AUTH-03 verify, POST `/auth/complete-onboarding` with realistic NZ payload (`tradeType: "electrician"`, `companyName: "Mike's Sparkies Ltd"`, `gstNumber: "123-456-789"`); assert `/auth/me` reflects.
- M: Maestro flow `06-auth-onboarding.yaml` — 3 screen sequence, takeScreenshot per step.
- W: blocked / partial — exercises `GET/PUT /api/v1/business-profile` via `/settings` page instead.

---

## Module 2 — Compliance (4 features)

### F-COMP-01 — SWMS generator (AI-powered)

**User story:** As a tradie, I want to generate a Safe Work Method Statement (SWMS) tailored to my trade and job, using AI to suggest hazards + controls, so I can submit it to site managers.
**Acceptance criteria:**
1. `GET /api/v1/swms/templates` returns a list of available trade templates.
2. `GET /api/v1/swms/templates/:tradeType` returns the full template for that trade.
3. `POST /api/v1/swms` (with subscription gate `requireFeature('swms')` or limit gate) accepts job description + trade type + site address; the service calls Claude API and persists the resulting SWMS document.
4. The persisted SWMS contains structured fields: hazards[], controls[], regulations[].
5. Free tier limit (2 SWMS/month) is enforced.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/swms.ts:61,73,99,153,176,203,269,318`; `apps/api/src/services/claude.ts`
- Web: `apps/web/src/app/(dashboard)/swms/page.tsx`
- Mobile: `apps/mobile/app/swms/generate.tsx`, `apps/mobile/app/swms/[id].tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/swms.test.ts`, `apps/api/src/__tests__/services/swms.test.ts`, `apps/api/src/__tests__/services/claude.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- W: open `/swms`, tap "Generate SWMS", select trade (electrician), enter job description ("install 3-phase distribution board at commercial site"), submit; assert hazards + controls populate; assert document appears in list.
- A: POST `/api/v1/swms` with realistic payload; assert 201 + claude-derived hazards array length ≥3. (Note: real Claude call costs ~$0.01; Phase 3 should cap at 1–2 calls per run.)
- M: Maestro flow `07-comp-swms-generate.yaml` — tap Work tab → Generate → fill form → assert "SWMS generated" copy.

---

### F-COMP-02 — Risk assessment builder

**User story:** As a tradie, I want to add/edit hazards and controls on a SWMS (with AI suggestions) so the document fits my specific site.
**Acceptance criteria:**
1. `PUT /api/v1/swms/:id` accepts an edited hazards/controls array.
2. AI-suggestion endpoints (if separate) accept partial context and return suggestions — confirm in code whether these are inline or separate routes during Phase 3 read.
3. Risk levels (low/medium/high) can be set per hazard.
4. Updates persist and reload correctly.
5. Mobile view shows editable hazard list with add/remove affordances.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/swms.ts:203` (`PUT /:id`); AI sub-routes (if any) live within `swms.ts` — Phase 3 to enumerate.
- Web: `apps/web/src/app/(dashboard)/swms/page.tsx` (list view; edit is currently part of the same page or follow-up)
- Mobile: `apps/mobile/app/swms/[id].tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/swms.test.ts` (update + edit cases)
- Web: none
- Mobile: none

**Demo script outline:**
- A: create SWMS via F-COMP-01; PUT with modified hazards array; GET back; assert new hazards persisted.
- M: navigate to SWMS detail, edit a hazard, save, re-open, assert change visible.
- W: blocked / partial pending dedicated edit page (drift candidate).

---

### F-COMP-03 — WorkSafe checklists / NZ regulation references

**User story:** As a PCBU (Person Conducting a Business or Undertaking), I want my SWMS to cite the right NZ regulations (HSWA 2015, WorkSafe Guidelines) so I can pass an audit.
**Acceptance criteria:**
1. Generated SWMS contains a `regulations[]` field with citations.
2. Trade templates pre-populate baseline regulations.
3. AI-augmented generation enriches regulation citations relevant to the job.
4. Regulation text references the act + section number (verifiable against `Health and Safety at Work Act 2015`).

**Surfaces:** W partial (read-only display) A ✓ M partial (read-only display)
**Implementing code:**
- API: `apps/api/src/routes/swms.ts` + `apps/api/src/services/claude.ts` (template + AI body)
- Web: `apps/web/src/app/(dashboard)/swms/page.tsx`
- Mobile: `apps/mobile/app/swms/[id].tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/services/swms.test.ts`, `apps/api/src/__tests__/services/claude.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: GET SWMS from F-COMP-01; assert `regulations` array non-empty; assert at least one entry references "Health and Safety at Work Act 2015".
- W + M: assert regulations section renders in detail view (screenshot).

---

### F-COMP-04 — SWMS PDF export + digital signature

**User story:** As a tradie, I want to export my SWMS as a branded PDF and sign it digitally so site managers can accept it.
**Acceptance criteria:**
1. PDF export endpoint returns `Content-Type: application/pdf`, non-zero bytes.
2. The PDF includes the SWMS body, regulations, hazards, controls, and the tradie's company details.
3. `POST /api/v1/swms/:id/sign` accepts a signature payload and marks the SWMS as signed.
4. Signed state appears on subsequent GETs.
5. Re-signing is allowed / forbidden per spec — Phase 3 to confirm in route code.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/swms.ts:318` (`POST /:id/sign`); PDF generation in `apps/api/src/services/pdf.ts`
- Web: `apps/web/src/app/(dashboard)/swms/page.tsx` (download button — to confirm)
- Mobile: `apps/mobile/app/swms/[id].tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/swms.test.ts`, `apps/api/src/__tests__/services/pdf.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: create SWMS → GET its PDF → assert `Content-Type` + size; POST `/sign`; GET again, assert `signed_at` populated.
- W: click "Export PDF", assert file downloads; click "Sign", complete signature, assert badge updates.
- M: Maestro flow `08-comp-swms-pdf-sign.yaml`.

---

## Module 3 — Certifications (3 features)

### F-CERT-01 — Create/list/edit certifications

**User story:** As a tradie, I want to track my trade certifications (electrical, gas, scaffolding) with expiry dates so I never let a license lapse.
**Acceptance criteria:**
1. `POST /api/v1/certifications` accepts `{name, type, issuedDate, expiryDate, certificateNumber}` and returns 201.
2. `GET /api/v1/certifications` returns the tradie's certs (multi-tenant isolated).
3. `PUT /api/v1/certifications/:id` updates fields.
4. `DELETE /api/v1/certifications/:id` soft- or hard-deletes (Phase 3 confirm).
5. Certs are private to the user (verified by multi-tenant isolation spec).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/certifications.ts:53,85,110,132,162,204`
- Web: `apps/web/src/app/(dashboard)/certifications/page.tsx`
- Mobile: `apps/mobile/app/certifications/index.tsx`, `apps/mobile/app/certifications/add.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/certifications.test.ts`, `apps/api/src/__tests__/services/certifications.test.ts`
- Web: `apps/web/e2e/multi-tenant-isolation-entities.spec.ts` (certs isolation)
- Mobile: none

**Demo script outline:**
- A: full CRUD round-trip with realistic NZ cert (e.g. "EWRB practising license", expiry next year).
- W: open `/certifications`, "Add cert", fill form, save, assert list shows the cert.
- M: People tab → "+ Cert", fill form, save, assert in list.

---

### F-CERT-02 — Expiry tracking + scheduled notifications (30/14/7/1 days)

**User story:** As a tradie, I want push notifications when a cert is 30/14/7/1 days from expiry so I have time to renew.
**Acceptance criteria:**
1. `GET /api/v1/certifications/expiring` returns certs with expiry within a configurable window (default 30d).
2. A scheduled job (`apps/api/src/services/cron.ts` or `notifications.ts`) evaluates expiring certs daily.
3. Push notification is sent at each threshold (30/14/7/1 days) — exactly once per threshold per cert.
4. `POST /api/v1/notifications/check-expiry` triggers the same evaluation on-demand (for tests).
5. Notifications include cert name + days remaining + a deep link to the cert detail.

**Surfaces:** W partial (banner / count badge) A ✓ M ✓ (actual push delivery)
**Implementing code:**
- API: `apps/api/src/routes/certifications.ts:110` (`/expiring`); `apps/api/src/routes/notifications.ts:135` (`POST /check-expiry`); `apps/api/src/services/notifications.ts` (Expo Push); cron in `apps/api/src/services/cron.ts`
- Web: dashboard stats include expiring count — read in F-STAT-01
- Mobile: deep-link target is `apps/mobile/app/certifications/[id]?.tsx` (Phase 3 to confirm detail route exists; currently `certifications/index.tsx` + `add.tsx` only)

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/certifications.test.ts` (expiring endpoint), `apps/api/src/__tests__/routes/notifications.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: seed a cert with `expiryDate = today + 7 days`; POST `/notifications/check-expiry`; assert notification record created; assert push payload formed (verify against captured/mock Expo Push call).
- M: render cert with imminent expiry, screenshot the banner.

---

### F-CERT-03 — Cert document upload (photo attachment)

**User story:** As a tradie, I want to attach a photo of my cert document to the cert record so I have it on hand for site checks.
**Acceptance criteria:**
1. `POST /api/v1/photos` with `entityType=certification`, `entityId=<cert id>` uploads the file.
2. `GET /api/v1/photos/certification/:certId` lists attachments for that cert.
3. The photo file is fetched via `GET /api/v1/photos/:id/file`.
4. Subscription gate `requireFeature('photos')` applies (Tradie+ only; free tier blocked).
5. Mobile uses expo-image-picker (camera or gallery); web uses file input.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/photos.ts:67,133,167,202`
- Web: cert page (`apps/web/src/app/(dashboard)/certifications/page.tsx`) — attachment UI TBD by Phase 3
- Mobile: `apps/mobile/app/certifications/add.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/photos.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: create cert (F-CERT-01) → POST photo with multipart; GET list; assert photo present.
- M: in cert add flow, tap "Add photo", pick from gallery (Maestro stub photo), assert thumbnail in list.

---

## Module 4 — Invoices (10 features)

### F-INV-01 — Create invoice (with line items + GST)

**User story:** As a tradie, I want to create a NZ-GST invoice with multiple line items and email it to a customer.
**Acceptance criteria:**
1. `POST /api/v1/invoices` accepts `{customer, lineItems[], dueDate, …}` and returns 201 with totals computed (subtotal, GST, total).
2. Free tier `checkLimit('invoice')` enforces 3 invoices/month.
3. Created invoice defaults to `status=draft`.
4. NZ GST is 15% (verify default rate).
5. Line items support qty × unit price; tax handled at invoice level (verify in code).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/invoices.ts:70`
- Web: `apps/web/src/app/(dashboard)/invoices/new/page.tsx`
- Mobile: `apps/mobile/app/invoices/create.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/invoices.test.ts`, `apps/api/src/__tests__/services/invoices.test.ts`, `apps/api/src/__tests__/middleware/subscription.test.ts`
- Web: `apps/web/e2e/multi-tenant-isolation.spec.ts` (invoice isolation), `apps/web/e2e/multi-tenant-isolation-entities.spec.ts`
- Mobile: none

**Demo script outline:**
- W: open `/invoices/new`, add customer (existing or quick-create), add 2 line items, set due-date +14d, save, assert appears in `/invoices` list with status "Draft" and correct total.
- A: POST with NZ-tradie payload ($1,250 + GST = $1,437.50); assert math.
- M: Money tab → "+ Invoice" → fill → save.

---

### F-INV-02 — List invoices (filter by status)

**User story:** As a tradie, I want to filter my invoices by status (draft / sent / paid / overdue) to focus on what needs work.
**Acceptance criteria:**
1. `GET /api/v1/invoices` returns the user's invoices, multi-tenant isolated.
2. `?status=draft` (etc.) filters.
3. Pagination / ordering — confirm in Phase 3 (likely newest-first).
4. List view shows: customer, amount, due date, status badge.
5. Empty state copy displayed when no invoices.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/invoices.ts:105`
- Web: `apps/web/src/app/(dashboard)/invoices/page.tsx`
- Mobile: `apps/mobile/app/(tabs)/money.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/invoices.test.ts`
- Web: covered indirectly by isolation specs
- Mobile: none

**Demo script outline:**
- A: list with no filter → with `?status=draft` → with `?status=sent`; assert counts shift.
- W/M: visually filter via segmented control, screenshot.

---

### F-INV-03 — Update invoice (draft only)

**User story:** As a tradie, I want to edit a draft invoice before sending it.
**Acceptance criteria:**
1. `PUT /api/v1/invoices/:id` succeeds when status=draft.
2. PUT on a non-draft invoice returns 400 or 409.
3. Updates persist (line items can be added/removed).
4. Editing recomputes totals.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/invoices.ts:187`
- Web: `apps/web/src/app/(dashboard)/invoices/[id]/page.tsx`
- Mobile: `apps/mobile/app/invoices/[id].tsx`

**Existing test coverage:** `apps/api/src/__tests__/routes/invoices.test.ts`

**Demo script outline:**
- A: PUT draft → succeeds; mark sent → PUT → 4xx.
- W/M: edit draft, save, see updated total.

---

### F-INV-04 — Mark as sent

**User story:** As a tradie, I want to mark an invoice as sent so it stops appearing in my draft list.
**Acceptance criteria:**
1. `POST /api/v1/invoices/:id/send` transitions status draft → sent.
2. `sent_at` timestamp populated.
3. Status now appears in sent list.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/invoices.ts:265`
**Existing test coverage:** `apps/api/src/__tests__/routes/invoices.test.ts`
**Demo script outline:** A: state transition test. W/M: tap "Mark sent" button, assert status badge changes.

---

### F-INV-05 — Mark as paid

**User story:** As a tradie, I want to mark an invoice as paid (manually) once the customer has paid me by bank transfer.
**Acceptance criteria:**
1. `POST /api/v1/invoices/:id/paid` transitions status to paid.
2. `paid_at` populated.
3. Paid amount equals invoice total (or partial — confirm in Phase 3).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/invoices.ts:378`
**Existing test coverage:** `apps/api/src/__tests__/routes/invoices.test.ts`
**Demo script outline:** A: send → paid transition. W/M: tap "Mark paid", confirm state.

---

### F-INV-06 — PDF export

**User story:** As a tradie, I want a branded PDF of my invoice to send via email or print.
**Acceptance criteria:**
1. `GET /api/v1/invoices/:id/pdf` returns `Content-Type: application/pdf`.
2. PDF contains customer name, line items, GST line, total, company details.
3. Subscription gate `requireFeature('pdfExport')` — Tradie+ only.
4. Free-tier user attempting download gets 403 + tier-upgrade prompt.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/invoices.ts:158`; `apps/api/src/services/pdf.ts`
**Existing test coverage:** `apps/api/src/__tests__/routes/invoices.test.ts`, `apps/api/src/__tests__/services/pdf.test.ts`
**Demo script outline:** A: GET PDF, parse header, assert size > 5KB. W: click "Download PDF", assert file. M: tap "PDF", view in OS viewer (Maestro screenshot only).

---

### F-INV-07 — Email invoice to customer (one-tap send)

**User story:** As a tradie, I want to email an invoice PDF to my customer with one tap.
**Acceptance criteria:**
1. `POST /api/v1/invoices/:id/email` accepts an optional override `to` email.
2. Default `to` is the customer's recorded email.
3. Email body contains a link to the public share page.
4. PDF attached.
5. Subscription gate `requireFeature('emailInvoice')`.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/invoices.ts:293`; `apps/api/src/services/email.ts`
**Existing test coverage:** `apps/api/src/__tests__/routes/invoices.test.ts`, `apps/api/src/__tests__/services/email.test.ts`
**Demo script outline:**
- A: POST email; assert 200; verify in captured email (Resend test capture or mock) the to-address, subject, attachment.
- W/M: open invoice detail, tap "Email", confirm, assert success toast.

---

### F-INV-08 — Public share link (no auth)

**User story:** As a customer, I want to view a tradie's invoice via a link without needing an account.
**Acceptance criteria:**
1. `POST /api/v1/invoices/:id/share` generates a share token.
2. `GET /api/v1/public/invoices/:token` returns server-rendered HTML.
3. Invalid / expired / short tokens return error pages.
4. The public page also offers a Stripe Payment Link "Pay Now" button when the invoice is unpaid (see F-STRIPE-04).

**Surfaces:** W ✓ A ✓ M – (link opens in browser, not in-app)
**Implementing code:** `apps/api/src/routes/invoices.ts:409` (share-token issuance); `apps/api/src/routes/public.ts:20`
**Existing test coverage:** `apps/api/src/__tests__/routes/public.test.ts`
**Demo script outline:**
- A: issue share → curl public URL with no auth → assert HTML body contains customer + line items.
- W: open the public URL in incognito context, assert rendered.

---

### F-INV-09 — Recurring invoices (weekly/fortnightly/monthly/quarterly/annually)

**User story:** As a tradie with recurring clients (e.g. monthly maintenance), I want to schedule invoices to auto-generate.
**Acceptance criteria:**
1. `POST /api/v1/recurring-invoices` accepts `{interval, startDate, endDate?, template}`.
2. Supported intervals: weekly, fortnightly, monthly, quarterly, annually.
3. `POST /api/v1/recurring-invoices/:id/generate` (or scheduled job) creates the next invoice.
4. `GET /api/v1/recurring-invoices/pending` shows the next-up.
5. CRUD operations work; PUT updates the schedule.

**Surfaces:** W partial (no recurring page found on Web yet) A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/recurring-invoices.ts:59,91,116,135,165,207,237,270`
- Web: **no `/recurring` page** — see Drift Appendix item 3
- Mobile: `apps/mobile/app/recurring/index.tsx`, `apps/mobile/app/recurring/create.tsx`, `apps/mobile/app/recurring/generate.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/recurring-invoices.test.ts`, `apps/api/src/__tests__/services/recurring-invoices.test.ts`, `apps/api/src/__tests__/services/recurring-invoices-async.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: create monthly recurring → POST generate → assert new invoice exists with status=draft and correct due-date.
- M: Maestro flow `09-inv-recurring.yaml` — Recurring screen → create → list shows.

---

### F-INV-10 — Bank reconciliation (auto-match)

**User story:** As a tradie, I want to upload my bank statement and have BossBoard match transactions to invoices automatically.
**Acceptance criteria:**
1. `POST /api/v1/bank-transactions/upload` accepts a CSV / file payload.
2. `POST /api/v1/bank-transactions/auto-match` matches uploaded transactions to invoices by amount + date window.
3. `POST /api/v1/bank-transactions/:id/confirm` accepts a manual match.
4. `POST /api/v1/bank-transactions/:id/unmatch` reverses.
5. `GET /api/v1/bank-transactions/summary` shows match-rate stats.

**Surfaces:** W partial (no bank page on Web) A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/bank-transactions.ts:30,75,104,122,153,184`
- Web: **no `/bank` page** — see Drift Appendix item 4
- Mobile: `apps/mobile/app/bank/index.tsx`, `apps/mobile/app/bank/upload.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/bank-transactions.test.ts`, `apps/api/src/__tests__/services/bank-transactions.test.ts`
- Web: none
- Mobile: none

**Demo script outline:**
- A: seed 3 invoices → upload CSV containing matching amounts → auto-match → assert N matches with confidence scores.
- M: Maestro flow `10-inv-bank-recon.yaml` — upload screen, screenshot match results.

---

## Module 5 — Quotes (3 features)

### F-QUO-01 — Create quote

**User story:** As a tradie, I want to send a quote (estimate) to a prospect; once accepted, convert it to an invoice.
**Acceptance criteria:**
1. `POST /api/v1/quotes` creates a quote with line items, valid-until date, customer.
2. Subscription gate `requireFeature('quotes')` — Tradie+ only.
3. `GET /api/v1/quotes`, `GET /:id`, `PUT /:id`, `DELETE /:id` CRUD.
4. State transitions: draft → sent → accepted/declined (via `POST /:id/send`, `/accept`, `/decline`).
5. Multi-tenant isolated.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/quotes.ts:66,101,124,151,181,232,259,287,315,343`
- Web: `apps/web/src/app/(dashboard)/quotes/page.tsx`, `apps/web/src/app/(dashboard)/quotes/[id]/page.tsx`
- Mobile: `apps/mobile/app/quotes/index.tsx`, `apps/mobile/app/quotes/create.tsx`, `apps/mobile/app/quotes/[id].tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/quotes.test.ts`, `apps/api/src/__tests__/services/quotes.test.ts`
- Web: none specific
- Mobile: none

**Demo script outline:**
- A: full CRUD + state transitions; verify `requireFeature` returns 403 for free tier.
- W: create + send + accept simulation.
- M: same.

---

### F-QUO-02 — Quote PDF export

**User story:** As a tradie, I want a branded PDF of my quote.
**Acceptance criteria:**
1. `GET /api/v1/quotes/:id/pdf` returns PDF.
2. Same gate as creation (`requireFeature('quotes')`).
3. Contains line items, valid-until, total inc GST.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/quotes.ts:151`; `apps/api/src/services/pdf.ts`
**Existing test coverage:** `apps/api/src/__tests__/routes/quotes.test.ts`, `apps/api/src/__tests__/services/pdf.test.ts`
**Demo script outline:** mirror of F-INV-06.

---

### F-QUO-03 — Convert quote to invoice

**User story:** As a tradie, once a customer accepts my quote, I want one-tap conversion to an invoice with the same line items.
**Acceptance criteria:**
1. `POST /api/v1/quotes/:id/convert` creates a new draft invoice from the quote.
2. The quote is marked as converted (and linked back via `invoice_id`).
3. Line items copy verbatim.
4. The new invoice respects `checkLimit('invoice')` for free tier.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/quotes.ts:343`
**Existing test coverage:** `apps/api/src/__tests__/routes/quotes.test.ts`
**Demo script outline:**
- A: create quote → accept → convert → assert invoice exists with matching items; assert quote linked.
- W/M: tap "Convert to invoice" from quote detail.

---

## Module 6 — Expenses (3 features)

### F-EXP-01 — Create expense (with category + receipt photo)

**User story:** As a tradie, I want to snap a receipt, categorise it, and record GST claimability.
**Acceptance criteria:**
1. `POST /api/v1/expenses` accepts `{amount, category, vendor, date, gstClaimable}` and returns 201.
2. Categories enumerated (e.g. materials, fuel, tools, vehicle, accommodation, training, other — confirm in Phase 3).
3. Subscription gate `requireFeature('expenses')`.
4. Photos (F-PHOTO-01) can attach via `entityType=expense`.
5. GST claimable flag persists.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/expenses.ts:49`
- Web: `apps/web/src/app/(dashboard)/expenses/page.tsx`
- Mobile: `apps/mobile/app/expenses/index.tsx`, `apps/mobile/app/expenses/create.tsx`

**Existing test coverage:**
- API: `apps/api/src/__tests__/routes/expenses.test.ts`, `apps/api/src/__tests__/services/expenses.test.ts`
**Demo script outline:** A: create with valid payload; assert 201. W/M: create, attach photo, save.

---

### F-EXP-02 — List/filter expenses by category + monthly summary

**User story:** As a tradie, I want to see my expenses by month and category for tax/GST reporting.
**Acceptance criteria:**
1. `GET /api/v1/expenses` lists all; `?category=materials` filters.
2. `GET /api/v1/expenses/stats` returns category totals + GST claimable total.
3. `GET /api/v1/expenses/monthly` returns by-month aggregation.
4. Multi-tenant isolated.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/expenses.ts:77,103,121`
**Existing test coverage:** `apps/api/src/__tests__/routes/expenses.test.ts`
**Demo script outline:** A: filter + stats + monthly; assert math. W/M: open list, switch category filter chips.

---

### F-EXP-03 — Update / delete expense

**Acceptance criteria:** PUT updates fields; DELETE removes (soft or hard — Phase 3 confirm); both gated by ownership.
**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/expenses.ts:158,190`
**Existing test coverage:** `apps/api/src/__tests__/routes/expenses.test.ts`
**Demo script outline:** A: CRUD round-trip. W/M: tap edit/delete in row.

---

## Module 7 — Job logs (3 features)

### F-JOB-01 — Create job log + clock in

**User story:** As a tradie, I want a timer to track time on each job with site address + notes.
**Acceptance criteria:**
1. `POST /api/v1/job-logs` accepts `{customer, siteAddress, startedAt, notes?}` and starts the clock.
2. Subscription gate `requireFeature('jobLogs')`.
3. `GET /api/v1/job-logs/active` returns the currently-clocked-in job (if any).
4. Only one active job at a time per user (confirm in Phase 3).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/job-logs.ts:44,79`
- Web: `apps/web/src/app/(dashboard)/job-logs/page.tsx`
- Mobile: `apps/mobile/app/jobs/index.tsx`, `apps/mobile/app/jobs/create.tsx`

**Existing test coverage:** `apps/api/src/__tests__/routes/job-logs.test.ts`
**Demo script outline:** A: clock in, GET active. W/M: tap "Clock in", assert timer starts.

---

### F-JOB-02 — Clock out + add notes

**Acceptance criteria:**
1. `POST /api/v1/job-logs/:id/clock-out` ends the clock; `ended_at` set; duration computed.
2. `PUT /api/v1/job-logs/:id` allows note edits post-clock-out.
3. CRUD list/detail/delete via standard routes.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/job-logs.ts:191,226,261,166`
**Existing test coverage:** `apps/api/src/__tests__/routes/job-logs.test.ts`
**Demo script outline:** A: clock in → out → assert duration > 0. W/M: stop button.

---

### F-JOB-03 — Job log stats

**Acceptance criteria:**
1. `GET /api/v1/job-logs/stats` returns aggregated total hours, hours-by-job, hours-by-week.
2. Multi-tenant isolated.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/job-logs.ts:104`
**Existing test coverage:** `apps/api/src/__tests__/routes/job-logs.test.ts`
**Demo script outline:** A: assert stats response shape + math. W/M: open stats screen, screenshot.

---

## Module 8 — Photos (2 features)

### F-PHOTO-01 — Upload photo from camera/gallery

**User story:** As a tradie, I want to attach photos to any entity (SWMS, invoice, expense, job, cert).
**Acceptance criteria:**
1. `POST /api/v1/photos` (multipart) with `entityType` + `entityId` accepts a file.
2. Subscription gate `requireFeature('photos')`.
3. File size + mime-type validation (Phase 3 confirm limits).
4. Storage location TBD by Phase 3 (local disk vs object store).

**Surfaces:** W ✓ A ✓ M ✓ (mobile uses expo-image-picker)
**Implementing code:** `apps/api/src/routes/photos.ts:67`
**Existing test coverage:** `apps/api/src/__tests__/routes/photos.test.ts`
**Demo script outline:** A: upload with curl + multipart; assert response. M: tap "+", camera/gallery, screenshot.

---

### F-PHOTO-02 — List photos by entity + fetch file

**Acceptance criteria:**
1. `GET /api/v1/photos/:entityType/:entityId` returns the photo list (with thumbnails / IDs).
2. `GET /api/v1/photos/:id/file` returns the binary.
3. `DELETE /api/v1/photos/:id` deletes (owner-only).
4. Multi-tenant isolated.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/photos.ts:133,167,202`
**Existing test coverage:** `apps/api/src/__tests__/routes/photos.test.ts`
**Demo script outline:** A: list + get-file headers. W/M: render gallery.

---

## Module 9 — Teams (4 features)

### F-TEAM-01 — Create team (owner)

**User story:** As a small-crew owner, I want to create a team so I can invite my staff.
**Acceptance criteria:**
1. `POST /api/v1/teams` creates a team and makes the caller the owner.
2. Owner cannot create a second team (one-team-per-user — Phase 3 confirm).
3. `GET /api/v1/teams/my-team` returns the user's team.
4. Team subscription required (`team` tier or beta mode).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/teams.ts:46,70`
**Existing test coverage:** `apps/api/src/__tests__/routes/teams.test.ts`, `apps/api/src/__tests__/services/teams.test.ts`
**Demo script outline:** A: POST, GET my-team. W/M: open Teams, tap "Create team".

---

### F-TEAM-02 — Invite member (6-char invite code)

**User story:** As a team owner, I want to invite a member via email; they receive an invite code.
**Acceptance criteria:**
1. `POST /api/v1/teams/:teamId/invites` accepts email + role; returns invite with code.
2. `checkLimit('teamMember')` enforces ≤5 (team tier limit).
3. Email is dispatched (Resend) with the code + accept link.
4. `GET /api/v1/teams/:teamId/invites` lists pending invites; `DELETE` cancels.
5. Re-invite same email handles duplicates gracefully (idempotent or 409 — Phase 3 confirm).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/teams.ts:268,296,310`
**Existing test coverage:** `apps/api/src/__tests__/routes/teams.test.ts`
**Demo script outline:** A: invite → list pending → cancel. W/M: invite from teams screen, screenshot.

---

### F-TEAM-03 — Accept/decline invite

**Acceptance criteria:**
1. `GET /api/v1/teams/invites/pending` returns invites the current user has received.
2. `POST /api/v1/teams/invites/:inviteCode/accept` joins the team.
3. `POST /api/v1/teams/invites/:inviteCode/decline` rejects.
4. Accepting transitions the user's `team_id`.
5. User can only belong to one team (Phase 3 confirm).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/teams.ts:97,111,125`
**Existing test coverage:** `apps/api/src/__tests__/routes/teams.test.ts`
**Demo script outline:** A: 2-user fixture — invite + accept; assert team_id update. W/M: open pending invites, tap accept.

---

### F-TEAM-04 — Member role management (owner/admin/worker) + leave

**Acceptance criteria:**
1. `GET /api/v1/teams/:teamId/members` lists members with roles.
2. `PUT /api/v1/teams/:teamId/members/:memberId/role` updates role (owner-only).
3. `DELETE /api/v1/teams/:teamId/members/:memberId` removes (owner-only).
4. `POST /api/v1/teams/:teamId/leave` lets a non-owner leave.
5. Owner cannot leave without transferring ownership (Phase 3 confirm policy).

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/teams.ts:189,203,221,250`
**Existing test coverage:** `apps/api/src/__tests__/routes/teams.test.ts`
**Demo script outline:** A: role update, removal, leave (negative cases for non-owner). W/M: tap row, change role.

---

## Module 10 — Subscriptions (4 features)

### F-SUB-01 — View tier definitions

**Acceptance criteria:**
1. `GET /api/v1/subscriptions/tiers` (public, no auth) returns 3 tiers: free, tradie, team.
2. Each tier exposes price, currency, limits, features array.
3. Mobile + Web subscription screens render the comparison.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:** `apps/api/src/routes/subscriptions.ts:32`; `apps/api/src/services/subscriptions.ts`
**Existing test coverage:** `apps/api/src/__tests__/routes/subscriptions.test.ts`, `apps/api/src/__tests__/services/subscriptions.test.ts`
**Demo script outline:** A: GET tiers, assert shape. W/M: open subscription screen, screenshot.

---

### F-SUB-02 — Tier gating (feature access)

**Acceptance criteria:**
1. Middleware `requireFeature('X')` blocks free tier from PDF, email, photos, quotes, expenses, jobLogs.
2. 403 response includes `error: 'FEATURE_GATED'` (or similar) + upgrade path.
3. Beta mode (`isBetaMode()`) bypasses gates — confirm in current config.
4. `GET /api/v1/subscriptions/me` returns current user's tier + feature map.

**Surfaces:** W partial (UI affordances disabled / hidden) A ✓ M partial
**Implementing code:** `apps/api/src/middleware/subscription.ts`; `apps/api/src/routes/subscriptions.ts:54`
**Existing test coverage:** `apps/api/src/__tests__/middleware/subscription.test.ts`
**Demo script outline:** A: free-tier user calls `POST /api/v1/quotes` → assert 403 with reason; tradie-tier passes. (If beta mode active, this AC is bypassed — note in report.)

---

### F-SUB-03 — Usage tracking (invoice / SWMS counts)

**Acceptance criteria:**
1. `GET /api/v1/subscriptions/usage` returns current period usage (invoice count, SWMS count) for the user.
2. Counts reset at month boundary.
3. Increments on each successful POST.

**Surfaces:** A ✓ W ✓ M ✓
**Implementing code:** `apps/api/src/routes/subscriptions.ts:88`
**Existing test coverage:** `apps/api/src/__tests__/routes/subscriptions.test.ts`
**Demo script outline:** A: create 2 invoices → GET usage → assert count=2.

---

### F-SUB-04 — Limit enforcement (free: 3 invoices/mo, 2 SWMS/mo)

**Acceptance criteria:**
1. Free tier: 4th invoice POST returns 403 with limit reason.
2. Free tier: 3rd SWMS POST returns 403.
3. `GET /api/v1/subscriptions/limits` returns the active limits.
4. Beta mode bypasses (confirm).
5. Tradie+ tiers have unlimited.

**Surfaces:** A ✓ W partial (upgrade prompt) M partial (upgrade prompt)
**Implementing code:** `apps/api/src/routes/subscriptions.ts:122`; `apps/api/src/middleware/subscription.ts:checkLimit`
**Existing test coverage:** `apps/api/src/__tests__/middleware/subscription.test.ts`
**Demo script outline:** A: 3 invoices succeed, 4th fails. W/M: upgrade banner appears at limit.

---

## Module 11 — Stats & insights (1 feature)

### F-STAT-01 — Dashboard stats + insights

**Acceptance criteria:**
1. `GET /api/v1/stats/dashboard` returns SWMS count, invoice count (by status), expiring certs, revenue this-month vs last, % change.
2. `GET /api/v1/stats/insights` returns: outstanding invoice aging buckets (0–30, 31–60, 61–90, 90+), top 5 customers by revenue, 6-month revenue chart series.
3. Multi-tenant isolated.
4. Empty-account returns zeros, not nulls.

**Surfaces:** W ✓ A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/stats.ts:21,76`
- Web: `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- Mobile: `apps/mobile/app/(tabs)/index.tsx`

**Existing test coverage:** `apps/api/src/__tests__/routes/stats.test.ts`, `apps/api/src/__tests__/services/insights.test.ts`
**Demo script outline:**
- A: seed account → assert response shape.
- W: open dashboard, assert chart renders, top-customers list non-empty.
- M: Home tab, screenshot insights cards.

---

## Module 12 — Push notifications (1 feature)

### F-PUSH-01 — Cert expiry reminders via Expo Push

**Acceptance criteria:**
1. `POST /api/v1/notifications/push-token` registers an Expo push token to the user.
2. `DELETE /api/v1/notifications/push-token` removes it.
3. `POST /api/v1/notifications/test` sends a test push to the calling user.
4. Cron / on-demand check (`POST /api/v1/notifications/check-expiry`) dispatches expiry pushes.
5. Notifications deduplicated per threshold (Phase 3 confirm).

**Surfaces:** W – (no push on web) A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/notifications.ts:30,65,90,135`
- Mobile: hook in `apps/mobile/src/services/notifications.ts` (or AuthContext) — Phase 3 confirm location

**Existing test coverage:** `apps/api/src/__tests__/routes/notifications.test.ts`
**Demo script outline:**
- A: register token → POST test → assert Expo Push call dispatched (mock or real test push key).
- M: Maestro flow `11-push-cert-expiry.yaml` — register token on app launch (clearState:true), then API-triggers the test send; screenshot system notification if Maestro can capture.

---

## Module 13 — Public invoice sharing

Public invoice sharing is covered as **F-INV-08** in Module 4 (no separate feature ID).

---

## Module 14 — Stripe billing (subscription flow + Payment Links)

### F-STRIPE-01 — Checkout session creation (tradie tier)

**Acceptance criteria:**
1. `POST /api/v1/subscriptions/checkout` with `{tier: 'tradie', successUrl, cancelUrl}` returns `{sessionId, url}`.
2. Beta mode short-circuits and returns `{betaMode: true}` instead.
3. Stripe customer is created (or reused) for the user.
4. Checkout session URL is openable.
5. Invalid tier returns 400.

**Surfaces:** W ✓ A ✓ M – (Mobile redirects to browser/WebView, which lands on the web success/cancel URL)
**Implementing code:** `apps/api/src/routes/subscriptions.ts:158`; `apps/api/src/services/stripe.ts`
**Existing test coverage:** `apps/api/src/__tests__/routes/subscriptions.test.ts`, `apps/api/src/__tests__/services/stripe.test.ts`
**Demo script outline:**
- A: POST checkout (in non-beta mode); assert `url` matches `checkout.stripe.com/c/pay/...`.
- W: tap "Upgrade to Tradie", open Stripe checkout, fill test card `4242 4242 4242 4242`, assert redirect to successUrl.

---

### F-STRIPE-02 — Checkout session creation (team tier)

Same as F-STRIPE-01 but with `tier: 'team'`; assert session uses the team-tier price ID.
**Surfaces:** W ✓ A ✓ M –
**Implementing code:** `apps/api/src/routes/subscriptions.ts:158` (same handler, branches on tier)
**Existing test coverage:** `apps/api/src/__tests__/routes/subscriptions.test.ts`
**Demo script outline:** as above with team tier.

---

### F-STRIPE-03 — Webhook handling (subscription lifecycle)

**Acceptance criteria:**
1. `POST /webhooks/stripe` verifies signature using `STRIPE_TEST_WEBHOOK_SECRET`.
2. Handles `checkout.session.completed` → activates subscription (sets `subscription_tier`).
3. Handles `customer.subscription.updated` → updates tier.
4. Handles `customer.subscription.deleted` → downgrades to free.
5. Handles `invoice.payment_failed` → records warning state.
6. Invalid signature returns 400.

**Surfaces:** W – A ✓ M –
**Implementing code:** `apps/api/src/routes/stripe-webhook.ts`; `apps/api/src/services/stripe.ts`
**Existing test coverage:** `apps/api/src/__tests__/routes/stripe-webhook.test.ts`, `apps/api/src/__tests__/services/stripe.test.ts`
**Demo script outline:**
- A: post a signed webhook event (Stripe CLI `--print-secret` or constructed locally); assert user tier flips. Negative case: bad signature → 400.

---

### F-STRIPE-04 — Public invoice "Pay Now" (Stripe Payment Link)

**User story:** As a customer viewing a shared invoice link, I want a Pay Now button that opens Stripe Checkout.
**Acceptance criteria:**
1. Public invoice page (F-INV-08) for unpaid invoices includes a Stripe Payment Link button.
2. `apps/api/src/routes/invoices.ts:446` (`POST /:id/payment-link`) creates the Payment Link.
3. Successful payment fires `checkout.session.completed` webhook (F-STRIPE-03), which marks the invoice paid.
4. The page re-renders with `paid` state after webhook lands.
5. Billing portal: `POST /api/v1/subscriptions/portal` returns a portal URL for active subscribers (open redirect validated).

**Surfaces:** W ✓ A ✓ M –
**Implementing code:**
- API: `apps/api/src/routes/invoices.ts:446`; `apps/api/src/routes/public.ts:20`; `apps/api/src/routes/subscriptions.ts:224` (portal); `apps/api/src/services/stripe.ts:getOrCreateInvoicePaymentLink`
**Existing test coverage:** `apps/api/src/__tests__/routes/public.test.ts`, `apps/api/src/__tests__/services/stripe.test.ts`
**Demo script outline:**
- W: open shared invoice URL → click Pay Now → complete Stripe Checkout (test card) → assert page reloads to paid state.

---

## Cross-cutting features (not module-scoped)

### F-X-01 — Multi-tenant isolation

**Acceptance criteria:**
1. Tradie B cannot read/update/delete Tradie A's invoices, quotes, expenses, job logs, certifications, photos.
2. Owner-only mutations are enforced for teams.
3. Token-based public sharing (F-INV-08) bypasses auth ONLY for the specific shared invoice.

**Surfaces:** W ✓ A ✓ M –
**Implementing code:** every authenticated route enforces `req.user.userId` ownership in WHERE clauses.
**Existing test coverage:** `apps/web/e2e/multi-tenant-isolation.spec.ts`, `apps/web/e2e/multi-tenant-isolation-entities.spec.ts`
**Demo script outline:** create 2 users → user B tries to GET user A's invoice ID → assert 404 or 403.

---

### F-X-02 — Offline-first sync (Mobile)

**Acceptance criteria:**
1. Mobile app stores entities in local SQLite (`expo-sqlite`).
2. While offline, creating invoices/SWMS/expenses queues sync ops.
3. `POST /api/v1/sync/batch` accepts queued ops and applies them server-side.
4. `GET /api/v1/sync/status` returns the user's current sync cursor.
5. On reconnect, the mobile sync queue drains; conflicts are surfaced (Phase 3 confirm conflict policy).

**Surfaces:** W – A ✓ M ✓
**Implementing code:**
- API: `apps/api/src/routes/sync.ts:66,734` (very large file — 751 LOC)
- Mobile: `apps/mobile/src/services/` (Phase 3 to confirm exact file)

**Existing test coverage:** `apps/api/src/__tests__/routes/sync.test.ts`
**Demo script outline:**
- A: post a batch of ops, assert server reflects them, sync cursor advances.
- M: Maestro flow `12-x-offline-sync.yaml` — go offline (Maestro `disable-network` or instructed simulator action), create invoice, go online, assert sync.

---

### F-X-03 — Security headers / CSP / branding

**Acceptance criteria:**
1. Web responses include CSP, X-Frame-Options, etc. (verify in Next config).
2. Brand pages title is `BossBoard`, colour palette navy+orange.
3. No leakage of legacy "TradeMate" string in customer-facing pages.

**Surfaces:** W ✓ A partial (response headers only) M –
**Implementing code:** `apps/web/next.config.ts` (or equivalent); page templates.
**Existing test coverage:** `apps/web/e2e/branding.spec.ts`, `apps/web/e2e/page-content-smoke.spec.ts`, `apps/web/e2e/nav-link-smoke.spec.ts`, `apps/web/e2e/production-smoke.spec.ts`
**Demo script outline:** existing branding spec is reference — Phase 3 to extend with full-page screenshot per surface for stakeholder review.

---

## Drift Appendix — spec ↔ code mismatches found during Phase 1 read

Findings to flag to Phase 4's executive gap report:

1. **Web has no `/verify-email` page (F-AUTH-03).** Mobile has one; API supports it. Likely either (a) Web verification is auto-triggered from a deep link in the email, or (b) Web users complete verification via the login flow once the API marks them verified, or (c) the screen is genuinely missing. Phase 3 Agent 1 to verify in code + propose.

2. **Web has no dedicated `/onboarding` wizard page (F-AUTH-05).** Settings page (`apps/web/src/app/(dashboard)/settings/page.tsx`) and `/api/v1/business-profile` likely handle the same data on Web. Mobile has the 3-step wizard. CLAUDE.md lists onboarding wizard as a built feature without surface qualification — acceptable for Mobile but a Web gap.

3. **Web has no `/recurring` page (F-INV-09).** Mobile has full `apps/mobile/app/recurring/*` screens; API has all recurring routes. Web users currently cannot manage recurring invoices.

4. **Web has no `/bank` page (F-INV-10).** Same shape — Mobile + API ready, Web missing.

5. **Customers + Products are first-class API resources but not enumerated in CLAUDE.md "What's Built".**
   - `apps/api/src/routes/customers.ts` (5 endpoints)
   - `apps/api/src/routes/products.ts` (5 endpoints)
   - Both have route tests (`apps/api/src/__tests__/routes/customers.test.ts`, `products.test.ts`) and service tests.
   - Mobile has `apps/mobile/app/customers/*` and `apps/mobile/app/products/*` screens.
   - Web has no customers / products pages.
   - These are referenced in PRODUCT_AND_MARKET_POSITIONING.md ("Customer Management" feature) but not given feature IDs in this matrix because they are supporting CRUD beneath F-INV-01 (invoices need customers) and F-QUO-01. **Phase 3 / Phase 4 should decide whether to promote them to standalone F-CUST-* / F-PROD-* feature IDs.**

6. **Business profile (`/api/v1/business-profile`) is exercised by F-AUTH-05 onboarding but has its own GET/PUT endpoints.** Not promoted to a feature ID — folded under F-AUTH-05. Phase 3 confirm or split.

7. **`/api/v1/legal/*` routes (privacy, terms, support, delete-account, delete-data)** are large (~1109 LOC in `legal.ts`) and customer-facing per NZ data-protection rules. They are not in the plan's 14 modules. **Phase 3 Agent 14 (cross-cutting) should consider adding F-X-04 Legal compliance pages OR an explicit out-of-scope note.**

8. **`apps/web/src/app/page.tsx` (the marketing landing page)** exists but isn't covered by any feature ID in this matrix (landing copy / hero / pricing is product-marketing rather than spec). The `landing.css` and existing `production-smoke.spec.ts` indirectly cover it.

9. **CLAUDE.md says "magic-link login" in the older E2E_TESTING_MATRIX.md, but no `POST /auth/magic-link` route exists.** That row in the old matrix is stale — superseded by F-AUTH-04 (password reset 6-digit code) as the primary alt-login flow. Recorded here so Phase 4 can mark the old matrix as superseded.

10. **`POST /api/v1/notifications/test`** (manual test push) is real-world useful for Phase 3 mobile demos but is implicit infrastructure, not a user-facing feature. Folded into F-PUSH-01.

11. **Feature count vs. plan prose.** The plan's prose says "32 features" (twice: in plan-line summary + the matrix's own header line in the skeleton). The plan's skeleton enumerates **50 feature IDs** explicitly (AUTH-05, COMP-04, CERT-03, INV-10, QUO-03, EXP-03, JOB-03, PHOTO-02, TEAM-04, SUB-04, STAT-01, PUSH-01, STRIPE-04, X-03 = 50). This matrix follows the **skeleton (50)** rather than the prose (32) — the skeleton's per-feature detail is load-bearing for Phase 3 agents. The verification grep target in the spawning prompt says "should be ~32" with a tilde; this matrix returns 50, intentionally exceeding the tilde estimate.

---

## Counts (verification gate)

- Feature IDs (rows starting `### F-`): **50**
  - Module 1 Auth: 5
  - Module 2 Compliance: 4
  - Module 3 Certifications: 3
  - Module 4 Invoices: 10
  - Module 5 Quotes: 3
  - Module 6 Expenses: 3
  - Module 7 Job logs: 3
  - Module 8 Photos: 2
  - Module 9 Teams: 4
  - Module 10 Subscriptions: 4
  - Module 11 Stats: 1
  - Module 12 Push: 1
  - Module 13 (covered by Module 4): 0
  - Module 14 Stripe: 4
  - Cross-cutting: 3
- Modules: **14** (Module 13 intentionally redirects to Module 4)
- Existing API test files cross-referenced: **42** (22 route + 17 service + 3 middleware)
- Existing Web e2e spec files cross-referenced: **10**
- Existing Mobile test files cross-referenced: **1**

This document is the **input to every Phase 3 agent**. They read their assigned module slice and produce demos following the TEMPLATE in plan Task M.1–M.6.
