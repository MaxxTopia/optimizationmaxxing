#!/usr/bin/env python3
"""
optmaxxing telemetry — read-side report.

Pulls aggregated stats from the worker's /summary endpoint and pretty-prints
to stdout. Operator-only — needs the OPTMAXXING_TELEMETRY_TOKEN env var (or
--token) matching the TELEMETRY_ADMIN_TOKEN secret set on the worker.

Usage:
    set OPTMAXXING_TELEMETRY_TOKEN=...     # PowerShell: $env:OPTMAXXING_TELEMETRY_TOKEN=...
    python scripts/telemetry-report.py
    python scripts/telemetry-report.py --days 30
    python scripts/telemetry-report.py --days 7 --json   # raw JSON dump

ASCII-only output (Windows cp1252 stdout safe).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_URL = "https://optmaxxing-telemetry.maxxtopia.workers.dev/summary"


def fetch_summary(url: str, token: str, days: int) -> dict:
    qs = f"?days={int(days)}"
    req = urllib.request.Request(
        url + qs,
        headers={"x-admin-token": token, "user-agent": "optmaxxing-telemetry-report/1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace") if e.fp else ""
        print(f"HTTP {e.code} from worker: {msg}", file=sys.stderr)
        sys.exit(2)
    except urllib.error.URLError as e:
        print(f"network error: {e.reason}", file=sys.stderr)
        sys.exit(3)


def bar(count: int, max_count: int, width: int = 30) -> str:
    if max_count <= 0:
        return ""
    n = max(1, round((count / max_count) * width)) if count > 0 else 0
    return "#" * n


def print_kv_table(title: str, items: list[tuple[str, int]], indent: int = 2) -> None:
    if not items:
        return
    max_count = max(c for _, c in items)
    label_width = max(len(k) for k, _ in items)
    print()
    print(title)
    print("-" * len(title))
    for k, c in items:
        spaces = " " * indent
        print(f"{spaces}{k.ljust(label_width)}  {str(c).rjust(5)}  {bar(c, max_count)}")


def render_report(s: dict) -> None:
    win_days = s.get("windowDays", "?")
    total = s.get("totalEvents", 0)
    unique = s.get("uniqueDevices", 0)
    pages = s.get("pagesRead", 0)
    parse_err = s.get("parseErrors", 0)

    print("=" * 64)
    print(f"optmaxxing telemetry report - last {win_days} day(s)")
    print(f"window start : {s.get('windowStart','?')}")
    print(f"now          : {s.get('now','?')}")
    print(f"total events : {total}")
    print(f"unique rigs  : {unique}")
    print(f"kv pages read: {pages}   parse errors: {parse_err}")
    print("=" * 64)

    if total == 0:
        print()
        print("(no events in window — opt-in toggle may be off everywhere,")
        print(" or you haven't shipped a build since enabling telemetry.)")
        return

    by_kind = sorted(s.get("byKind", {}).items(), key=lambda x: -x[1])
    print_kv_table("Events by kind", by_kind)

    by_ver = sorted(s.get("byVersion", {}).items(), key=lambda x: -x[1])
    print_kv_table("By version", by_ver)

    by_day = [(d["day"], d["count"]) for d in s.get("byDay", [])]
    print_kv_table("By day", by_day)

    by_region = sorted(s.get("byRegion", {}).items(), key=lambda x: -x[1])
    print_kv_table("By region (first 2 IP octets)", by_region[:15])

    top_t = [(t["id"], t["count"]) for t in s.get("topTweaks", [])]
    print_kv_table("Top tweaks applied", top_t)

    top_p = [(p["id"], p["count"]) for p in s.get("topPresets", [])]
    print_kv_table("Top presets applied", top_p)

    recent = s.get("recent", [])
    if recent:
        print()
        print("Recent events (newest first)")
        print("-" * 28)
        for r in recent[:25]:
            ts = r.get("ts", "")[:19].replace("T", " ")
            print(
                f"  {ts}  {r.get('kind','?').ljust(20)} "
                f"v{r.get('version','?').ljust(8)} {r.get('ip2','').ljust(8)}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Pull + print optmaxxing telemetry summary.")
    parser.add_argument("--url", default=os.environ.get("OPTMAXXING_TELEMETRY_URL", DEFAULT_URL),
                        help="worker /summary URL (default: prod)")
    parser.add_argument("--token", default=os.environ.get("OPTMAXXING_TELEMETRY_TOKEN", ""),
                        help="admin token (default: $OPTMAXXING_TELEMETRY_TOKEN)")
    parser.add_argument("--days", type=int, default=7, help="window in days (default: 7, max: 90)")
    parser.add_argument("--json", action="store_true", help="print raw JSON instead of human report")
    args = parser.parse_args()

    if not args.token:
        print(
            "missing admin token. Set OPTMAXXING_TELEMETRY_TOKEN or pass --token.\n"
            "Bootstrap once:\n"
            "  cd telemetry-worker\n"
            "  wrangler secret put TELEMETRY_ADMIN_TOKEN     # paste a strong random string\n"
            "Then set the same value in your local env to query.",
            file=sys.stderr,
        )
        sys.exit(1)

    s = fetch_summary(args.url, args.token, args.days)
    if args.json:
        print(json.dumps(s, indent=2))
        return
    render_report(s)


if __name__ == "__main__":
    main()
