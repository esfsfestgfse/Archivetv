[CmdletBinding()]
param([int]$Port = 8788)
$repo = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js was not found on PATH.' }
if (-not $ffmpeg) { throw 'FFmpeg was not found on PATH. Open a new PowerShell window after installing FFmpeg.' }
$env:REALSIGNAL_BRIDGE_PORT = [string]$Port
$env:REALSIGNAL_FFMPEG = $ffmpeg
Write-Host "Starting RealSignal Cast Bridge on port $Port"
Write-Host "Use the printed LAN Bridge URL in RealSignal Settings > Cast Bridge URL."
& $node (Join-Path $repo 'scripts\realsignal-cast-bridge.mjs')
