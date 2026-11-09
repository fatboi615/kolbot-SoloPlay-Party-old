<#
  Collect Logs - zips everything needed to look into a party mode problem, with private details removed.

  Start it with "Collect Logs.bat". The zip lands on your Desktop. Send that zip.

  What goes in (last 2 days by default, change with -Days 3):
    d2bs\logs\d2bs-<profile>-<date>.log      the main bot log of every profile
    d2bs\kolbot\logs\ScriptErrorLog.txt       script crashes
    d2bs\kolbot\logs\chicken-*.log            why a bot left a game on low life
    libs\SoloPlay\.soloplay\party\*.json      live party state (game, stuck, rush files)
    libs\SoloPlay\.soloplay\<profile>\*Performance.csv   levels and scripts over time
    libs\SoloPlay\Settings\PartySettings.js   your party setup
    D2BotNG logs\d2bot-*.log                  the manager's own log
    info.txt                                  versions and your profiles (names, scripts - no logins)

  What is taken out of every file before zipping:
    account names and passwords (D2BotNG profiles and the ones SoloPlay made), CD keys, proxy logins,
    game passwords, your Windows user and computer name, and every IP address (proxies, servers).
  Character names stay in - the logs are useless without them. Look the zip over before posting it publicly.
#>
param([int]$Days = 2)

$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'Collect Logs'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# ---- find the folders ----------------------------------------------------------------------
$soloplay = (Resolve-Path (Join-Path $here '..\..')).Path   # ...\libs\SoloPlay
$kolbot = (Resolve-Path (Join-Path $soloplay '..\..')).Path # ...\d2bs\kolbot
$d2bs = Split-Path -Parent $kolbot                          # ...\d2bs
$root = Split-Path -Parent $d2bs                            # the D2BotNG folder
$dataDir = Join-Path $root 'data\ng'
try {
  $cfg = Get-Content -Raw -Path (Join-Path $root 'd2botng.json') -ErrorAction Stop | ConvertFrom-Json
  if ($cfg.basePath -and (Test-Path (Join-Path $cfg.basePath 'data\ng'))) { $dataDir = Join-Path $cfg.basePath 'data\ng' }
} catch { }

Write-Host "D2BotNG folder: $root"
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

$profilesJson = Read-Json (Join-Path $dataDir 'profiles.json')
if ($profilesJson -and $profilesJson.profiles) {
  foreach ($p in $profilesJson.profiles) {
    Add-Secret $p.account '[account]'
    Add-Secret $p.password '[password]'
  }
}
$keysJson = Read-Json (Join-Path $dataDir 'keylists.json')
if ($keysJson -and $keysJson.keyLists) {
  foreach ($kl in $keysJson.keyLists) {
    foreach ($k in @($kl.keys)) {
      Add-Secret $k.classic '[cdkey]'
      Add-Secret $k.expansion '[cdkey]'
    }
  }
}
# proxies ("scheme://user:pass@host:port"): a login, if there is one - the addresses themselves are caught by the
# IP address rule below (a list of a thousand proxies as one pattern would take forever)
$proxiesJson = Read-Json (Join-Path $dataDir 'proxies.json')
if ($proxiesJson -and $proxiesJson.proxies) {
  foreach ($px in $proxiesJson.proxies) {
    foreach ($prop in $px.PSObject.Properties) {
      $v = [string]$prop.Value
      if ($v -match '^(?:[a-z0-9]+://)?([^@/]+)@') {
        foreach ($part in ($Matches[1] -split ':')) { Add-Secret $part '[proxy]' }
      }
    }
  }
}
# accounts SoloPlay made itself
Get-ChildItem -Path (Join-Path $soloplay '.soloplay') -Filter '*-LoginData.json' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
  $ld = Read-Json $_.FullName
  if ($ld) { Add-Secret $ld.account '[account]'; Add-Secret $ld.pass '[password]' }
}
# game passwords in the party files
Get-ChildItem -Path (Join-Path $soloplay '.soloplay\party') -Filter '*.oog.json' -ErrorAction SilentlyContinue | ForEach-Object {
  $o = Read-Json $_.FullName
  if ($o) { Add-Secret $o.pass '[gamepass]' }
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

Add-Files (Join-Path $d2bs 'logs') 'd2bs-*.log' 'd2bs-logs' -Recent
Add-Files (Join-Path $kolbot 'logs') 'ScriptErrorLog.txt' 'kolbot-logs'
Add-Files (Join-Path $kolbot 'logs') 'chicken-*.log' 'kolbot-logs' -Recent
Add-Files (Join-Path $soloplay '.soloplay\party') '*.json' 'party-state'
Add-Files (Join-Path $soloplay '.soloplay') '*Performance.csv' 'performance' -Recurse
Add-Files (Join-Path $soloplay 'Settings') 'PartySettings.js' 'settings'
Add-Files (Join-Path $root 'logs') 'd2bot-*.log' 'd2botng-logs' -Recent

# ---- info.txt: versions and profile setup, no logins ----------------------------------------
$info = New-Object System.Collections.Generic.List[string]
$info.Add("Collected: $(Get-Date -Format 'yyyy-MM-dd HH:mm') (last $Days days)")
$info.Add("Windows: $([System.Environment]::OSVersion.VersionString)")
foreach ($f in @('Modules\Party.js', 'Core\PatherOverrides.js', 'SoloPlay.js')) {
  $fp = Join-Path $soloplay $f
  if (Test-Path $fp) { $info.Add("$f md5: $((Get-FileHash -Algorithm MD5 -Path $fp).Hash.Substring(0, 8).ToLower())") }
}
$exe = Join-Path $root 'D2BotNG.exe'
if (Test-Path $exe) { $info.Add("D2BotNG.exe: $((Get-Item $exe).VersionInfo.ProductVersion)") }
if ($profilesJson -and $profilesJson.profiles) {
  $info.Add('')
  $info.Add('Profiles (name | entry script | realm | difficulty | group):')
  foreach ($p in $profilesJson.profiles) {
    $info.Add("  $($p.name) | $($p.entryScript) | $($p.realm) | $($p.difficulty) | $($p.group)")
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
