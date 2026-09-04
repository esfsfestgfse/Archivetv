[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Message,
  [switch]$SkipTests,
  [switch]$AllowDirtyIndex,
  [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $candidate = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  if (Test-Path -LiteralPath $candidate) { $node = $candidate }
}
if (-not $node) { throw 'Node.js is required for the HTML validator.' }
$gitArgs = @('-c', "safe.directory=$repo")

function Get-Stamp([string]$html) {
  $match = [regex]::Match($html, 'window\.__ATV_BUILD\s*=\s*"([^"]+)"')
  if (-not $match.Success) { return $null }
  return $match.Groups[1].Value
}

Push-Location $repo
try {
  $status = @(git @gitArgs status --porcelain)
  if (-not $status -and -not $AllowDirtyIndex) {
    throw 'Working tree is clean; there is nothing to ship.'
  }

  & $node 'scripts/check-html-syntax.js'
  if ($LASTEXITCODE -ne 0) { throw 'HTML validation failed.' }

  foreach ($file in @('the_dial_mobile.html', 'the_dial_desktop.html')) {
    $current = Get-Stamp (Get-Content -LiteralPath $file -Raw)
    $previous = Get-Stamp ((git @gitArgs show "HEAD:$file") -join "`n")
    if (-not $current -or -not $previous) { throw "Could not read build stamp for $file." }
    $currentMatch = [regex]::Match($current, '\.(\d+)(?:-[^.]+)*$')
    $previousMatch = [regex]::Match($previous, '\.(\d+)(?:-[^.]+)*$')
    if (-not $currentMatch.Success -or -not $previousMatch.Success) {
      throw "Could not parse numeric build stamp for $file ($previous -> $current)."
    }
    $currentNumber = [int]$currentMatch.Groups[1].Value
    $previousNumber = [int]$previousMatch.Groups[1].Value
    $changed = @(git @gitArgs diff --name-only -- $file)
    if ($changed -and $currentNumber -le $previousNumber) {
      throw "$file changed without a build-stamp bump ($previous -> $current)."
    }
  }

  if ($ValidateOnly) {
    Write-Host 'Validation completed; no commit or push performed.'
    return
  }

  if (-not $SkipTests) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw 'Python is required for the Playwright regression suite. Use -SkipTests only when intentionally bypassing it.' }
    $server = Start-Process -FilePath $python.Source -ArgumentList '-m','http.server','8799' -WorkingDirectory $repo -PassThru -WindowStyle Hidden
    try {
      Start-Sleep -Seconds 2
      & $python.Source 'ci/test_tune_all.py' 'http://localhost:8799/the_dial_mobile.html'
      if ($LASTEXITCODE -ne 0) { throw 'Mobile tune-all failed.' }
      & $python.Source 'ci/test_regression.py' 'http://localhost:8799/the_dial_mobile.html'
      if ($LASTEXITCODE -ne 0) { throw 'Mobile regression failed.' }
    } finally {
      Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
  }

  git @gitArgs add --all
  git @gitArgs diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { throw 'No staged changes to commit.' }
  git @gitArgs -c user.name=esfsfestgfse -c user.email=54010214+esfsfestgfse@users.noreply.github.com commit -m $Message
  git @gitArgs push origin main

  $head = (git @gitArgs rev-parse HEAD).Trim()
  $headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'afterglow-ship' }
  $tree = Invoke-RestMethod -Headers $headers -Uri 'https://api.github.com/repos/esfsfestgfse/Archivetv/git/trees/main?recursive=1'
  $paths = @('the_dial_mobile.html', 'the_dial_desktop.html')
  foreach ($path in $paths) {
    if (-not ($tree.tree | Where-Object { $_.path -eq $path })) { throw "GitHub API cannot see $path after push." }
  }
  Write-Host "Pushed $head and verified both production HTML files through the GitHub API."
} finally {
  Pop-Location
}
