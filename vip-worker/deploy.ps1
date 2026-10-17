param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$workerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerPath = Join-Path $workerRoot 'worker.js'
$configPath = Join-Path $workerRoot 'wrangler.toml'

if (-not (Test-Path -LiteralPath $workerPath) -or -not (Test-Path -LiteralPath $configPath)) {
    throw 'Worker source or wrangler.toml is missing.'
}

$worker = Get-Content -LiteralPath $workerPath -Raw
$config = Get-Content -LiteralPath $configPath -Raw
$requiredWorkerMarkers = @(
    "path === '/admin/remove'",
    "path === '/admin/revoke'",
    'PROFILE_MEDIA_PREFIX',
    'const ADMIN_HTML_V2 =',
    'id="productFilter"',
    'id="durationFilter"',
    'id="statusFilter"',
    'function exportCsv(',
    'Show removed',
    'function removeCode(',
    'function revoke(',
    'function syncTier('
)
foreach ($marker in $requiredWorkerMarkers) {
    if (-not $worker.Contains($marker)) {
        throw "Refusing deployment: worker.js is missing required VIP admin or profile-media marker: $marker"
    }
}
if ($config -notmatch '(?m)^binding\s*=\s*"PROFILE_MEDIA"\s*$' -or
    $config -notmatch '(?m)^bucket_name\s*=\s*"discordmaxxer-profile-media"\s*$') {
    throw 'Refusing deployment: wrangler.toml does not bind the Discordmaxxer profile-media R2 bucket.'
}

Push-Location -LiteralPath $workerRoot
try {
    if ($DryRun) {
        & npx wrangler deploy --dry-run
    } else {
        & npx wrangler deploy
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
