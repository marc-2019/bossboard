# BossBoard testing docs

## Portfolio rule (read first)

**Line coverage is not journey completeness.**  
Instilligent standard: `~/projects/shared/journey-contracts/`

Ship / App Review claims need:

1. `npm run test:critical-journeys` (from `apps/mobile`) green  
2. `ensure_app_review_user.py --app bossboard` → ready past onboarding  
3. Static detail-escape guard green  

## Commands

```bash
cd apps/mobile
npm run test:critical-journeys          # preferred name (portfolio)
npm run test:app-review-regressions     # alias, same suite
```

## This folder

| Doc | Purpose |
|-----|---------|
| [CRITICAL_JOURNEYS.md](./CRITICAL_JOURNEYS.md) | Journey matrix status |
| [SETUP_AND_BACKNAV_FIXES_2026-07-18.md](./SETUP_AND_BACKNAV_FIXES_2026-07-18.md) | Setup Error + SWMS back fixes |
| [ONBOARDING_TEST_GAP_2026-07-18.md](./ONBOARDING_TEST_GAP_2026-07-18.md) | Why coverage missed wizard UX |
| [SWMS_BACKNAV_2026-07-18.md](./SWMS_BACKNAV_2026-07-18.md) | No-back ground truth |
| [SPEC_AND_DEMOS_MATRIX.md](./SPEC_AND_DEMOS_MATRIX.md) | Spec ↔ demo mapping |

## Agent brief

See also: `~/projects/shared/journey-contracts/AGENTS.md`
