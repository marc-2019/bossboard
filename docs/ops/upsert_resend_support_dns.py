#!/usr/bin/env python3
"""Upsert Resend bounce/SPF records on support.instilligent.com.

Additive only. Does not touch apex MX/SPF/A. Token: CLOUDFLARE_API_TOKEN
(Zone:DNS:Edit on instilligent.com). Never prints the token.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ZONE_NAME = "instilligent.com"
CF_API = "https://api.cloudflare.com/client/v4"
RECORDS = [
    {
        "type": "MX",
        "name": "support",
        "content": "feedback-smtp.ap-northeast-1.amazonses.com",
        "priority": 10,
        "proxied": False,
        "ttl": 1,
    },
    {
        "type": "TXT",
        "name": "support",
        "content": "v=spf1 include:amazonses.com ~all",
        "proxied": False,
        "ttl": 1,
    },
]


def die(msg: str, code: int = 2) -> None:
    print(f"REFUSE: {msg}", file=sys.stderr)
    raise SystemExit(code)


def cf(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        CF_API + path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        die(f"cloudflare HTTP {e.code}: {detail}")
    if not payload.get("success"):
        die(f"cloudflare error: {payload.get('errors')}")
    return payload


def main() -> None:
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or ""
    if not token:
        die(
            "CLOUDFLARE_API_TOKEN unset — set a zone-scoped DNS Edit token for instilligent.com",
            3,
        )

    zones = cf("GET", f"/zones?name={urllib.parse.quote(ZONE_NAME)}", token)
    result = zones.get("result") or []
    if len(result) != 1:
        die(f"expected 1 zone for {ZONE_NAME}, got {len(result)}")
    zone_id = result[0]["id"]

    done = []
    for rec in RECORDS:
        fqdn = f"{rec['name']}.{ZONE_NAME}"
        existing = cf(
            "GET",
            f"/zones/{zone_id}/dns_records?type={rec['type']}&name={urllib.parse.quote(fqdn)}",
            token,
        )
        hits = existing.get("result") or []
        body = {
            "type": rec["type"],
            "name": fqdn,
            "content": rec["content"],
            "proxied": False,
            "ttl": rec["ttl"],
        }
        if rec["type"] == "MX":
            body["priority"] = rec["priority"]
        if len(hits) > 1:
            die(f"refusing to choose among {len(hits)} {rec['type']} records for {fqdn}")
        if hits:
            current = hits[0]
            same = (
                current.get("content") == rec["content"]
                and (rec["type"] != "MX" or current.get("priority") == rec["priority"])
            )
            if same:
                done.append(f"unchanged {rec['type']} {fqdn}")
                continue
            cf("PUT", f"/zones/{zone_id}/dns_records/{current['id']}", token, body)
            done.append(f"updated {rec['type']} {fqdn}")
        else:
            cf("POST", f"/zones/{zone_id}/dns_records", token, body)
            done.append(f"created {rec['type']} {fqdn}")

    print(json.dumps({"ok": True, "applied": done}))


if __name__ == "__main__":
    main()
