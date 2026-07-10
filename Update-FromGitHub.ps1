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

$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    throw 'Run this script from inside the Tableau-LSP Git checkout.'
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
} finally {
    Pop-Location
}
