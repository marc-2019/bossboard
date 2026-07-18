# SWMS detail back-nav trap (2026-07-18)

## Report
Marc: App Review walk — once in SWMS details, cannot go back. Reported before.

## PROVEN
1. **Recording not on Mac** — only Desk View file in `app_review_recording/`; no new Screen Recording AirDropped. Cannot vision-confirm from video.
2. **Store/HEAD code** shows native stack header only for `swms/[id]` (`headerShown: true`, no custom `headerLeft`). When `canGoBack()` is false, iOS omits the back chevron → **dead end**.
3. **Generate success used `router.replace` to detail** — wipes history so `canGoBack()` is false after generate → view.
4. Prior fix commit `6445488` (always show BackButton) was **not merged into HEAD** that shipped; partial work was staged on `work/merge-feedback` only.

## Fix (this session)
- `BackButton` + `safeGoBack` + `withBackHeader` on SWMS layout/root
- In-content **Back** on SWMS detail (works even if header missing)
- `router.back` → `safeGoBack(..., '/(tabs)')` on load error + delete
- Generate: `push` instead of `replace` + Done → tabs
- Unit tests for `safeGoBack`

## Ship
Requires **new iOS build** (EAS) before phone App Review recording can use the fix. Current App Store binary still traps.

## App Review workaround on current binary
Skip opening SWMS **detail** document; show SWMS **list** / generate form only, then Invoices + Subscription. Or force-quit app to leave the dead-end (bad for review video).
