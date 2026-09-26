# Custom OS review — Fortnite benchmark checklist

**Last reviewed: 2026-09-25.** There is no universal fastest Windows build. The
only useful comparison is the same PC, BIOS, GPU driver, Fortnite build, map,
settings, frame cap, input devices, and capture path.

## Fortnite results

This app does not have controlled Fortnite FPS captures for these images, so it
does not invent a ranking. Record the same run on each installation and fill in
the numbers you actually measured.

| OS / image | Average FPS | 1% low FPS | P95 frame time | Result |
|---|---:|---:|---:|---|
| Stock Windows 11 (baseline) | — | — | — | Run first |
| Atlas OS | — | — | — | Measure on the same build |
| Windows X-Lite | — | — | — | Measure on the same build |
| Tiny11 | — | — | — | Measure on the same build |
| Ghost Spectre | — | — | — | Measure on the same build |
| ReviOS | — | — | — | Measure on the same build |
| Windows 11 IoT Enterprise LTSC | — | — | — | Separate license and compatibility check |

Use `/benchmark` or an external Fortnite capture that records average FPS,
1% lows, and frame-time percentiles. The local OS Lab stores useful CPU/DPC/
frame-pacing diagnostics, but its composite score is **not Fortnite FPS**.

## Quick review

| Option | What changes | Practical use |
|---|---|---|
| Stock Windows 11 | Supported drivers, updates, recovery, and security path | Best baseline for a primary competitive PC |
| Atlas / ReviOS | A playbook or configured Windows install; the result depends on selected options and build | Secondary test until the complete game workflow passes |
| X-Lite / Tiny11 / Ghost Spectre | Modified images can remove components, services, recovery, or update paths | Lab image with a separate recovery plan |
| IoT Enterprise LTSC | Different licensing and servicing channel | Controlled lab or legitimate enterprise deployment |

## Run the comparison

1. Export or photograph BIOS settings, then keep BIOS, GPU driver, memory
   profile, power plan, Fortnite version, and frame cap identical.
2. Run the same Creative route or replay three times on each OS. Close the
   same background apps and use the same capture method.
3. Record average FPS, 1% low FPS, P95 frame time, crashes, input devices,
   audio, streaming/capture, sleep/resume, updates, and recovery.
4. Keep an image only when it wins the repeatable Fortnite result **and** the
   rest of the workflow. A lower idle-RAM number alone is not a win.

The app is a reversible tuning and measurement layer. It does not create or
ship a separate operating-system image.
