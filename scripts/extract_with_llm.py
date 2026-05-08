"""Phase 5b — LLM extraction pass over the Discord + YouTube corpora.

Reads any combination of corpus JSONs (e.g.,
`resources/catalog/draft/discord-corpus.json`,
`resources/catalog/draft/yt-corpus.json`), sends each entry's free-text
content to an LLM with a structured-output prompt, and emits draft
Tweak records to `resources/catalog/draft/llm-extracted.json`.

Hand-review pass turns these into catalog entries that go in v1.json.

USAGE (Gemini, default — free tier):
    set GEMINI_API_KEY=...
    pip install google-genai
    python scripts/extract_with_llm.py --limit 5     # pilot
    python scripts/extract_with_llm.py               # full corpus

USAGE (Anthropic):
    set ANTHROPIC_API_KEY=sk-ant-...
    pip install anthropic
    python scripts/extract_with_llm.py --provider anthropic

Default Gemini model: gemini-2.5-flash. Anthropic model: claude-haiku-4-5.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPORA = [
    PROJECT_ROOT / "resources/catalog/draft/discord-corpus.json",
    PROJECT_ROOT / "resources/catalog/draft/yt-corpus.json",
]
OUT = PROJECT_ROOT / "resources/catalog/draft/llm-extracted.json"

EXTRACTION_SYSTEM = """You are extracting Windows-tweak instructions from a free-text message
or YouTube transcript into structured JSON records. Each source may
contain ZERO, ONE, or MULTIPLE distinct tweaks.

For each tweak you find, emit one JSON record with these exact fields:
{
  "title": "<short title, e.g. 'Disable Network Throttling Index'>",
  "category": "registry" | "bcd" | "powerplan" | "network" | "nvidia" | "bios" | "process" | "timer" | "ram" | "monitor",
  "description": "<one-sentence what-it-does, plain language>",
  "rationale": "<one-line WHY this matters for gaming, taken from the source where possible>",
  "riskLevel": 1 | 2 | 3 | 4,
  "rebootRequired": "none" | "logout" | "reboot" | "cold-boot",
  "anticheatRisk": "none" | "low" | "medium" | "high",
  "actions": [<TweakAction objects>],
  "raw_excerpt": "<the exact phrase from the source that produced this tweak>"
}

TweakAction shapes (pick one per action):
  registry_set:    { "kind": "registry_set", "hive": "hkcu"|"hklm", "path": "...", "name": "...", "value_type": "dword"|"qword"|"string"|"expand_string"|"multi_string"|"binary", "value": <value> }
  registry_delete: { "kind": "registry_delete", "hive": "hkcu"|"hklm", "path": "...", "name": "<value-name or null for whole-key delete>" }
  bcdedit_set:     { "kind": "bcdedit_set", "name": "<bcd-name>", "value": "<bcd-value>" }

CRITICAL — YouTube transcripts rarely speak literal registry paths. When a
narrator names a well-known Windows tweak by its colloquial name, you MUST
reconstruct the canonical registry / bcdedit form from your training data.
Examples of expected reconstruction:

  "disable Game DVR" / "turn off Game Bar" ->
    HKCU\\System\\GameConfigStore\\GameDVR_Enabled = 0 (dword) AND
    HKCU\\Software\\Microsoft\\GameBar\\AllowAutoGameMode = 0 (dword)

  "disable mouse acceleration" / "turn off enhance pointer precision" ->
    HKCU\\Control Panel\\Mouse\\MouseSpeed = "0" (string) +
    MouseThreshold1 = "0" + MouseThreshold2 = "0"

  "disable Hyper-V" ->
    bcdedit /set hypervisorlaunchtype off

  "disable HPET" ->
    HKLM\\SYSTEM\\CurrentControlSet\\Services\\hpet\\Start = 4 (dword)

  "kill telemetry" / "disable DiagTrack" ->
    HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection\\AllowTelemetry = 0 (dword) AND
    HKLM\\SYSTEM\\CurrentControlSet\\Services\\DiagTrack\\Start = 4 (dword)

If the source describes a tweak by name AND you know the canonical
registry / bcdedit form with high confidence, emit the structured record.
If the narrator is vague ("tweak some settings") or the tweak is
exclusively GUI-driven with no registry analog (e.g., NVIDIA Control
Panel sliders, BIOS XMP toggles), skip it.

