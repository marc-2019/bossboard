#!/usr/bin/env python3
"""
CI secret-scan GATE for bossboard (prevention control).

A PR/push that adds a NEW real secret FAILS this gate; reviewed/benign findings
that are recorded in ``.secrets-baseline.json`` do not. This complements (does
not replace) the gitleaks workflow — it reuses the *exact* calibrated detection
already built and tuned in CortexForge, so the two repos cannot drift.

PROVENANCE (copied verbatim — the product repo cannot import the CF repo):
  - ``SECRET_PATTERNS`` / ``_PATTERN_SPECS``  ← CortexForge
    ``mcp/compound/secret_scrubber.py``
  - ``_is_benign_match`` / ``_jwt_is_expired`` / ``_PLACEHOLDER_VALUE_RE`` /
    ``_LOCAL_DB_HOST_RE`` / ``_AWS_EXAMPLE_KEYS`` and the ``_scan_file_content``
    approach + ``_SKIP_DIR_NAMES`` / binary / ``_MAX_FILE_BYTES`` guards
    ← CortexForge ``mcp/compound/cf_secrets_hygiene_verifier.py``

SECURITY CONTRACT (do NOT relax — preserved verbatim from the CF verifier):
  A match is filtered as "benign" ONLY when it is *proven* not to be a live
  secret (env-ref/placeholder in the matched VALUE, local/dev pg_dsn host,
  provably-expired JWT, AWS documented public example key). When uncertain we
  KEEP the finding — a false positive is tolerable; a hidden real secret is a
  security failure.

SECRET-SAFE: this script NEVER prints or logs a raw secret value. Findings
record WHICH pattern matched and WHERE (file:line) plus a short, non-reversible
sha256 fingerprint (first 12 hex). Nothing else.

USAGE
    python3 tools/secret-scan-gate.py
        Scan git-tracked files, drop benign matches, subtract baselined
        fingerprints. Any remaining finding -> print it (NO value) + exit 1.
        Clean -> exit 0.

    python3 tools/secret-scan-gate.py --update-baseline
        Write ALL current post-benign findings to .secrets-baseline.json so the
        existing reviewed findings are accepted. Only NEW findings fail later.

stdlib-only (python3). No third-party imports, no network.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from typing import Dict, List, Optional


# ===========================================================================
# Detection patterns — copied VERBATIM from CortexForge
# mcp/compound/secret_scrubber.py (_PATTERN_SPECS -> SECRET_PATTERNS).
# Pattern dict insertion order matters (more-specific prefix wins); do not
# alphabetise.
# ===========================================================================
_PATTERN_SPECS = [
    (
        "anthropic_api_key",
        r"sk-ant-[A-Za-z0-9_\-]{40,}",
        "Anthropic Claude API key (sk-ant- prefix).",
    ),
    (
        "github_pat_fine_grained",
        r"github_pat_[A-Za-z0-9_]{82}",
        "GitHub fine-grained personal access token.",
    ),
    (
        "github_pat_classic",
        r"ghp_[A-Za-z0-9]{36}",
        "GitHub classic personal access token.",
    ),
    (
        "openai_api_key",
        r"sk-(?:proj-)?[A-Za-z0-9]{20,}",
        "OpenAI API key (sk- or sk-proj- prefix).",
    ),
    (
        "aws_access_key",
        r"AKIA[0-9A-Z]{16}",
        "AWS access key ID.",
    ),
    (
        "slack_token",
        r"xox[bposa]-[A-Za-z0-9\-]{10,}",
        "Slack token (bot, user, or app).",
    ),
    (
        "stripe_secret",
        r"sk_(?:test|live)_[A-Za-z0-9]{24,}",
        "Stripe secret API key.",
    ),
    (
        "jwt",
        r"eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}",
        "JSON Web Token (three base64url segments).",
    ),
    (
        "pg_dsn",
        r"postgres(?:ql)?://[^\s:@/]+:[^\s@/]+@[^\s/]+/[^\s]+",
        "Postgres connection string with embedded credentials.",
    ),
    (
        "cf_ctx_key",
        r"cf_ctx_[A-Za-z0-9]{32,}",
        "CortexForge internal context-store API key.",
    ),
    (
        "ssh_private_key",
        r"-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----"
        r"[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----",
        "PEM-armored private key block (RSA/OpenSSH/EC/DSA/PGP).",
    ),
    (
        "gcp_service_account",
        r"\"type\"\s*:\s*\"service_account\"[\s\S]{0,800}?"
        r"\"private_key\"\s*:\s*\"-----BEGIN[\s\S]*?-----END[^\"]*\"",
        "GCP service-account JSON (type + private_key co-occurrence).",
    ),
]

SECRET_PATTERNS: Dict[str, re.Pattern] = {
    name: re.compile(pat) for name, pat, _desc in _PATTERN_SPECS
}

# Patterns whose regex spans multiple physical lines (BEGIN...END / JSON blocks
# via [\s\S]*?). A per-line scan can never match these, so they get a separate
# full-text pass. The CF verifier scans per-line and so misses these too — this
# gate deliberately closes that gap to keep private-key / GCP-creds detection
# live, while keeping accurate line numbers for all single-line patterns.
_MULTILINE_PATTERN_NAMES = frozenset({"ssh_private_key", "gcp_service_account"})


# ===========================================================================
# Scan guards — copied VERBATIM from CortexForge cf_secrets_hygiene_verifier.py
# ===========================================================================
_MAX_FILE_BYTES = 256 * 1024
_SKIP_DIR_NAMES = frozenset(
    {".git", "node_modules", "__pycache__", ".next", "dist", "build", ".venv", "venv"}
)


# ===========================================================================
# Calibration — copied VERBATIM from CortexForge cf_secrets_hygiene_verifier.py.
# Filters ONLY provably-benign matches; never hides a real secret.
# ===========================================================================
_AWS_EXAMPLE_KEYS = frozenset({"AKIAIOSFODNN7EXAMPLE", "AKIAIOSFODNN7EXAMPLF"})

_PLACEHOLDER_VALUE_RE = re.compile(
    r"(\$\{|\$\(|%\([A-Za-z_]+\)s|<[^>]{1,40}>|your[_-]|changeme|placeholder|"
    r"redacted|rotate-and-replace|process\.env|os\.environ|getenv)",
    re.I,
)

_LOCAL_DB_HOST_RE = re.compile(
    r"@(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|db|database|postgres|postgresql|"
    r"pg|host\.docker\.internal)(:\d+)?(/|$|\?|\"|')",
    re.I,
)


def _jwt_is_expired(token: str) -> Optional[bool]:
    """True if the JWT is provably expired, False if provably live, None if
    undecidable. Reads only the (unsigned) payload; the signature is never used.
    Returns None on any error so we FAIL SAFE (keep the finding)."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload)).get("exp")
        if not isinstance(exp, (int, float)):
            return None
        return exp < time.time()
    except Exception:
        return None


