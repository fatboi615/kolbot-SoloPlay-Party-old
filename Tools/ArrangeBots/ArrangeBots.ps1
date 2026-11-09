<#
  Arrange Bots - lines every Diablo II window up in a grid that fits your screen and keeps it that way
  while bots restart. Hidden or minimized game windows are shown so you can see them.

  It can also switch Diablo II to 640x480 (smaller windows - 3 fit across a 1920 wide screen).
  Diablo II keeps that setting in the registry and every bot shares it; it takes effect the next
  time each game starts. The old value is saved to ArrangeBots-resolution-backup.txt.

  Start it with "Arrange Bots.bat". Close the "Arrange Bots" window to stop it.
    -Resolution 640   switch the games to 640x480 (default in the .bat)
    -Resolution 800   switch them back to 800x600
    -Once             arrange once and exit
#>
param(
  [ValidateSet('', '640', '800')][string]$Resolution = '',
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Host.UI.RawUI.WindowTitle = 'Arrange Bots'

Add-Type -Path (Join-Path $here 'ArrangeBots.cs')
[BotArranger]::Init()

# ---- resolution ---------------------------------------------------------------------------
# Lord of Destruction's default is 800x600 (Resolution = 1); 640x480 is 0.
$regPath = 'HKCU:\Software\Blizzard Entertainment\Diablo II'
function Get-D2Resolution {
  try { return (Get-ItemProperty -Path $regPath -Name 'Resolution' -ErrorAction Stop).Resolution } catch { return $null }
}
if ($Resolution) {
  $want = if ($Resolution -eq '640') { 0 } else { 1 }
  $now = Get-D2Resolution
  if ($null -eq $now) {
    Write-Host "Diablo II has no saved resolution yet - set it once in game: Options > Video Options > Resolution."
  } elseif ($now -eq $want) {
    Write-Host "Diablo II is already set to ${Resolution}x$(if ($Resolution -eq '640') { 480 } else { 600 })."
  } elseif ($now -ne 0 -and $now -ne 1) {
    Write-Host "Diablo II's resolution value is '$now', which this tool doesn't know - leaving it alone."
    Write-Host "Set it in game instead: Options > Video Options > Resolution."
  } else {
    $backup = Join-Path $here 'ArrangeBots-resolution-backup.txt'
    if (-not (Test-Path $backup)) { "Resolution=$now (saved $(Get-Date))" | Set-Content -Path $backup }
    Set-ItemProperty -Path $regPath -Name 'Resolution' -Value $want -Type DWord
    Write-Host "Diablo II set to ${Resolution}x$(if ($Resolution -eq '640') { 480 } else { 600 }) - each game picks it up the next time it starts (restart the bots)."
  }
}

# ---- arrange ------------------------------------------------------------------------------
function Invoke-Arrange {
  $lines = [BotArranger]::Arrange($true)
  if ($lines.Count -eq 0) {
    Write-Host "$(Get-Date -Format HH:mm:ss)  No Diablo II windows yet."
    return
  }
  Write-Host "$(Get-Date -Format HH:mm:ss)  Arranged $($lines.Count) game window(s):"
  foreach ($l in $lines) { Write-Host "    $l" }
  if ($Resolution -eq '640' -and ($lines | Where-Object { $_ -match ' 800x600 ' })) {
    Write-Host "    Some games are still 800x600 - they switch to 640x480 when they restart."
    Write-Host "    If they stay 800x600 after a restart, set it in game: Options > Video Options > Resolution."
  }
}

Invoke-Arrange
if ($Once) { exit 0 }

Write-Host ''
Write-Host 'Keeping the windows lined up - when a bot restarts its window snaps back into place.'
Write-Host 'Close this window to stop.'
$last = [BotArranger]::Signature()
while ($true) {
  Start-Sleep -Seconds 3
  $sig = [BotArranger]::Signature()
  if ($sig -ne $last) {
    Start-Sleep -Seconds 2 # let a new game window finish opening
    Invoke-Arrange
    $last = [BotArranger]::Signature()
  }
}
