"""Phase 5d — YouTube transcript miner.

Walks the curated creator list (`references/optimizationmaxxing-youtube-creators.md`),
searches YouTube via `yt-dlp` for optimization-themed videos, downloads
auto-generated English subtitles, and emits a unified corpus JSON in
the same shape as `discord-corpus.json` so the existing LLM extractor
can consume it.

USAGE:
    pip install yt-dlp
    python scripts/fetch_youtube_transcripts.py                  # full mine
    python scripts/fetch_youtube_transcripts.py --max-per 3      # 3 videos / creator+keyword
    python scripts/fetch_youtube_transcripts.py --creator fr33thy
    python scripts/fetch_youtube_transcripts.py --skip-search    # rebuild corpus from existing subs

Output: resources/catalog/draft/yt-corpus.json
Subtitle cache: resources/catalog/draft/yt-subs/<video_id>.en.vtt

No API key needed — yt-dlp scrapes YouTube directly.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SUBS_DIR = PROJECT_ROOT / "resources/catalog/draft/yt-subs"
OUT_PATH = PROJECT_ROOT / "resources/catalog/draft/yt-corpus.json"

# Curated starter set from references/optimizationmaxxing-youtube-creators.md
CREATORS = [
    {"handle": "fr33thy", "trust": "medium-high"},
    {"handle": "lecctron", "trust": "medium"},
    {"handle": "xilly", "trust": "medium"},
    {"handle": "lestripez", "trust": "low-medium"},
    {"handle": "reknotic", "trust": "unknown"},
]

KEYWORDS = [
    "fps boost",
    "optimization guide",
    "windows tweaks",
    "input lag",
    "lower latency",
    "the only guide",
    "tweak pack",
    "bios tweaks",
]

# Same permissive regexes as the Discord extractor — keep these for the
# rare creator who reads paths aloud or has them in subtitles.
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

# Topic-keyword signals: surface narration that DISCUSSES a known tweak by
# name even when no literal path is spoken. The LLM extractor will fill in
# the actual registry / bcdedit form from its training data + our prompt.
TOPIC_PATTERNS: dict[str, re.Pattern] = {
    "game_dvr": re.compile(r"\bgame\s*(?:d\s*v\s*r|bar)\b", re.IGNORECASE),
    "fullscreen_opt": re.compile(r"\bfullscreen\s+optim|FSO\b|fullscreen[- ]exclusive", re.IGNORECASE),
    "mouse_accel": re.compile(r"\b(?:enhance|enhance pointer precision|mouse\s+accel)\w*\b", re.IGNORECASE),
    "telemetry": re.compile(r"\b(?:telemetry|diagtrack|connected user)\b", re.IGNORECASE),
    "hpet": re.compile(r"\bhpet|high[- ]precision\s+event\s+timer|platform\s*clock\b", re.IGNORECASE),
    "hyper_v": re.compile(r"\bhyper[- ]?v|hypervisor|memory\s+integrity|VBS|HVCI\b", re.IGNORECASE),
    "mmcss": re.compile(r"\bmmcss|system\s+responsiveness|gpu\s+priority\b", re.IGNORECASE),
    "tcp_throttle": re.compile(r"\bnetwork\s+throttling|throttling\s+index|nagle|tcp\s*ack\b", re.IGNORECASE),
    "dynamic_tick": re.compile(r"\bdynamic\s*tick|tickless\b", re.IGNORECASE),
    "tsc": re.compile(r"\btsc\b|time\s+stamp\s+counter", re.IGNORECASE),
    "power_plan": re.compile(r"\bpower\s*plan|ultimate\s+performance|cpu\s+min\s+state\b", re.IGNORECASE),
    "nvidia_reflex": re.compile(r"\b(?:nvidia\s+reflex|reflex\s+(?:low\s+)?latency|low[- ]latency\s+mode)\b", re.IGNORECASE),
    "regedit_mention": re.compile(r"\bregistry\s+editor|regedit|registry\s+tweak", re.IGNORECASE),
    "powercfg_mention": re.compile(r"\bpowercfg\b", re.IGNORECASE),
    "bios_tweaks": re.compile(r"\b(?:resizable\s+bar|rebar|XMP|EXPO|undervolt|PBO|MCE)\b", re.IGNORECASE),
    "win_search": re.compile(r"\bwindows\s+search|cortana|widget", re.IGNORECASE),
    "startup_delay": re.compile(r"\bstartup\s+delay|startup\s+programs", re.IGNORECASE),
    "visual_fx": re.compile(r"\bvisual\s+effects|animations|best\s+performance\b", re.IGNORECASE),
}


def yt_dlp(*args: str, capture_json: bool = False) -> tuple[int, str, str]:
    """Run yt-dlp via the python -m form (no exe-on-PATH dep)."""
    cmd = [sys.executable, "-m", "yt_dlp", "--no-warnings", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    return proc.returncode, proc.stdout or "", proc.stderr or ""


def asciify(s: str) -> str:
    """ASCII-safe stdout. Diggy's cp1252 console can't encode emoji/unicode."""
    if not s:
        return ""
    return s.encode("ascii", "replace").decode("ascii")


def search_videos(creator_handle: str, keyword: str, count: int) -> list[dict[str, Any]]:
    """Return a list of { id, title, channel, uploader_id, duration } dicts."""
    query = f"ytsearch{count}:{creator_handle} {keyword}"
    rc, stdout, stderr = yt_dlp(
        query,
        "--flat-playlist",
        "--dump-single-json",
    )
    if rc != 0:
        print(f"  WARN: search failed for {creator_handle}/{keyword}: {stderr.strip()[:200]}", file=sys.stderr)
        return []
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return []
    entries = payload.get("entries", [])
    return entries


def looks_like_creator(entry: dict[str, Any], creator_handle: str) -> bool:
    """Soft channel-name match — the search returns broader results than just the creator."""
    handle = creator_handle.lower()
    fields = " ".join(
        str(entry.get(k, "") or "")
        for k in ("uploader", "channel", "uploader_id", "channel_id")
    ).lower()
    return handle in fields


def fetch_subtitle(video_id: str) -> Path | None:
    """Download English auto-subtitle for a video. Returns the .vtt path or None."""
    SUBS_DIR.mkdir(parents=True, exist_ok=True)
    expected = SUBS_DIR / f"{video_id}.en.vtt"
    if expected.exists() and expected.stat().st_size > 0:
        return expected
    rc, _stdout, stderr = yt_dlp(
        f"https://www.youtube.com/watch?v={video_id}",
        "--write-auto-subs",
        "--sub-langs",
        "en",
        "--skip-download",
        "--output",
        str(SUBS_DIR / f"{video_id}.%(ext)s"),
    )
    if rc != 0:
        print(f"    WARN: sub fetch failed for {video_id}: {stderr.strip()[:120]}", file=sys.stderr)
        return None
    if expected.exists():
        return expected
    # yt-dlp sometimes emits .en-orig.vtt or numeric lang variants.
    cands = sorted(SUBS_DIR.glob(f"{video_id}*.vtt"))
    return cands[0] if cands else None


def vtt_to_text(vtt_path: Path) -> str:
    """Strip WebVTT timing lines and dedupe consecutive identical cue text."""
    text = vtt_path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    out: list[str] = []
    last = ""
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        # Skip header + cue settings + timestamps.
        if line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
            continue
        if "-->" in line:
            continue
        # Skip cue numbers (just digits).
        if line.isdigit():
            continue
        # Strip inline timing tags <00:00:01.000>.
        cleaned = re.sub(r"<[^>]+>", "", line)
        cleaned = re.sub(r"&[a-z]+;", " ", cleaned)
        if cleaned and cleaned != last:
            out.append(cleaned)
            last = cleaned
    return "\n".join(out)


def extract_signals(content: str) -> dict[str, list[str]]:
    topics = sorted(name for name, pat in TOPIC_PATTERNS.items() if pat.search(content))
    return {
        "registry_paths": list({m.group(0).strip() for m in REG_PATH_RE.finditer(content)}),
        "bcdedit_commands": list({m.group(0).strip() for m in BCDEDIT_RE.finditer(content)}),
        "reg_add_commands": list({m.group(0).strip() for m in REG_ADD_RE.finditer(content)}),
        "powershell_hints": list({m.group(0).strip() for m in POWERSHELL_HINT_RE.finditer(content)}),
        "topics": topics,
    }


def has_signals(s: dict[str, list[str]]) -> bool:
    return any(v for v in s.values())


def chunk_long_content(content: str, max_chars: int = 8000) -> Iterable[str]:
    """Most videos transcribe to ~3-15K chars. Chunk to avoid LLM context issues."""
    if len(content) <= max_chars:
        yield content
        return
    # Naive paragraph-aware split.
    cur: list[str] = []
    size = 0
    for para in content.split("\n"):
        if size + len(para) + 1 > max_chars and cur:
            yield "\n".join(cur)
            cur = [para]
            size = len(para)
        else:
            cur.append(para)
            size += len(para) + 1
    if cur:
        yield "\n".join(cur)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-per", type=int, default=5, help="videos per creator+keyword search")
    parser.add_argument("--creator", default=None, help="restrict to one creator handle")
    parser.add_argument(
        "--skip-search",
        action="store_true",
        help="don't search YouTube; rebuild corpus from existing subs in yt-subs/",
    )
    parser.add_argument(
        "--require-signals",
        action="store_true",
        help="drop videos whose transcript has no regex-detected tweak hints",
    )
    args = parser.parse_args()

    SUBS_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: discover videos per creator/keyword (or skip).
    videos: dict[str, dict[str, Any]] = {}
    if not args.skip_search:
        creators = (
            [c for c in CREATORS if c["handle"].lower() == args.creator.lower()]
            if args.creator
            else CREATORS
        )
        for creator in creators:
            handle = creator["handle"]
            print(f"[search] {handle} - {len(KEYWORDS)} keywords")
            for kw in KEYWORDS:
                results = search_videos(handle, kw, args.max_per)
                kept = [r for r in results if looks_like_creator(r, handle)]
                for r in kept:
                    vid = r.get("id")
                    if not vid or vid in videos:
                        continue
                    videos[vid] = {
                        "id": vid,
                        "title": r.get("title"),
                        "channel": r.get("channel") or r.get("uploader"),
                        "duration": r.get("duration"),
                        "creator_handle": handle,
                        "trust": creator["trust"],
                        "matched_keyword": kw,
                    }
                print(f"    {kw!r}: {len(results)} hits, {len(kept)} kept")
        print(f"\n[search] total unique videos: {len(videos)}")
    else:
        # Rebuild from on-disk subs.
        for vtt in SUBS_DIR.glob("*.vtt"):
            vid = vtt.stem.split(".")[0]
            videos.setdefault(vid, {"id": vid, "creator_handle": "?", "trust": "?"})
        print(f"[skip-search] reusing {len(videos)} cached subtitle files")

    # Step 2: fetch subs + transcribe.
    entries: list[dict[str, Any]] = []
    for i, (vid, meta) in enumerate(videos.items(), 1):
        print(f"[{i}/{len(videos)}] {vid} {asciify((meta.get('title') or '')[:60])}")
        try:
            vtt = fetch_subtitle(vid)
        except Exception as e:
            print(f"    ERROR fetching sub: {asciify(str(e))[:120]}", file=sys.stderr)
            continue
        if not vtt:
            continue
        try:
            content = vtt_to_text(vtt)
        except Exception as e:
            print(f"    ERROR parsing vtt: {asciify(str(e))[:120]}", file=sys.stderr)
            continue
        if not content.strip():
            continue
        signals = extract_signals(content)
        if args.require_signals and not has_signals(signals):
            print("    no signals, skipping")
            continue
        # If transcript is huge, split into multiple corpus entries so
        # the LLM extractor can fit them without truncation.
        for ci, chunk in enumerate(chunk_long_content(content)):
            chunk_signals = extract_signals(chunk)
            entries.append(
                {
                    "id": f"yt.{meta.get('creator_handle','?')}.{vid}.{ci}",
                    "channel": f"yt:{meta.get('creator_handle','?')}",
                    "video_id": vid,
                    "video_title": meta.get("title"),
                    "video_url": f"https://www.youtube.com/watch?v={vid}",
                    "creator_handle": meta.get("creator_handle"),
                    "trust": meta.get("trust"),
                    "matched_keyword": meta.get("matched_keyword"),
                    "chunk_index": ci,
                    "author": meta.get("channel") or meta.get("creator_handle"),
                    "content": chunk,
                    "signals": chunk_signals,
                    "needs_review": True,
                }
            )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(
            {
                "version": "v0",
                "source": "youtube/yt-dlp",
                "creator_count": len({e.get("creator_handle") for e in entries}),
                "video_count": len({e.get("video_id") for e in entries}),
                "entry_count": len(entries),
                "entries": entries,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    with_signals = sum(1 for e in entries if has_signals(e.get("signals", {})))
    print()
    print(f"Wrote {len(entries)} entries -> {OUT_PATH}")
    print(f"Entries with regex-detected signals: {with_signals}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
