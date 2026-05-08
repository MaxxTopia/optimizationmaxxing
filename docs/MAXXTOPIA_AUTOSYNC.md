# Auto-sync this product's releases to maxxtopia.com

When you cut a new GitHub release here (or any `v*` tag pushes to CI), the [download CTA on maxxtopia.com/optimizationmaxxing](https://maxxtopia.com/optimizationmaxxing) should auto-update to point at the new installer. Maxxtopia already has the listener wired (see `MaxxTopia/maxxtopia/.github/workflows/sync-optimizationmaxxing-release.yml`); you just need to fire the dispatch from this repo.

## One-time setup

1. **Create a fine-grained PAT** at https://github.com/settings/personal-access-tokens/new
   - **Token name:** `maxxtopia-dispatch-from-om`
   - **Resource owner:** `dtman-gif`
   - **Expiration:** 1 year (or no-expiration)
   - **Repository access:** *Only select repositories* → `MaxxTopia/maxxtopia`
   - **Permissions:**
     - `Contents` → **Read and write**
     - `Metadata` → **Read-only** (auto-required)
   - Generate, copy the `github_pat_…` token.

2. **Add as repo secret** at https://github.com/MaxxTopia/optimizationmaxxing/settings/secrets/actions/new
   - Name: `MAXXTOPIA_DISPATCH_PAT`
   - Value: paste the token

   You can re-use the same PAT across multiple suite repos (Discordmaxxer + Optimizationmaxxing + future products) — just paste it into each repo's secret with the same name.

## Add to your release workflow

Wherever your CI runs the final installer build + GitHub release upload (likely `.github/workflows/release.yml`), append this step **after** the release upload succeeds:

```yaml
            # Notify maxxtopia.com so the Download CTA updates to the new installer.
            - name: Notify maxxtopia of new release
              if: success() && startsWith(github.ref, 'refs/tags/v') && env.HAS_PAT == 'true'
              shell: bash
              env:
                  PAT: ${{ secrets.MAXXTOPIA_DISPATCH_PAT }}
                  HAS_PAT: ${{ secrets.MAXXTOPIA_DISPATCH_PAT != '' }}
              run: |
                  TAG="${GITHUB_REF_NAME}"
                  VERSION="${TAG#v}"
                  curl --fail-with-body -X POST \
                       -H "Accept: application/vnd.github+json" \
                       -H "Authorization: Bearer ${PAT}" \
                       -H "X-GitHub-Api-Version: 2022-11-28" \
                       https://api.github.com/repos/MaxxTopia/maxxtopia/dispatches \
                       -d "$(jq -n \
                           --arg version "${TAG}" \
                           --arg installerUrl "https://github.com/MaxxTopia/optimizationmaxxing/releases/download/${TAG}/optimizationmaxxing_${VERSION}_x64-setup.exe" \
                           --arg releasePageUrl "https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/${TAG}" \
                           '{event_type: "optimizationmaxxing-released", client_payload: {version: $version, installerUrl: $installerUrl, releasePageUrl: $releasePageUrl}}')"
```

**Adjust the installer URL** to match whatever your Tauri build emits. Per CLAUDE.md the bundle name is `optimizationmaxxing_<version>_x64-setup.exe` (NSIS). If yours differs, edit the `installerUrl` line.

## What happens on each tag push

1. Your `release.yml` builds the installer + uploads it to a GitHub release for the new tag
2. The dispatch step fires `repository_dispatch` → maxxtopia
3. Maxxtopia's listener rewrites `src/data/optimizationmaxxing-release.json` with the new payload
4. Cloudflare Pages auto-deploys the rebuild (~30-60s)
5. `maxxtopia.com/optimizationmaxxing` Download button now points at the new installer

If the PAT secret is missing, the dispatch step skips silently — your release still ships, the site just stays on whatever version it had.

## Manual re-sync (if it ever desyncs)

```powershell
gh workflow run sync-optimizationmaxxing-release.yml `
  --repo MaxxTopia/maxxtopia `
  --field version=v0.1.7 `
  --field installer_url='https://github.com/MaxxTopia/optimizationmaxxing/releases/download/v0.1.7/optimizationmaxxing_0.1.7_x64-setup.exe' `
  --field release_page_url=https://github.com/MaxxTopia/optimizationmaxxing/releases/tag/v0.1.7
```
