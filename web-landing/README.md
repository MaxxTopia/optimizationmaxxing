# Landing site

Single-file static HTML. No build step. Deploy by uploading `index.html` to any static host (Vercel, Cloudflare Pages, GitHub Pages, S3+CloudFront).

## Local preview
```
cd web-landing
python -m http.server 8000
# open http://localhost:8000
```

## Production deploy

Drop `index.html` + the latest installer (`optimizationmaxxing_0.1.0_x64-setup.exe`) into the same dir on the host. The download CTA links to a relative path, so co-locating just works.

## Updating

- Edit `index.html` directly. CSS is inline (single `<style>` block at top).
- Update `eyebrow` version string when shipping new releases.
- Update Stats section + comparison table after each catalog expansion.
- FAQ should track v-version-by-version FAQ-worthy questions from Discord support.

## Why static, not a Vite project?

The landing page has zero interactive state — no router, no auth, no live data. A Vite app would add 200KB+ of React/Vite runtime for content that's pure HTML. Single static file is faster to load, faster to deploy, and impossible to break with a bad rebuild.

When the marketing site needs interactivity (signup form, live demo embed, A/B-tested CTAs), promote it to a Vite project. For now: HTML.
