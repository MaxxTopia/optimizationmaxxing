# Optimizationmaxxing

> The only Windows tuner that shows its work. Every tweak traced to a Microsoft Learn doc or a vendor whitepaper. One UAC prompt applies the whole preset. Snapshot-backed revert, any tweak, any time.

**[Download for Windows](https://maxxtopia.com/optimizationmaxxing)** · **[Manifesto](https://maxxtopia.com/manifesto)**

## What it does

A 3.6 MB Tauri 2 app for tuning Windows for competitive gaming. Built for players who count their frame times.

- **87 audited tweaks** — registry, BCD store, PowerShell scripts, file writes. Each cites a Microsoft Learn doc, vendor whitepaper, or community-verified source.
- **10 curated presets** — Esports, BR, Streamer, Frame Pacing, Network Low-Latency, Tournament FPS, Calm Mode, Laptop Tuning, iGPU Rig Tuning, Clean State Gaming. Plus a custom builder.
- **One UAC prompt** — whole preset behind one elevation. Snapshot-backed. Roll any tweak back, any time. Undo is not a paid tier.
- **Spec-aware** — detects CPU vendor, RAM topology, OS build, laptop vs desktop. Hides what doesn't apply.
- **Live diagnostics** — DPC + interrupt time graph, PCIe link card, latency probe, Intel microcode advisor, VBS/HVCI status. Measure before, measure after.
- **Native** — Rust + Tauri 2 + React 18. ~3.6 MB installer. Opens in 200 ms. Hone is 200 MB. Paragon is 81.

The full positioning lives at [maxxtopia.com/optimizationmaxxing](https://maxxtopia.com/optimizationmaxxing).

## Stack

| | |
|---|---|
| Frontend | Vite · React 18 · TypeScript · Tailwind 3.4 |
| State | Zustand (UI) · Rust + SQLite (engine) |
| Desktop | Tauri 2 · Rust |
| Bundle | NSIS installer (Windows-only for v0.1) |

## Local dev

```powershell
npm install
npm run tauri:dev
```

First `tauri:dev` compiles ~434 crates (~5-10 min). Incremental rebuilds <60 s.

**Prereqs:** Node 18+ · Rust + cargo · Microsoft Visual Studio C++ Build Tools.

## Local release build

```powershell
npm run tauri:build
```

Outputs:
- `src-tauri/target/release/optimizationmaxxing.exe` — raw binary
- `src-tauri/target/release/bundle/nsis/optimizationmaxxing_<version>_x64-setup.exe` — installer

## Releases

Every `v*` tag push triggers GitHub Actions to build the installer, attach it to a draft GitHub release, and ping [maxxtopia.com](https://maxxtopia.com/optimizationmaxxing) so the Download CTA auto-updates. See [`docs/MAXXTOPIA_AUTOSYNC.md`](docs/MAXXTOPIA_AUTOSYNC.md) for the cross-repo dispatch setup.

To cut a release:
```powershell
# 1. Bump version in package.json + src-tauri/tauri.conf.json (must match)
# 2. Commit + tag
git add package.json src-tauri/tauri.conf.json
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z

# 3. Push
git push origin main
git push origin vX.Y.Z
```

CI takes ~10-15 min on first run (cargo cold cache). Subsequent runs ~5-7 min.

## Repo layout

See [`CLAUDE.md`](CLAUDE.md) for the full project map, phase status, theme system, engine architecture, and competitor recon.

## License

All rights reserved. License decision pending — likely MIT or Apache-2.0 for v0.2.
