# Setup Error + SWMS back-nav fixes (2026-07-18)

Found pre-Apple via physical Screen Recordings + Marc driving the app.

## Setup recording (`ScreenRecording_…21-21-46`)

**Observed:** Onboarding Step 3 → Get Started → modal:

> Setup Error — There was an issue saving your details…

**Root cause (code):** Catch-all alert hid the real API failure (profile / auth/me / complete-onboarding). Fields on video (valid email, 15-digit bank) should pass schema; failure may be network/auth/server — we could not read server logs from the video alone.

**Fixes shipped in tree:**

| Change | Path |
|--------|------|
| Step-labelled API errors + Skip for Now always | `apps/mobile/app/(auth)/onboarding.tsx` |
| Field validation (email + NZ bank length) | `apps/mobile/src/utils/onboardingValidation.ts` |
| Empty/whitespace email coerced to omitted on API | `apps/api/src/routes/business-profile.ts` |
| Demo user auto-completes onboarding | `ensure-app-review-user` / multi-app ensure |
| Unit tests | `onboardingValidation.test.ts`, business-profile empty email |

## SWMS recording (`…21-39-33`)

**Observed:** SWMS Details header title only — **no back chevron**; user trapped. Also Tradie photo gate after camera permission.

**Fixes shipped in tree:**

| Change | Path |
|--------|------|
| Always-visible header Back + in-content Back | `swms/[id].tsx`, `BackButton`, `withBackHeader` |
| `safeGoBack` fallback to tabs | `navigation.ts` |
| Generate uses `push` not `replace` | `swms/generate.tsx` |

## Why “100% coverage” missed both bugs

| What we measured | What we needed |
|------------------|----------------|
| API line/branch % (~80% gate) | “Can the human leave SWMS Details?” |
| Mocked `completeOnboarding` unit | Real wizard Setup Error alert text + step label |
| Maestro YAML on disk | Maestro actually running on device (blocked) |
| Spec matrix Mobile: none | Journey tests as **required** |

**Lesson:** Coverage of executed lines ≠ journey contracts. See `docs/superpowers/specs/2026-07-18-journey-test-coverage-design.md`.

## Automated tests (no device recording required)

```bash
# Mobile UI + static guards + unit regressions (54 tests as of 2026-07-18)
cd apps/mobile && npm run test:app-review-regressions

# API business-profile (empty email coerce, invalid email)
cd apps/api && npm test -- --testPathPattern='routes/business-profile.test' --no-coverage

# Shared scoring helpers
cd projects/shared/app-review && python3 -m pytest tests/ -q
```

| UI (from recordings) | Automated coverage |
|----------------------|-------------------|
| Onboarding Step 1–3 labels | `onboarding-screen.test.tsx` |
| Invalid email field error | same |
| Invalid bank → Check your details | same |
| Setup Error + step label + Skip for Now | same |
| Skip setup without profile | same |
| Happy path Get Started | same |
| SWMS in-content Back + fallback tabs | `swms-detail-back.test.tsx`, `BackButton.test.tsx` |
| safeGoBack history / no history | `navigation.test.ts` |
| All `[id].tsx` have escape + no raw `router.back` | `detail-screen-escape.static.test.ts` |
| withBackHeader disables native-only back | `withBackHeader.test.tsx` |
| Invoice detail uses safeGoBack | `invoice-detail-escape.test.tsx` |
| Empty email API coerce | `business-profile.test.ts` |

## Ship

Requires **new iOS build** (and API deploy for empty-email coerce). Until then:

- Ensure demo user `onboardingCompleted=true` so Apple lands on Home.
- App Review walk: avoid SWMS **detail** open on store binary; skip Photos on free tier.

## Nemo Omni

Recording QA uses Nemo Omni primary (`shared/app-review/VISION_ROUTING.md`).
