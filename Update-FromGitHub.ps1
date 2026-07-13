[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$Remote = 'origin',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    & git @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is not installed or is not available on PATH.'
}

$repoRoot = (& git -C $PSScriptRoot rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'Update-FromGitHub.ps1 must remain inside the Tableau-LSP Git checkout.'
}

Push-Location -LiteralPath $repoRoot
try {
    $trackedChanges = @(& git status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not inspect the working tree.'
    }
    if ($trackedChanges.Count -gt 0) {
        throw 'Tracked files have local changes. Commit or stash them before updating; this script will not discard work.'
    }

    Write-Host "Fetching $Remote..." -ForegroundColor Cyan
    Invoke-Git fetch --prune $Remote

    $remoteRef = "$Remote/$Branch"
    & git show-ref --verify --quiet "refs/remotes/$remoteRef"
    if ($LASTEXITCODE -ne 0) {
        throw "Remote branch '$remoteRef' does not exist."
    }

    $currentBranch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not determine the current branch.'
    }
    if ($currentBranch -ne $Branch) {
        & git show-ref --verify --quiet "refs/heads/$Branch"
        if ($LASTEXITCODE -eq 0) {
            Invoke-Git switch $Branch
        } else {
            Invoke-Git switch --create $Branch --track $remoteRef
        }
    }

    Write-Host "Fast-forwarding $Branch from $remoteRef..." -ForegroundColor Cyan
    Invoke-Git pull --ff-only $Remote $Branch

    $revision = (& git rev-parse --short HEAD).Trim()
    Write-Host "Updated $repoRoot to $remoteRef at $revision." -ForegroundColor Green
    Write-Host 'Untracked local files were left untouched.' -ForegroundColor DarkGray

    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'package.json'))) {
        Write-Host 'No package.json found; skipping build.' -ForegroundColor DarkGray
    } elseif (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host 'npm is not available on PATH; skipping build. Run "npm ci" and "npm run compile" manually.' -ForegroundColor Yellow
    } else {
        try {
            Write-Host 'Installing dependencies (npm ci)...' -ForegroundColor Cyan
            & npm ci
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci failed with exit code $LASTEXITCODE."
            }

            Write-Host 'Compiling extension (npm run compile)...' -ForegroundColor Cyan
            & npm run compile
            if ($LASTEXITCODE -ne 0) {
                throw "npm run compile failed with exit code $LASTEXITCODE."
            }

            Write-Host 'Build completed; out/ is up to date.' -ForegroundColor Green
        } catch {
            Write-Warning "Build failed: $_"
            Write-Warning 'The pull succeeded; out/ may be stale. Fix the build and run "npm run compile" manually.'
        }
    }
} finally {
    Pop-Location
}