If the source describes a PowerShell-only command (Stop-Service,
Set-MpPreference, Disable-MMAgent, etc.) AND there is NO equivalent
registry / bcdedit form, skip it — those action variants ship in Phase
4d-v2.

Output STRICT JSON only, no prose. If zero tweaks: {"tweaks": []}.
If one or more: {"tweaks": [<record1>, <record2>, ...]}.
"""

EXTRACTION_USER_TMPL = """Message channel/source: {channel}
Message author: {author}
Message content:
\"\"\"
{content}
\"\"\"

Pre-detected signals (regex hints):
{signals}

Extract any registry / bcdedit tweaks. Skip pure-powershell instructions
unless they map cleanly to a registry / bcdedit equivalent.
"""


# ----------- Provider abstraction -----------


class Provider:
    name: str
    model: str

    def call(self, system: str, user: str) -> str:
        raise NotImplementedError


class GeminiProvider(Provider):
    name = "gemini"

    def __init__(self, model: str = "gemini-2.5-flash") -> None:
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY not set")
        try:
            from google import genai
            from google.genai import types as genai_types
        except ImportError as e:
            raise RuntimeError(
                "google-genai SDK not installed. Run: pip install google-genai"
            ) from e
        self._genai = genai
        self._types = genai_types
        self._client = genai.Client(api_key=api_key)
        self.model = model

    def call(self, system: str, user: str) -> str:
        cfg = self._types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            temperature=0.1,
            max_output_tokens=4096,
        )
        resp = self._client.models.generate_content(
            model=self.model, contents=user, config=cfg
        )
        return (resp.text or "").strip()


class AnthropicProvider(Provider):
    name = "anthropic"

    def __init__(self, model: str = "claude-haiku-4-5") -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise RuntimeError(
                "anthropic SDK not installed. Run: pip install anthropic"
            ) from e
        self._client = Anthropic(api_key=api_key)
        self.model = model

    def call(self, system: str, user: str) -> str:
        resp = self._client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text.strip()


# ----------- Extraction loop -----------


def parse_response(text: str) -> dict:
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  WARN: invalid JSON from LLM: {e}; raw: {text[:200]}", file=sys.stderr)
        return {"tweaks": []}
    # Normalize to {"tweaks": [...]} regardless of model's output shape.
    if isinstance(parsed, list):
        return {"tweaks": parsed}
    if isinstance(parsed, dict):
        if "tweaks" in parsed and isinstance(parsed["tweaks"], list):
            return parsed
        # Sometimes models wrap as {"records": [...]} or single tweak dict — best-effort.
        for key in ("records", "results", "items"):
            if key in parsed and isinstance(parsed[key], list):
                return {"tweaks": parsed[key]}
        if "title" in parsed and "actions" in parsed:
            # Single tweak object — wrap.
            return {"tweaks": [parsed]}
    return {"tweaks": []}


def call_extraction(
    provider: Provider, channel: str, author: str, content: str, signals: dict
) -> dict:
    user_prompt = EXTRACTION_USER_TMPL.format(
        channel=channel,
        author=author,
        content=content,
        signals=json.dumps(signals, indent=2),
    )
    text = provider.call(EXTRACTION_SYSTEM, user_prompt)
    return parse_response(text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--provider",
        choices=("gemini", "anthropic"),
        default="gemini",
        help="LLM provider (default: gemini, free tier)",
    )
    parser.add_argument(
        "--corpus",
        action="append",
        default=None,
        help="path to a corpus JSON; can be passed multiple times. "
             "Defaults to discord-corpus.json + yt-corpus.json (whichever exist).",
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="cap number of corpus entries to process"
    )
    parser.add_argument(
        "--only-with-signals",
        action="store_true",
        help="skip entries with no regex-detected signals",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="override model (default: gemini-2.5-flash for gemini, claude-haiku-4-5 for anthropic)",
    )
    parser.add_argument(
        "--skip-known",
        action="store_true",
        help="skip entries whose source signature already appears in llm-extracted.json",
    )
    parser.add_argument(
        "--append",
        action="store_true",
        help="append to existing llm-extracted.json instead of overwriting",
    )
    args = parser.parse_args()

    if args.provider == "gemini":
        provider: Provider = GeminiProvider(model=args.model or "gemini-2.5-flash")
    else:
        provider = AnthropicProvider(model=args.model or "claude-haiku-4-5")

    corpus_paths = (
        [Path(p) for p in args.corpus] if args.corpus else [p for p in DEFAULT_CORPORA if p.exists()]
    )
    if not corpus_paths:
        print(
            f"ERROR: no corpora found. Expected one of:\n  "
            + "\n  ".join(str(p) for p in DEFAULT_CORPORA),
            file=sys.stderr,
        )
        return 2

    all_entries: list[dict[str, Any]] = []
    for cp in corpus_paths:
        if not cp.exists():
            print(f"  WARN: corpus path missing: {cp}", file=sys.stderr)
            continue
        data = json.loads(cp.read_text(encoding="utf-8"))
        ents = data.get("entries", [])
        # Tag corpus origin so we can cite it back per-tweak.
        for e in ents:
            e.setdefault("_corpus", cp.name)
        print(f"  {cp.name}: {len(ents)} entries")
        all_entries.extend(ents)

    if args.only_with_signals:
        all_entries = [e for e in all_entries if any(e.get("signals", {}).values())]

    # Build skip-set from prior runs.
    prior_extracted: list[dict] = []
    skip_keys: set[tuple] = set()
    if (args.skip_known or args.append) and OUT.exists():
        prior = json.loads(OUT.read_text(encoding="utf-8"))
        prior_extracted = prior.get("tweaks", [])
        for t in prior_extracted:
            sc = t.get("sourceCitation") or {}
            key = (sc.get("corpus"), sc.get("messageId"))
            if key != (None, None):
                skip_keys.add(key)
    if args.skip_known and skip_keys:
        before = len(all_entries)
        all_entries = [
            e
            for e in all_entries
            if (e.get("_corpus"), e.get("message_id") or e.get("video_id")) not in skip_keys
        ]
        print(f"  skip-known: {before} -> {len(all_entries)} ({before-len(all_entries)} skipped)")

    if args.limit:
        all_entries = all_entries[: args.limit]

    print(
        f"Processing {len(all_entries)} entries via {provider.name}/{provider.model}..."
    )

    extracted: list[dict] = []
    consecutive_429 = 0
    for i, entry in enumerate(all_entries, 1):
        print(f"  [{i}/{len(all_entries)}] {entry.get('id','?')}")
        try:
            result = call_extraction(
                provider,
                entry.get("channel", entry.get("_corpus", "?")),
                entry.get("author", "?"),
                entry.get("content", ""),
                entry.get("signals", {}),
            )
            consecutive_429 = 0
        except Exception as e:
            err = str(e)
            print(f"    ERROR calling LLM: {err[:160]}", file=sys.stderr)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                consecutive_429 += 1
                if consecutive_429 >= 3:
                    print(
                        f"\n  3 consecutive 429s — daily quota likely exhausted. "
                        f"Saving partial results and bailing.",
                        file=sys.stderr,
                    )
                    break
                time.sleep(35.0)  # honor Gemini's typical retry-delay
                continue
            time.sleep(2.0)
            continue
        for tweak in result.get("tweaks", []):
            tweak["sourceCitation"] = {
                "corpus": entry.get("_corpus"),
                "channel": entry.get("channel"),
                "messageId": entry.get("message_id") or entry.get("video_id"),
                "timestamp": entry.get("timestamp"),
            }
            extracted.append(tweak)
        # Pacing — Gemini free tier rate limits are tighter than docs claim.
        # 10s gives plenty of margin under the 10 RPM enforcement.
        time.sleep(10.0 if provider.name == "gemini" else 0.2)

    final_tweaks = (prior_extracted + extracted) if args.append else extracted

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "version": "v0-llm-pass-1",
                "provider": provider.name,
                "model": provider.model,
                "source_corpora": [str(p) for p in corpus_paths],
                "source_entries": len(all_entries),
                "extracted_count": len(final_tweaks),
                "this_run_extracted": len(extracted),
                "appended": bool(args.append),
                "tweaks": final_tweaks,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"\nWrote {len(final_tweaks)} total draft tweaks -> {OUT} (this run: {len(extracted)})")
    print("Hand-review each before promoting to resources/catalog/v1.json.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
