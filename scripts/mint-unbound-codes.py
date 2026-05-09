#!/usr/bin/env python3
"""
Mint N unbound VIP codes you can drop in DMs / Discord without knowing
the friend's HWID in advance. Each code is a random 80-bit Crockford-
base32 string formatted as `MAXX-XXXX-XXXX-XXXX-XXXX`.

When a friend pastes the code in their app, the optimizationmaxxing
client POSTs `{code, hwid}` to the Cloudflare Worker (vip-worker/). The
worker's KV ledger gives the code to the FIRST hwid that claims it.
Subsequent attempts on different rigs return 409 "already claimed by
another rig" — so leaked screenshots don't stack VIP grants.

For the older HWID-bound flow (you mint a code already locked to a
specific friend's HWID), see scripts/mint-vip-code.py — that path
doesn't need the worker.

Usage:
    python scripts/mint-unbound-codes.py            # 1 code
    python scripts/mint-unbound-codes.py 10         # 10 codes
    python scripts/mint-unbound-codes.py 5 --raw    # 5 codes, no MAXX- prefix
"""
from __future__ import annotations

import argparse
import secrets
from typing import List

# Crockford-style base32 alphabet (no I, L, O, U). Must match
# src-tauri/src/vip.rs::CROCKFORD and worker.js::ALLOWED_CODE_RE.
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

# 80 bits = 16 base32 chars — same shape as the HWID-bound codes so the
# worker's ALLOWED_CODE_RE catches them too.
CODE_BIT_LEN = 80
CODE_CHAR_LEN = CODE_BIT_LEN // 5  # 16


def mint_one() -> str:
    bits = secrets.randbits(CODE_BIT_LEN)
    out: List[str] = []
    # Walk MSB → LSB in 5-bit chunks.
    for i in range(CODE_CHAR_LEN - 1, -1, -1):
        idx = (bits >> (i * 5)) & 0b11111
        out.append(CROCKFORD[idx])
    return "".join(out)


def format_for_user(code: str) -> str:
    chunks = [code[i : i + 4] for i in range(0, len(code), 4)]
    return "MAXX-" + "-".join(chunks)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("count", type=int, nargs="?", default=1, help="how many codes to mint (default 1)")
    ap.add_argument("--raw", action="store_true", help="print bare codes (no MAXX- prefix, no dashes)")
    args = ap.parse_args()

    if args.count < 1 or args.count > 1000:
        ap.error("count must be 1..1000")

    for _ in range(args.count):
        code = mint_one()
        print(format_for_user(code) if not args.raw else code)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
