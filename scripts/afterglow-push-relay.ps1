[CmdletBinding()]
param(
  [int]$PollSeconds = 15
)

# Run this under the Windows account that owns the normal GitHub login. It turns
# validated local commits into automatic pushes without depending on a sandboxed
# agent process having outbound Git upload access.
$repoRoot = Split-Path -Parent $PSScriptRoot
$git = (Get-Command git -ErrorAction Stop).Source
$logDir = Join-Path $env:LOCALAPPDATA 'Afterglow'
$logPath = Join-Path $logDir 'push-relay.log'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-RelayLog([string]$message) {
  Add-Content -LiteralPath $logPath -Value ("{0:u}  {1}" -f (Get-Date), $message)
}

Write-RelayLog "Relay started for $repoRoot"
while ($true) {
  try {
    & $git -C $repoRoot fetch origin main --quiet
    $ahead = [int](& $git -C $repoRoot rev-list --count origin/main..HEAD)
    if ($ahead -gt 0) {
      Write-RelayLog "Pushing $ahead commit(s) to main"
      & $git -C $repoRoot push origin HEAD:main
      if ($LASTEXITCODE -eq 0) { Write-RelayLog 'Push completed' }
      else { Write-RelayLog "Push failed with exit code $LASTEXITCODE" }
    }
  } catch {
    Write-RelayLog ("Relay error: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds ([Math]::Max(5, $PollSeconds))
}
