# Icons

Drop these files in this folder before `tauri build`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS — optional for Windows-only build)
- `icon.ico` (Windows installer)

Generate from a single source PNG via the Tauri CLI:

```
npx @tauri-apps/cli icon ./brand/source.png
```

This is gitignored on a fresh clone — placeholder icons are fine for `tauri dev`.
