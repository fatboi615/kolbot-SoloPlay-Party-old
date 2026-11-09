<#
  Collect Logs - zips everything needed to look into a party mode problem, with private details removed.

  Start it with "Collect Logs.bat". The zip lands on your Desktop. Send that zip.

  Works from anywhere: inside the SoloPlay folder (Tools\CollectLogs), in your D2BotNG / D2Bot# folder, or
  on its own (e.g. on your Desktop) - then it asks you to pick your bot folder. Works with D2BotNG and the
  older D2Bot#, with or without party mode installed.
    -Folder "C:\path\to\D2BotNG"   use this bot folder (D2BotNG / D2Bot# folder, its d2bs folder, or kolbot)
    -Days 3                        logs from the last 3 days (default 2)

  What goes in:
    d2bs\logs\d2bs-<profile>-<date>.log      the main bot log of every profile
    d2bs\kolbot\logs\ScriptErrorLog.txt       script crashes
    d2bs\kolbot\logs\chicken-*.log            why a bot left a game on low life
    libs\SoloPlay\.soloplay\party\*.json      live party state (game, stuck, rush files)
    libs\SoloPlay\.soloplay\<profile>\*Performance.csv   levels and scripts over time
    libs\SoloPlay\Settings\PartySettings.js   party setup
    the manager's own logs\*.log
    info.txt                                  versions and profile names / entry scripts (no logins)

  What is taken out of every file before zipping:
    account names and passwords (the manager's profiles and the ones SoloPlay made), CD keys, proxy logins,
    game passwords, your Windows user and computer name, and every IP address (proxies, servers).
  Character names stay in - the logs are useless without them. Look the zip over before posting it publicly.
#>
param([int]$Days = 2, [string]$Folder = '')

$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'Collect Logs'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- find the kolbot folder --------------------------------------------------------------------
function Find-Kolbot([string]$start) {
  if (-not $start -or -not (Test-Path $start)) { return $null }
  $dir = (Resolve-Path $start).Path
  # inside it? (Tools\CollectLogs lives in kolbot\libs\SoloPlay)
  $d = $dir
  for ($i = 0; $i -lt 8 -and $d; $i++) {
    if ((Split-Path -Leaf $d) -ieq 'kolbot' -and (Test-Path (Join-Path $d 'libs'))) { return $d }
    $d = Split-Path -Parent $d
  }
  # below it? D2BotNG\d2bs\kolbot, d2bs\kolbot, or a folder or two deeper - only if there's exactly one
  # (two bot setups next to each other: ask which one instead of guessing)
  $hits = @()
  foreach ($rel in @('kolbot', 'd2bs\kolbot', '*\d2bs\kolbot', '*\*\d2bs\kolbot')) {
    $hits += @(Get-Item -Path (Join-Path $dir $rel) -ErrorAction SilentlyContinue |
      Where-Object { $_.PSIsContainer -and (Test-Path (Join-Path $_.FullName 'libs')) } |
      ForEach-Object { $_.FullName })
  }
  $hits = @($hits | Select-Object -Unique)
  if ($hits.Count -eq 1) { return $hits[0] }
  if ($hits.Count -gt 1) { Write-Host "Found $($hits.Count) bot setups under $dir - pick the one you mean." }
  return $null
}

$kolbot = $null
if ($Folder) { $kolbot = Find-Kolbot $Folder }
if (-not $kolbot) { $kolbot = Find-Kolbot $here }
if (-not $kolbot) {
  Write-Host 'Pick your bot folder (the one with D2BotNG.exe or D2Bot.exe in it) in the window that opened...'
  try {
    Add-Type -AssemblyName System.Windows.Forms
    for ($try = 0; $try -lt 3 -and -not $kolbot; $try++) {
      $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
      $dlg.Description = 'Pick your bot folder - the one with D2BotNG.exe or D2Bot.exe (or its d2bs\kolbot folder)'
      $dlg.ShowNewFolderButton = $false
      if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { break }
      $kolbot = Find-Kolbot $dlg.SelectedPath
      if (-not $kolbot) { Write-Host "No d2bs\kolbot folder in $($dlg.SelectedPath) - pick the folder with D2BotNG.exe / D2Bot.exe." }
    }
  } catch {
    Write-Host "Couldn't open the folder picker: $($_.Exception.Message)"
  }
}
if (-not $kolbot) {
  Write-Host ''
  Write-Host "Couldn't find your kolbot folder. Put Collect Logs in your D2BotNG / D2Bot# folder and run it again,"
  Write-Host 'or run:  powershell -ExecutionPolicy Bypass -File CollectLogs.ps1 -Folder "C:\path\to\your\bot\folder"'
  exit 1
}

$d2bs = Split-Path -Parent $kolbot                       # ...\d2bs
$root = Split-Path -Parent $d2bs                         # the manager's folder (D2BotNG / D2Bot#)
$soloplay = Join-Path $kolbot 'libs\SoloPlay'
$dataDirs = New-Object System.Collections.Generic.List[string]
foreach ($dd in @((Join-Path $root 'data\ng'), (Join-Path $root 'data'))) { if (Test-Path $dd) { $dataDirs.Add($dd) } }
try {
  # D2BotNG can keep its data somewhere else (Settings > Data Folder)
  $cfg = Get-Content -Raw -Path (Join-Path $root 'd2botng.json') -ErrorAction Stop | ConvertFrom-Json
  if ($cfg.basePath) {
    foreach ($dd in @((Join-Path $cfg.basePath 'data\ng'), (Join-Path $cfg.basePath 'data'))) {
      if ((Test-Path $dd) -and -not $dataDirs.Contains($dd)) { $dataDirs.Add($dd) }
    }
  }
} catch { }

Write-Host "Bot folder: $root"
Write-Host "kolbot:     $kolbot"
if (-not (Test-Path $soloplay)) { Write-Host '(no libs\SoloPlay folder - collecting the kolbot logs only)' }
$since = (Get-Date).AddDays(-$Days)

# ---- what must never leave this PC -----------------------------------------------------------
$secrets = @{}   # lower-case text -> label
function Add-Secret([string]$text, [string]$label) {
  if ([string]::IsNullOrWhiteSpace($text)) { return }
  $t = $text.Trim()
  if ($t.Length -lt 3) { return }
  $secrets[$t.ToLowerInvariant()] = $label
}

function Read-Json([string]$path) {
  try { return Get-Content -Raw -Path $path -ErrorAction Stop | ConvertFrom-Json } catch { return $null }
}

# Any "account" / "password" / CD key field in the manager's data files - D2BotNG's (data\ng\*.json) and
# D2Bot#'s (data\profile.json, cdkeys.json ... one JSON object per line), whatever the exact field names.
$fieldRx = New-Object System.Text.RegularExpressions.Regex -ArgumentList '"(account|accountname|acc|password|pass|passwd|gamepass|gamepassword|classic|classickey|expansion|expansionkey|lodkey|cdkey|username)"\s*:\s*"([^"]*)"', ([System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
$proxyRx = New-Object System.Text.RegularExpressions.Regex -ArgumentList '[a-z0-9]+://([^:@/"\s]+):([^@/"\s]+)@', ([System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
foreach ($dd in $dataDirs) {
  Get-ChildItem -Path $dd -Filter '*.json' -File -ErrorAction SilentlyContinue | ForEach-Object {
    try { $raw = [System.IO.File]::ReadAllText($_.FullName) } catch { return }
    foreach ($m in $fieldRx.Matches($raw)) {
      $name = $m.Groups[1].Value.ToLowerInvariant()
      $label = '[password]'
      if ($name -match 'classic|expansion|lod|cdkey') { $label = '[cdkey]' }
      elseif ($name -match 'acc|username') { $label = '[account]' }
      $value = $m.Groups[2].Value
      try { $value = [regex]::Unescape($value) } catch { }
      # never blank out ordinary words or short numbers
      if ($value -match '^(true|false|null|none|yes|no|default)$' -or $value -match '^\d{1,5}$') { continue }
      Add-Secret $value $label
    }
    foreach ($m in $proxyRx.Matches($raw)) {
      Add-Secret $m.Groups[1].Value '[proxy]'
      Add-Secret $m.Groups[2].Value '[proxy]'
    }
  }
}
# accounts SoloPlay made itself
if (Test-Path (Join-Path $soloplay '.soloplay')) {
  Get-ChildItem -Path (Join-Path $soloplay '.soloplay') -Filter '*-LoginData.json' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    $ld = Read-Json $_.FullName
    if ($ld) { Add-Secret $ld.account '[account]'; Add-Secret $ld.pass '[password]' }
  }
  # game passwords in the party files
  Get-ChildItem -Path (Join-Path $soloplay '.soloplay\party') -Filter '*.oog.json' -ErrorAction SilentlyContinue | ForEach-Object {
    $o = Read-Json $_.FullName
    if ($o) { Add-Secret $o.pass '[gamepass]' }
  }
}
Add-Secret $env:USERNAME '[user]'
Add-Secret $env:COMPUTERNAME '[pc]'

# one regex for all of them, longest first so a password containing an account name goes as a whole
$pattern = $null
if ($secrets.Count) {
  $alts = $secrets.Keys | Sort-Object { $_.Length } -Descending | ForEach-Object { [regex]::Escape($_) }
  $pattern = New-Object System.Text.RegularExpressions.Regex -ArgumentList ('(' + ($alts -join '|') + ')'), ([System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
}
$evaluator = [System.Text.RegularExpressions.MatchEvaluator] { param($m) $secrets[$m.Value.ToLowerInvariant()] }
# any IPv4 address (proxies, realm servers) -> [ip]
$ipPattern = New-Object System.Text.RegularExpressions.Regex -ArgumentList '(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])'

Write-Host "Removing $($secrets.Count) private values (accounts, passwords, CD keys, user name) and every IP address."

# ---- copy + clean ------------------------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$work = Join-Path $env:TEMP "PartyMode-Logs-$stamp"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Path $work | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding $false
$count = 0

function Add-File([System.IO.FileInfo]$file, [string]$sub) {
  $destDir = Join-Path $work $sub
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  $dest = Join-Path $destDir $file.Name
  try {
    # read while the bots are still writing to it
    $fs = [System.IO.File]::Open($file.FullName, 'Open', 'Read', 'ReadWrite')
    $reader = New-Object System.IO.StreamReader($fs, $utf8)
    $text = $reader.ReadToEnd()
    $reader.Close()
    if ($pattern) { $text = $pattern.Replace($text, $evaluator) }
    $text = $ipPattern.Replace($text, '[ip]')
    [System.IO.File]::WriteAllText($dest, $text, $utf8)
    $script:count++
  } catch {
    Write-Host "  couldn't copy $($file.Name): $($_.Exception.Message)"
  }
}

function Add-Files([string]$dir, [string]$filter, [string]$sub, [switch]$Recent, [switch]$Recurse) {
  if (-not (Test-Path $dir)) { return }
  $files = Get-ChildItem -Path $dir -Filter $filter -File -Recurse:$Recurse -ErrorAction SilentlyContinue
  if ($Recent) { $files = $files | Where-Object { $_.LastWriteTime -ge $since } }
  foreach ($f in $files) {
    $s = $sub
    if ($Recurse) { $s = Join-Path $sub (Split-Path -Leaf $f.DirectoryName) }
    Add-File $f $s
  }
}

Add-Files (Join-Path $d2bs 'logs') '*.log' 'd2bs-logs' -Recent
Add-Files (Join-Path $kolbot 'logs') 'ScriptErrorLog.txt' 'kolbot-logs'
Add-Files (Join-Path $kolbot 'logs') 'chicken-*.log' 'kolbot-logs' -Recent
Add-Files (Join-Path $soloplay '.soloplay\party') '*.json' 'party-state'
Add-Files (Join-Path $soloplay '.soloplay') '*Performance.csv' 'performance' -Recurse
Add-Files (Join-Path $soloplay 'Settings') 'PartySettings.js' 'settings'
Add-Files (Join-Path $root 'logs') '*.log' 'manager-logs' -Recent

# ---- info.txt: versions and profile setup, no logins ----------------------------------------
$info = New-Object System.Collections.Generic.List[string]
$info.Add("Collected: $(Get-Date -Format 'yyyy-MM-dd HH:mm') (last $Days days)")
$info.Add("Windows: $([System.Environment]::OSVersion.VersionString)")
foreach ($exeName in @('D2BotNG.exe', 'D2Bot.exe')) {
  $exe = Join-Path $root $exeName
  if (Test-Path $exe) { $info.Add("${exeName}: $((Get-Item $exe).VersionInfo.ProductVersion)") }
}
$info.Add("SoloPlay installed: $(Test-Path $soloplay) | party mode: $(Test-Path (Join-Path $soloplay 'Modules\Party.js'))")
foreach ($f in @('Modules\Party.js', 'Core\PatherOverrides.js', 'SoloPlay.js')) {
  $fp = Join-Path $soloplay $f
  if (Test-Path $fp) { $info.Add("$f md5: $((Get-FileHash -Algorithm MD5 -Path $fp).Hash.Substring(0, 8).ToLower())") }
}
# profile names and entry scripts (D2BotNG data\ng\profiles.json or D2Bot# data\profile.json) - no logins
$nameRx = New-Object System.Text.RegularExpressions.Regex -ArgumentList '"(name|entryscript|entry|realm|difficulty|group)"\s*:\s*"([^"]*)"', ([System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
foreach ($dd in $dataDirs) {
  foreach ($pf in @('profiles.json', 'profile.json')) {
    $pp = Join-Path $dd $pf
    if (-not (Test-Path $pp)) { continue }
    $info.Add('')
    $info.Add("Profiles from ${pf}:")
    $raw = [System.IO.File]::ReadAllText($pp)
    $line = @()
    foreach ($m in $nameRx.Matches($raw)) {
      if ($m.Groups[1].Value -ieq 'name' -and $line.Count) { $info.Add('  ' + ($line -join ' | ')); $line = @() }
      $line += "$($m.Groups[1].Value)=$($m.Groups[2].Value)"
    }
    if ($line.Count) { $info.Add('  ' + ($line -join ' | ')) }
  }
}
$infoText = $info -join "`r`n"
if ($pattern) { $infoText = $pattern.Replace($infoText, $evaluator) }
[System.IO.File]::WriteAllText((Join-Path $work 'info.txt'), $infoText, $utf8)

# ---- zip it to the Desktop ---------------------------------------------------------------------
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop -or -not (Test-Path $desktop)) { $desktop = $root }
$zip = Join-Path $desktop "PartyMode-Logs-$stamp.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $work '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -Recurse -Force $work

$size = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ''
Write-Host "Done: $count files -> $zip ($size MB)"
Write-Host 'Send that zip. Accounts, passwords, CD keys and proxies were taken out.'
Write-Host 'Character names are still in it - have a look before posting it somewhere public.'
try { Start-Process explorer.exe "/select,`"$zip`"" } catch { }
