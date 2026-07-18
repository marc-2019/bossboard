# BossBoard — critical journeys status

| Item | Location |
|------|----------|
| Suite | `apps/mobile` → `npm run test:critical-journeys` |
| Alias | `npm run test:app-review-regressions` (same pattern) |
| Ensure | `shared/app-review/apps/bossboard.yaml` |
| Postmortem | `docs/superpowers/specs/2026-07-18-journey-test-coverage-design.md` |
| Fixes | `docs/testing/SETUP_AND_BACKNAV_FIXES_2026-07-18.md` |

## Matrix

| Journey | Automated |
|---------|-----------|
| Onboarding 3-step + Setup Error + Skip | ✅ onboarding-screen |
| Validation email/bank | ✅ onboardingValidation |
| SWMS detail back escape | ✅ swms-detail-back + BackButton |
| All [id] detail escape static | ✅ detail-screen-escape.static |
| Invoice safeGoBack | ✅ invoice-detail-escape |
| withBackHeader | ✅ withBackHeader |
| Demo ensure ready_flag | ✅ ensure multi-app |
| Nemo recording score | ✅ shared/app-review (ops) |