def _is_benign_match(pattern_name: str, line: str, value: str) -> bool:
    """Return True ONLY when a secret-pattern match is PROVABLY not a live secret.
    See the SECURITY CONTRACT above. Keeps cloud creds, live tokens, and real keys."""
    # Placeholder / env-var reference in the matched value itself.
    if _PLACEHOLDER_VALUE_RE.search(value):
        return True
    # pg_dsn on a local/dev host (cloud-host DSNs are KEPT).
    if pattern_name == "pg_dsn" and _LOCAL_DB_HOST_RE.search(value):
        return True
    # Expired JWT (provably useless).
    if pattern_name == "jwt" and _jwt_is_expired(value) is True:
        return True
    # AWS documented public example key.
    if pattern_name == "aws_access_key":
        m = re.search(r"AKIA[0-9A-Z]{16}", value)
        if m and m.group(0) in _AWS_EXAMPLE_KEYS:
            return True
    return False


def _fingerprint(value: str) -> str:
    """Short, non-reversible fingerprint of a matched secret. We NEVER persist or
    log raw secret values. A truncated sha256 lets two scans be compared
    ("same key still committed?") without revealing the secret."""
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()[:12]


# ===========================================================================
# Git-tracked enumeration + per-file scan (approach copied from CF verifier).
# ===========================================================================
class GitEnumerationError(RuntimeError):
    """Raised when git cannot be queried for the tracked-file set.

    FAIL CLOSED: a gate that can't enumerate files must NOT report a clean tree
    (that would silently disable the control). Callers turn this into a fatal,
    non-zero exit — never an empty file list that looks like "no secrets".
    """


