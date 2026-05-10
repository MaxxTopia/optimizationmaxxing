#!/usr/bin/env python3
"""
Mint the 33 Founder codes for Discordmaxxer (and any future cross-product
founder pool). Each code is shaped MAXX-FNDR-XXXX-XXXX-XXXX:

  - "FNDR" prefix (4 chars) — flags the code as Founder. The worker
    detects this prefix and assigns a sequential founder number 1-33
    on first claim from KV `founder-counter`.
  - 12 random Crockford-base32 chars after the prefix — ~60 bits of
    unguessable entropy. Worker rejects malformed codes (40 chars
    Crockford-base32 + the prefix = 16 char code body, hands them to
    /claim's normal idempotency path).

Usage:
    python scripts/mint-founder-codes.py             # mints all 33
    python scripts/mint-founder-codes.py 5           # mints just 5
    python scripts/mint-founder-codes.py --raw       # bare codes, no MAXX-

Output:
    Default: writes to scripts/.founder-codes.local.txt (gitignored)
    --stdout: prints to stdout instead

Drop the codes in DMs whenever you want to give someone a Founder slot;
the worker assigns the # in the order they redeem.
"""
from __future__ import annotations

import argparse
import os
import secrets

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
PREFIX = "FNDR"            # 4 chars
BODY_BIT_LEN = 60          # 12 chars * 5 bits = 60 bits
BODY_CHAR_LEN = BODY_BIT_LEN // 5  # 12

DEFAULT_COUNT = 33
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, ".founder-codes.local.txt")


def mint_one() -> str:
    """Mint one Founder code body (12 chars after the FNDR prefix)."""
    bits = secrets.randbits(BODY_BIT_LEN)
    out = []
    for i in range(BODY_CHAR_LEN - 1, -1, -1):
        idx = (bits >> (i * 5)) & 0b11111
        out.append(CROCKFORD[idx])
    return PREFIX + "".join(out)


def format_for_user(code: str) -> str:
    """Format the bare 16-char code as MAXX-XXXX-XXXX-XXXX-XXXX."""
    chunks = [code[i:i + 4] for i in range(0, len(code), 4)]
    return "MAXX-" + "-".join(chunks)


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "count",
        type=int,
        nargs="?",
        default=DEFAULT_COUNT,
        help=f"how many codes to mint (default {DEFAULT_COUNT})",
    )
    ap.add_argument("--raw", action="store_true", help="print bare codes (no MAXX- prefix)")
    ap.add_argument("--stdout", action="store_true", help="print to stdout instead of writing the file")
    args = ap.parse_args()

    if args.count < 1 or args.count > DEFAULT_COUNT:
        ap.error(f"count must be 1..{DEFAULT_COUNT}")

    codes = [mint_one() for _ in range(args.count)]
    formatted = [c if args.raw else format_for_user(c) for c in codes]

    if args.stdout:
        for line in formatted:
            print(line)
    else:
        with open(DEFAULT_OUT, "w", encoding="utf-8") as f:
            f.write("# Discordmaxxer Founder codes — keep private. Each one binds to ONE\n")
            f.write("# Discord rig on first claim; the worker assigns the founder #.\n")
            f.write("# Cap = 33; slot 34+ rejected with HTTP 410.\n")
            f.write(f"# Minted: {args.count} codes\n\n")
            for line in formatted:
                f.write(line + "\n")
        print(f"-> wrote {args.count} codes to {DEFAULT_OUT}")
        print(f"-> file is gitignored via *.local.txt; share via DM, Telegram, anywhere private.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
