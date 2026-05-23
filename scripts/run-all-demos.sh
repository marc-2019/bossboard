#!/usr/bin/env bash
# scripts/run-all-demos.sh
#
# One-command demo runner for the BossBoard v0.5.0 e2e demo + spec coverage
# suite. Executes (in order):
#   1. Phase 0 preflight env check (best-effort; skipped gracefully if absent)
#   2. Web demos (Playwright, headed, serial — watchable)
#   3. API demos (Playwright API tests)
#   4. Mobile demos (Maestro flows — requires a simulator/emulator running)
#
# See docs/testing/DEMO_RUNBOOK.md for prerequisites + troubleshooting.
# See docs/testing/DEMO_HIGHLIGHTS.md for the stakeholder-facing index of
# recorded artifacts (videos + screenshots).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Phase 0: preflight (env check)"
# docs/testing/env-required.md is Phase 0's deliverable. A preflight.sh
# companion script may also exist. Both are optional from this runner's
# perspective — we skip gracefully if neither is present so a fresh clone
# can still attempt demos.
if [ -f docs/testing/preflight.sh ]; then
  bash docs/testing/preflight.sh
elif [ -f docs/testing/env-required.md ]; then
  echo "  (no preflight.sh found; see docs/testing/env-required.md for required env vars)"
else
  echo "  (no Phase 0 artifacts found; proceeding — env may be partially configured)"
fi

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
# Maestro returns non-zero if no devices are connected; we want the runner
# to continue (so web + API results are still recorded) rather than abort.
maestro test .maestro/ || echo "WARN: Maestro failed - check that a simulator/emulator is running (see DEMO_RUNBOOK.md)"
cd "$REPO_ROOT"

echo ""
echo "All demos complete."
echo "  Web videos:        apps/web/test-results/<test-name>/video.webm"
echo "  Mobile screenshots: apps/mobile/.maestro/screenshots/"
echo "  Stakeholder index: docs/testing/DEMO_HIGHLIGHTS.md"