def _repo_root() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            timeout=60,
            check=True,
        )
        return out.stdout.decode("utf-8", errors="replace").strip()
    except (subprocess.SubprocessError, OSError) as exc:
        # Fail closed: if we can't even locate the repo root, we cannot reliably
        # scan it. Surface a fatal error rather than scanning os.getcwd() (which
        # might be the wrong/partial tree) and reporting a false PASS.
        raise GitEnumerationError(f"git rev-parse failed: {exc}") from exc


def _list_tracked_files(repo_path: str) -> List[str]:
    """Return repo-relative paths of all git-tracked files (NUL-separated).

    Raises GitEnumerationError on any git failure — see the class docstring.
    Returning [] here would FAIL OPEN (empty list == clean tree == exit 0).
    """
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=repo_path,
            capture_output=True,
            timeout=120,
            check=True,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        raise GitEnumerationError(
            f"git ls-files failed in {repo_path}: {exc}"
        ) from exc
    raw = out.stdout.decode("utf-8", errors="replace")
    files = [p for p in raw.split("\0") if p]
    keep: List[str] = []
    for rel in files:
        parts = rel.split("/")
        if any(part in _SKIP_DIR_NAMES for part in parts):
            continue
        keep.append(rel)
    return keep


def _scan_file_content(repo_path: str, rel_path: str) -> List[Dict]:
    """Scan one tracked file's content for secret-pattern matches.
    Returns finding dicts (never containing raw values)."""
    abs_path = os.path.join(repo_path, rel_path)
    findings: List[Dict] = []
    try:
        with open(abs_path, "rb") as fh:
            raw_bytes = fh.read(_MAX_FILE_BYTES)
    except (OSError, IOError):
        return findings

    # Binary files almost never carry plaintext secrets and produce regex noise.
    if b"\x00" in raw_bytes:
        return findings

    text = raw_bytes.decode("utf-8", errors="replace")

    # (a) Per-line pass for single-line patterns — gives accurate line numbers.
    lines = text.splitlines()
    for line_no, line in enumerate(lines, start=1):
        for pattern_name, pattern in SECRET_PATTERNS.items():
            if pattern_name in _MULTILINE_PATTERN_NAMES:
                continue
            match = pattern.search(line)
            if match:
                value = match.group(0)
                # Calibration: drop PROVABLY-benign matches. Conservative —
                # keeps any real secret.
                if _is_benign_match(pattern_name, line, value):
                    continue
                findings.append(
                    {
                        "type": "hardcoded_secret",
                        "pattern": pattern_name,
                        "file": rel_path,
                        "line": line_no,
                        "fingerprint": _fingerprint(value),
                    }
                )

    # (b) Full-text pass for multi-line patterns (PEM private keys, GCP SA JSON)
    # whose regexes span newlines. Report the line where the block starts.
    for pattern_name in _MULTILINE_PATTERN_NAMES:
        pattern = SECRET_PATTERNS[pattern_name]
        for match in pattern.finditer(text):
            value = match.group(0)
            if _is_benign_match(pattern_name, value, value):
                continue
            start_line = text.count("\n", 0, match.start()) + 1
            findings.append(
                {
                    "type": "hardcoded_secret",
                    "pattern": pattern_name,
                    "file": rel_path,
                    "line": start_line,
                    "fingerprint": _fingerprint(value),
                }
            )
    return findings


