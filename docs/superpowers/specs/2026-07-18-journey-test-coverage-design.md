# Journey-level test coverage design (2026-07-18)

## Why “100% testing” still missed production bugs

**What “100%” actually meant**

| Claim | Reality |
|-------|---------|
| API ~80%+ branch coverage on services/routes | Line/branch coverage of **server** code |
| Unit tests for auth/completeOnboarding | Mocked services — never the **mobile wizard UI** |
| Maestro YAML for onboarding | **Never ran** on iOS 26.5 (driver broken) |
| Spec matrix F-AUTH-05 Mobile | Explicitly **“none”** until 2026-07-18 |
| Detail screens | Root `withBackHeader` assumed native back works; **SWMS had no in-content escape**; `router.back()` dead-ends |

**Category error:** Coverage % measures *how much code executed*, not *whether a human can leave a screen* or *whether a failure shows a useful message*.

**Missed bugs map to missing test *types*:**

| Bug | Coverage would say | Missing test type |
|-----|-------------------|-------------------|
| Setup Error generic | catch{} executed once → “covered” | Assert **alert text includes API step**; field validation before API |
| SWMS no back | header options object exists → “covered” | Assert **testID back control** + `canGoBack()===false` → replace |
| Maestro drift | YAML exists → “covered” | CI actually **running** device/sim flows |

## Goal

Automate **user-journey contracts** for App Review–critical paths without physical recordings:

1. Onboarding wizard (all 3 steps, happy + error + skip)
2. Navigation escape hatches on every detail surface used in review walks
3. Static guards so `router.back()` without `safeGoBack` cannot re-enter silently
4. CI script that runs this suite as `test:app-review-regressions`

## Non-goals

- Full Maestro on physical iOS 26 until driver works
- 100% line coverage of every mobile file
- Replacing Nemo/Grok visual scoring of real ASC videos

## Approaches

| Approach | Pros | Cons |
|----------|------|------|
| A. More API coverage only | Easy | **Repeats the failure** |
| B. Component tests per screen + static AST/grep gate | Fast, CI-stable, maps to real bugs | Not full device |
| C. Detox/Appium full device | Highest fidelity | Slow, flaky, blocked on driver |
| **B+C later (chosen)** | Ship B now; device when Maestro recovers | — |

## Design — test layers

```
L1 Unit: validation, safeGoBack, formatApiStepError
L2 Component: OnboardingScreen, BackButton, SWMS detail, Invoice detail (App Review walk)
L3 Static guard: every app/**/[id].tsx either uses safeGoBack/BackButton OR is allowlisted
L4 API: business-profile empty email, invalid email, complete-onboarding
L5 Optional: Maestro YAML kept as doc; not required for green CI
```

### L3 Static guard (critical)

Fail CI if a detail screen uses `router.back()` without importing `safeGoBack` or rendering `BackButton` / `testID` containing `back`.

Allowlist only screens that are pure redirects or deliberately modal-dismissed.

### App Review walk screens (must have escape tests)

Home (tabs) · SWMS generate · SWMS detail · Invoice detail · Settings/Subscription header

## Success criteria

- `npm run test:app-review-regressions` green without device/recording
- Static guard fails if SWMS-style trap is reintroduced
- Spec matrix documents Mobile journey tests as required, not “optional Maestro”

## Implementation

Implement L1–L4 immediately; document in SPEC matrix + SETUP_AND_BACKNAV doc.
