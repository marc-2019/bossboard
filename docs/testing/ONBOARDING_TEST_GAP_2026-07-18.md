# F-AUTH-05 / Onboarding — testing gap (2026-07-18)

## Trigger

App Review recording session: demo user landed on **mobile setup wizard** and saw errors around **company details**. Expected path for Apple is **already past onboarding → Home → SWMS → invoices**.

## PROVEN

### 1. Spec already admitted Mobile tests = none

`docs/testing/SPEC_AND_DEMOS_MATRIX.md` F-AUTH-05:

| Surface | Coverage listed |
|---------|-----------------|
| API | unit routes + service |
| Web | none (drift: no wizard) |
| **Mobile** | **none** |

Checklist debt: `MASTER_LAUNCH_CHECKLIST.md` still has “Onboarding wizard tested and refined” unchecked in places while also claiming the wizard is “already built”.

### 2. What *is* tested (happy path only)

| Layer | File | What it proves | What it misses |
|-------|------|----------------|----------------|
| API unit | `business-profile.test.ts` | Rejects `companyEmail: 'not-an-email'`; accepts valid partial | Empty string `""` / whitespace (Zod treats `""` as invalid email — mobile usually coerces, API does not if raw `""` sent) |
| API unit | `auth-recovery.test.ts` | `POST /complete-onboarding` success + error paths (mocked) | No coupling to business-profile save before complete |
| API e2e | `auth.api.spec.ts` F-AUTH-05 | Register → me → profile → complete with **valid** data | Soft-accepts **404** on business-profile (`expect([200,201,204,404])`) — can green while profile endpoint missing |
| AuthContext unit | `AuthContext.test.tsx` | `completeOnboarding()` flips flag (mocked API) | Never renders `onboarding.tsx` |
| Maestro | `.maestro/05-auth-onboarding.yaml` | Written for happy path | **Copy drift** vs real UI (`Set up your business` / `Trade Type` vs actual “Let's get your account set up” / “What's your trade?”); **not run** on iOS 26.5 (driver dead); inputText on pre-filled email can **append** → invalid email |
| App Review ensure | `ensure-app-review-user.py` | Login (or register) succeeds | **Does not** call complete-onboarding / seed profile / assert `onboardingCompleted` |

### 3. Runtime product path (why Apple saw setup)

1. Mobile `_layout.tsx` redirects any authenticated user with `!onboardingCompleted` → `/(auth)/onboarding`.
2. Vision shot during session (9:20): Step 1 of that wizard (“Welcome, Apple App Review… What's your trade?”).
3. Ensure script only required **login** → report `ok: true` while user could still be mid-setup.

### 4. Error UX (generic)

`onboarding.tsx` catch block shows only:

> Setup Error — There was an issue saving your details…

Real `ApiError.message` (e.g. `Invalid email format`) is **not** shown — only `console.error`. So recordings look “broken” without a precise message for agents/logs.

Zod on API: `companyEmail: z.string().email().optional()` — optional means missing key is OK; **`""` is not** (verified with local Zod probe).

## Root cause of “tests should have caught this”

Not a single missing assert — **structural holes stacked**:

1. **Mobile wizard untested** (matrix: Mobile none).
2. **Device E2E for onboarding not executable** (Maestro broken) and flow YAML outdated.
3. **App Review readiness defined as login-only** — never asserted “lands on Home, not setup”.
4. **API e2e soft-pass on profile 404** reduces signal.
5. **Happy-path bias** — invalid company email unit test exists API-side, but **no mobile test** that invalid profile save → Setup Error, and **no ensure** that demo user is already onboarded.

## Fixes shipped with this note

1. API unit: empty / whitespace `companyEmail` rejection (or preprocess if product chooses to coerce).
2. Mobile unit: onboarding final submit failure surfaces Setup Error; Skip path calls completeOnboarding.
3. `ensure-app-review-user.py`: after login, complete onboarding + seed business profile; report `onboardingCompleted`.
4. Maestro `05-auth-onboarding.yaml`: align copy to real strings; clear email field before type.
5. API e2e: require 2xx for business-profile in F-AUTH-05 (no silent 404).

## Follow-ups (not blocking this note)

- Surface `ApiError.message` in the Setup Error alert (product UX).
- API coerce empty strings to `undefined` in Zod preprocess for all optional emails.
- When Maestro recovers: gate CI mobile onboarding flow; fail if still on setup after ensure.
- Presubmit gate: phone evidence vision assert “not onboarding” before App Review recording.
