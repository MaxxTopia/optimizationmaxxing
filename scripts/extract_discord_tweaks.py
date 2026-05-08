"""Phase 5a — Discord-tweaks corpus extractor.

Walks the 11 diggy-tweaks Discord exports under
`projects/discord-archive/exports/servers/ss04-personal/diggy-tweaks-_-*.json`
and produces a single corpus JSON with one entry per message. Light regex
enrichment surfaces likely registry paths, bcdedit commands, and reg-add
lines so the next pass (LLM extraction OR human review) can work from
structured material instead of raw chat logs.

Output: resources/catalog/draft/discord-corpus.json

Run:
    python scripts/extract_discord_tweaks.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

# Paths assume the script runs from the project root or anywhere — both are fine.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DISCORD_DIR = PROJECT_ROOT.parent / "discord-archive/exports/servers/ss04-personal"
OUT_PATH = PROJECT_ROOT / "resources/catalog/draft/discord-corpus.json"

CHANNEL_GLOB = "diggy-tweaks-_-*.json"

# Permissive regexes — the goal is recall, not precision. Human / LLM
# extraction will dedupe and reject noise downstream.
REG_PATH_RE = re.compile(
    r"\b(?:HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKEY_CLASSES_ROOT|HKEY_USERS|HKLM|HKCU|HKCR|HKU)"
    r"(?:\\\\|\\)[A-Za-z0-9_\-\s\\]+",
    re.IGNORECASE,
)
BCDEDIT_RE = re.compile(r"bcdedit\s+(?:/[a-z]+\s+)+\S[^\n]*", re.IGNORECASE)
REG_ADD_RE = re.compile(r"reg\s+add\s+[^\n]+", re.IGNORECASE)
POWERSHELL_HINT_RE = re.compile(
    r"(?:powercfg\s|Set-MpPreference|Disable-MMAgent|Stop-Service|Set-ItemProperty)[^\n]*",
    re.IGNORECASE,
)
NUMERIC_VALUE_RE = re.compile(
    r"(?:Set\s+(?:value|it)\s+to|=)\s*((?:0x)?[0-9a-fA-F]+|ffffffff)\b",
    re.IGNORECASE,
)
NAMED_VALUE_RE = re.compile(
    r"\b([A-Z][A-Za-z0-9]{2,})\s*(?:->|=)\s*(?:Set\s+(?:value|it)\s+to\s*)?([^\s,;\n]+)"
)


def channel_name_from_filename(filename: str) -> str:
    # "diggy-tweaks-_-reg-edits.json" → "reg-edits"
    stem = Path(filename).stem  # "diggy-tweaks-_-reg-edits"
    if "_-" in stem:
        return stem.split("_-", 1)[1]
    return stem


def extract_signals(content: str) -> dict[str, list[str]]:
    """Pull candidate tweak fragments from free text. Higher recall = noisier."""
    return {
        "registry_paths": list({m.group(0).strip() for m in REG_PATH_RE.finditer(content)}),
        "bcdedit_commands": list({m.group(0).strip() for m in BCDEDIT_RE.finditer(content)}),
        "reg_add_commands": list({m.group(0).strip() for m in REG_ADD_RE.finditer(content)}),
        "powershell_hints": list({m.group(0).strip() for m in POWERSHELL_HINT_RE.finditer(content)}),
        "named_values": [
            f"{m.group(1)} = {m.group(2)}" for m in NAMED_VALUE_RE.finditer(content)
        ],
    }


def has_signals(s: dict[str, list[str]]) -> bool:
    return any(v for v in s.values())


def process_file(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    channel = channel_name_from_filename(path.name)
    out: list[dict[str, Any]] = []
    for msg in data.get("messages", []):
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        signals = extract_signals(content)
        if not has_signals(signals) and len(content) < 60:
            # Probably a short reaction / image-only message — skip.
            continue
        out.append(
            {
                "id": f"discord.{channel}.{msg['id']}",
                "channel": channel,
                "message_id": msg["id"],
                "timestamp": msg.get("timestamp"),
                "author": (msg.get("author") or {}).get("name") or "?",
                "content": content,
                "signals": signals,
                "has_attachments": bool(msg.get("attachments")),
                "needs_review": True,
            }
        )
    return out


def main() -> int:
    if not DISCORD_DIR.is_dir():
        print(f"ERROR: discord exports not found at {DISCORD_DIR}", file=sys.stderr)
        return 2

    all_entries: list[dict[str, Any]] = []
    files = sorted(DISCORD_DIR.glob(CHANNEL_GLOB))
    for path in files:
        entries = process_file(path)
        print(f"  {path.name}: {len(entries)} entries")
        all_entries.extend(entries)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {
                "version": "v0",
                "source": str(DISCORD_DIR),
                "channel_count": len(files),
                "entry_count": len(all_entries),
                "entries": all_entries,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    # Histograms for a quick eyeball.
    by_channel: dict[str, int] = {}
    with_signals = 0
    for e in all_entries:
        by_channel[e["channel"]] = by_channel.get(e["channel"], 0) + 1
        if any(e["signals"].values()):
            with_signals += 1
    print()
    print(f"Wrote {len(all_entries)} entries -> {OUT_PATH}")
    print(f"Entries with regex-detected signals: {with_signals}")
    print("By channel:")
    for c, n in sorted(by_channel.items(), key=lambda kv: -kv[1]):
        print(f"  {c}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
