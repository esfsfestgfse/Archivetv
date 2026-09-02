[CmdletBinding()]
param([int]$Port = 8788)
$repo = Split-Path -Parent $PSScriptRoot
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $args = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
  Start-Process powershell.exe -Verb RunAs -ArgumentList $args | Out-Null
  exit 0
}
$existingRule = Get-NetFirewallRule -DisplayName 'RealSignal Cast Bridge' -ErrorAction SilentlyContinue
if (-not $existingRule) {
  New-NetFirewallRule -DisplayName 'RealSignal Cast Bridge' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Private -Enabled True | Out-Null
}
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js was not found on PATH.' }
if (-not $ffmpeg) { throw 'FFmpeg was not found on PATH. Open a new PowerShell window after installing FFmpeg.' }
$env:REALSIGNAL_BRIDGE_PORT = [string]$Port
$env:REALSIGNAL_FFMPEG = $ffmpeg
Write-Host "Starting RealSignal Cast Bridge on port $Port"
Write-Host "Use the printed LAN Bridge URL in RealSignal Settings > Cast Bridge URL."
& $node (Join-Path $repo 'scripts\realsignal-cast-bridge.mjs')
