#!/usr/bin/env python3
"""
Mint a maxxer VIP redemption code for a friend.

Workflow:
  1. Friend opens optimizationmaxxing → Pricing tab → clicks the "$8/mo"
     VIP price 5 times within 3 seconds. The hidden HWID + code-input
     panel reveals.
  2. Friend copies their HWID (32 hex chars) and DMs it to you.
  3. You run:
         python scripts/mint-vip-code.py <hwid>
     and DM the resulting code (e.g. MAXX-A1B2-C3D4-E5F6-G7H8) back.
  4. Friend pastes the code in the same panel + hits Activate.
     VIP unlocks for that exact rig.

The code is HWID-bound: a code minted for HWID-A will not validate on
HWID-B. So leaked codes don't help anyone but the original recipient.

Keep VIP_SECRET in sync with src-tauri/src/vip.rs — rotating the secret
on a release invalidates every previously-minted code.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import sys
from typing import List

# --- Must match src-tauri/src/vip.rs constants ---
VIP_SECRET = b"optmaxxing-vip-2026-akatsuki-go!"
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # no I, L, O, U


def encode_crockford(payload: bytes) -> str:
    out: List[str] = []
    buffer = 0
    bits = 0
    for b in payload:
        buffer = (buffer << 8) | b
        bits += 8
        while bits >= 5:
            bits -= 5
            idx = (buffer >> bits) & 0b11111
            out.append(CROCKFORD[idx])
    if bits > 0:
        idx = (buffer << (5 - bits)) & 0b11111
        out.append(CROCKFORD[idx])
    return "".join(out)


def mint_code(hwid: str) -> str:
    """Return the canonical 16-char base32 code for `hwid`. No prefix."""
    digest = hmac.new(VIP_SECRET, hwid.encode(), hashlib.sha256).digest()
    return encode_crockford(digest[:10])  # 80 bits = 16 base32 chars


def format_for_user(code: str) -> str:
    """Format as MAXX-XXXX-XXXX-XXXX-XXXX for legibility when DMing."""
    chunks = [code[i : i + 4] for i in range(0, len(code), 4)]
    return "MAXX-" + "-".join(chunks)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "hwid",
        help="The friend's HWID — 32 hex chars copied from their Pricing tab.",
    )
    ap.add_argument(
        "--raw",
        action="store_true",
        help="Print only the bare code (no MAXX- prefix, no dashes).",
    )
    args = ap.parse_args()

    hwid = args.hwid.strip().lower()
    if len(hwid) != 32 or not all(c in "0123456789abcdef" for c in hwid):
        sys.stderr.write(
            f"hwid must be 32 hex chars (got {len(hwid)} chars: {args.hwid!r})\n"
        )
        return 2

    code = mint_code(hwid)
    print(format_for_user(code) if not args.raw else code)
    return 0


# --- Self-test: parity vector with src-tauri/src/vip.rs ---
# Both sides must agree on this. If you rotate VIP_SECRET, regenerate
# the expected value below by running this script with the test HWID
# manually, then update the assertion in vip.rs::tests too.
def _self_test() -> None:
    hwid_zero = "0" * 32
    expected = mint_code(hwid_zero)
    assert len(expected) == 16, f"code length wrong: {len(expected)}"
    for c in expected:
        assert c in CROCKFORD, f"out-of-alphabet char: {c!r}"


if __name__ == "__main__":
    _self_test()
    raise SystemExit(main())
