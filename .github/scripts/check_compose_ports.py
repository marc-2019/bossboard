#!/usr/bin/env python3
"""Compose port-lockdown check (SPEC_db-port-lockdown-family).

Fails if any host port publish in a compose file is not bound to 127.0.0.1.

Usage:
  check_compose_ports.py --repo            scan every docker-compose*.y(a)ml / compose*.y(a)ml in the repo
  check_compose_ports.py FILE [FILE ...]   scan only the given files (exclusions not applied)

Exclusions are read from .github/port-lockdown-exclusions.yml and apply only in --repo mode.
"""
import fnmatch
import os
import sys

import yaml

PATTERNS = ("docker-compose*.yml", "docker-compose*.yaml", "compose*.yml", "compose*.yaml")
SKIP_DIRS = {".git", "node_modules", "port-lockdown-fixtures"}
EXCLUSIONS_FILE = ".github/port-lockdown-exclusions.yml"


def find_compose_files(root="."):
    found = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            if any(fnmatch.fnmatch(name, p) for p in PATTERNS):
                found.append(os.path.normpath(os.path.join(dirpath, name)))
    return found


def load_exclusions():
    if not os.path.exists(EXCLUSIONS_FILE):
        return []
    with open(EXCLUSIONS_FILE) as fh:
        doc = yaml.safe_load(fh) or {}
    return [
        (os.path.normpath(e["file"]), str(e["service"]), str(e["publish"]))
        for e in doc.get("exclusions") or []
    ]


def unbound_publishes(path):
    with open(path) as fh:
        doc = yaml.safe_load(fh) or {}
    bad = []
    services = doc.get("services") if isinstance(doc, dict) else None
    for name, svc in (services or {}).items():
        for p in (svc or {}).get("ports") or []:
            if isinstance(p, dict):
                if "published" in p and str(p.get("host_ip", "")) != "127.0.0.1":
                    bad.append((str(name), str(p.get("published"))))
            elif not str(p).startswith("127.0.0.1:"):
                bad.append((str(name), str(p)))
    return bad


def main(argv):
    repo_mode = argv[:1] == ["--repo"]
    files = find_compose_files() if repo_mode else argv
    if not files:
        print("FAIL no compose files found to check")
        return 1
    exclusions = load_exclusions() if repo_mode else []
    used = set()
    rc = 0
    for path in files:
        bad = []
        for svc, pub in unbound_publishes(path):
            key = (os.path.normpath(path), svc, pub)
            if key in exclusions:
                used.add(key)
                print(f"SKIP {path}: service '{svc}' publishes {pub!r} (listed in {EXCLUSIONS_FILE})")
            else:
                bad.append((svc, pub))
        for svc, pub in bad:
            print(f"FAIL {path}: service '{svc}' publishes {pub!r} without 127.0.0.1")
        if bad:
            rc = 1
        else:
            print(f"OK   {path}")
    for key in exclusions:
        if key not in used:
            print(f"WARN stale exclusion (no longer matches anything): {key}")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