def scan_repo(repo_path: str) -> List[Dict]:
    """Scan all git-tracked files; return post-benign findings (no values)."""
    findings: List[Dict] = []
    for rel in _list_tracked_files(repo_path):
        findings.extend(_scan_file_content(repo_path, rel))
    return findings


# ===========================================================================
# Baseline I/O. Map: fingerprint -> {file, pattern, reason}.
# ===========================================================================
BASELINE_FILENAME = ".secrets-baseline.json"


def _baseline_path(repo_path: str) -> str:
    return os.path.join(repo_path, BASELINE_FILENAME)


def load_baseline(repo_path: str) -> Dict[str, Dict]:
    path = _baseline_path(repo_path)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError) as exc:
        print(f"ERROR: could not read {BASELINE_FILENAME}: {exc}", file=sys.stderr)
        # Fail safe: an unreadable baseline means we accept nothing (every
        # finding remains), so a corrupt baseline cannot silently let secrets
        # through.
        return {}
    if not isinstance(data, dict):
        print(
            f"ERROR: {BASELINE_FILENAME} must be a JSON object "
            "(fingerprint -> metadata); ignoring it.",
            file=sys.stderr,
        )
        return {}
    return data


def write_baseline(repo_path: str, findings: List[Dict]) -> Dict[str, Dict]:
    """Write all current post-benign findings to the baseline (no values)."""
    baseline: Dict[str, Dict] = {}
    for f in findings:
        baseline[f["fingerprint"]] = {
            "file": f["file"],
            "pattern": f["pattern"],
            "reason": "accepted via --update-baseline (reviewed existing finding)",
        }
    path = _baseline_path(repo_path)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(baseline, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return baseline


# ===========================================================================
# Main
# ===========================================================================
def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="CI secret-scan gate (reuses CortexForge calibrated detection)."
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Write all current post-benign findings to "
        f"{BASELINE_FILENAME} and exit 0.",
    )
    args = parser.parse_args(argv)

    try:
        repo_path = _repo_root()
        findings = scan_repo(repo_path)
    except GitEnumerationError as exc:
        # FAIL CLOSED: we could not enumerate the tracked-file set, so we cannot
        # assert the tree is clean. Exit 2 (fatal/config) — distinct from exit 1
        # (real findings remain) and never 0.
        print(f"FATAL: secret-scan gate could not run: {exc}", file=sys.stderr)
        return 2

    if args.update_baseline:
        baseline = write_baseline(repo_path, findings)
        print(
            f"Wrote {BASELINE_FILENAME} with {len(baseline)} accepted "
            f"fingerprint(s) from {len(findings)} current finding(s)."
        )
        for f in findings:
            print(
                f"  baselined: {f['file']}:{f['line']}:{f['pattern']}:"
                f"{f['fingerprint']}"
            )
        return 0

    baseline = load_baseline(repo_path)
    remaining = [f for f in findings if f["fingerprint"] not in baseline]

    accepted = len(findings) - len(remaining)
    if not remaining:
        print(
            f"Secret-scan gate: PASS — {len(findings)} finding(s), "
            f"{accepted} accepted via baseline, 0 new."
        )
        return 0

    print(
        f"Secret-scan gate: FAIL — {len(remaining)} NEW finding(s) not in "
        f"{BASELINE_FILENAME} ({accepted} accepted, {len(findings)} total)."
    )
    print("Each line is file:line:pattern:fingerprint — secret VALUES are never shown.")
    for f in sorted(remaining, key=lambda x: (x["file"], x["line"], x["pattern"])):
        print(f"  {f['file']}:{f['line']}:{f['pattern']}:{f['fingerprint']}")
    print(
        "\nIf a finding is a reviewed false positive or an intentionally-public "
        "value, record it by running:\n"
        "  python3 tools/secret-scan-gate.py --update-baseline\n"
        "and committing the updated " + BASELINE_FILENAME + ". Otherwise REMOVE "
        "the secret and rotate it."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
