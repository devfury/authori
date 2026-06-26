param(
    [Parameter(Position = 0)]
    [string]$Command,
    [Parameter(Position = 1)]
    [string]$Version
)

if (-not $Version) {
    Write-Error "Usage: bump-version.ps1 <command> <version>  (e.g. bump-version.ps1 bump 1.2.3)"
    exit 1
}

if ($Version -notmatch '^\d+\.\d+\.\d+') {
    Write-Error "Invalid version format: '$Version'. Expected semver (e.g. 1.2.3)"
    exit 1
}

$root = Split-Path -Parent $PSScriptRoot

$targets = @(
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json"
)

foreach ($rel in $targets) {
    $path = Join-Path $root $rel
    $content = Get-Content $path -Raw -Encoding utf8
    $updated = $content -replace '"version"\s*:\s*"[^"]+"', "`"version`": `"$Version`""
    [System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Updated: $rel"
}

Push-Location $root
try {
    bun install
    git add bun.lock
    git add ($targets | ForEach-Object { $_ -replace '/', '\' })
    git commit -m "chore: bump version to $Version"
    Write-Host "`nCommitted version bump to $Version"
} finally {
    Pop-Location
}
