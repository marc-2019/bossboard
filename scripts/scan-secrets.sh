#!/usr/bin/env bash
# Guardrail: secrets-credentials-hygiene
# Local, re-runnable secrets scan. Mirrors what CI runs (.github/workflows/secrets-scan.yml).
#
# Usage:
#   ./scripts/scan-secrets.sh           # scan committed git history (default — the guardrail check)
#   ./scripts/scan-secrets.sh --no-git  # also scan the working tree (incl. local/uncommitted files)
#
# Requires either a local `gitleaks` binary or Docker (image pulled automatically).
# Exit code is non-zero if any non-allowlisted secret is found.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

EXTRA_ARGS=()
if [[ "${1:-}" == "--no-git" ]]; then
  EXTRA_ARGS+=(--no-git)
  echo ">> Scanning working tree (--no-git: includes uncommitted/local files)"
else
  echo ">> Scanning committed git history"
fi

GITLEAKS_IMAGE="${GITLEAKS_IMAGE:-zricethezav/gitleaks:latest}"

run_native() {
  gitleaks detect \
    --source="$REPO_ROOT" \
    --config="$REPO_ROOT/.gitleaks.toml" \
    --redact -v "${EXTRA_ARGS[@]}"
}

run_docker() {
  docker run --rm -v "$REPO_ROOT:/repo" "$GITLEAKS_IMAGE" detect \
    --source=/repo \
    --config=/repo/.gitleaks.toml \
    --redact -v "${EXTRA_ARGS[@]}"
}

if command -v gitleaks >/dev/null 2>&1; then
  run_native
elif command -v docker >/dev/null 2>&1; then
  echo ">> gitleaks binary not found; running via Docker ($GITLEAKS_IMAGE)"
  run_docker
else
  echo "ERROR: neither 'gitleaks' nor 'docker' is available." >&2
  echo "Install gitleaks (https://github.com/gitleaks/gitleaks) or Docker, then re-run." >&2
  exit 127
fi

echo ">> No secrets found. Tree is clean."
