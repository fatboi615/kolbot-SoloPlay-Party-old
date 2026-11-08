<#
  Bot Viewer - a live picture of every Diablo II window in one grid, so the game windows can sit
  stacked behind it instead of overlapping all over the screen. Click a picture (or press 1-9) to
  bring that game to the front. Read-only: it never touches the bots.

  Start it with "Bot Viewer.bat". Game windows must not be hidden or minimized to show up live
  (they can be behind other windows - use "Tuck game windows behind this one").
#>
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$soloPlay = (Resolve-Path (Join-Path $here '..\..')).Path
$partyDir = Join-Path $soloPlay '.soloplay\party'
try {
  $refs = @('System.Windows.Forms', 'System.Drawing', 'System.Web.Extensions')
  Add-Type -AssemblyName $refs
  if (-not ('BotViewerApp' -as [type])) {
    Add-Type -Path (Join-Path $here 'BotViewer.cs') -ReferencedAssemblies $refs
  }
  [BotViewerApp]::Run($partyDir)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show("Bot Viewer couldn't start:`r`n`r`n$($_.Exception.Message)", 'Bot Viewer')
}
