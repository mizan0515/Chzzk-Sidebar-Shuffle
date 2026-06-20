param(
  [switch] $Apply,
  [switch] $UseBrandedChrome,
  [int] $Port = 9222,
  [string] $ExtensionPath,
  [string] $UserDataDir,
  [string] $Url = 'https://chzzk.naver.com/following?tab=ALL'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExtensionPath) {
  $ExtensionPath = Join-Path $repoRoot 'dist\chrome'
}
$runStateDir = Join-Path $repoRoot '.runtime\browser-qa'
$runStatePath = Join-Path $runStateDir 'main-chrome-qa.json'
$qaMirrorRoot = Join-Path $env:TEMP 'chzzk-sidebar-shuffler-browser-qa'
$qaExtensionPath = Join-Path $qaMirrorRoot 'chrome-extension'
if (-not $UserDataDir) {
  $UserDataDir = Join-Path $runStateDir 'chrome-profile'
}

function ConvertTo-JsonLine($Value) {
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Find-ChromeExecutable {
  if (-not $UseBrandedChrome) {
    $playwrightRoot = Join-Path $env:LOCALAPPDATA 'ms-playwright'
    $automationCandidates = @()
    if (Test-Path $playwrightRoot) {
      $automationCandidates = @(Get-ChildItem -Path $playwrightRoot -Recurse -Filter 'chrome.exe' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -like '*chromium-*' } |
        Sort-Object FullName -Descending |
        Select-Object -ExpandProperty FullName)
    }
    if ($automationCandidates.Count -gt 0) {
      return @($automationCandidates)[0]
    }
  }

  $running = Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq 'chrome.exe' -and $_.ExecutablePath -and (Test-Path $_.ExecutablePath) } |
    Select-Object -First 1

  if ($running) {
    return $running.ExecutablePath
  }

  $candidates = @(@(
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) })

  if ($candidates.Count -gt 0) {
    return @($candidates)[0]
  }

  throw 'Google Chrome executable not found.'
}

function Get-ChromeProcessPlan {
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq 'chrome.exe' } |
    ForEach-Object {
      $commandLine = [string]$_.CommandLine
      [pscustomobject]@{
        pid = $_.ProcessId
        isCodexIsolatedProfile = $commandLine -like '*codex-chromium*' -or $commandLine -like '*ms-playwright*'
        isRepoQaProfile = $commandLine -like "*$UserDataDir*"
        hasRemoteDebugging = $commandLine -match '--remote-debugging-port='
      }
    }
}

if (-not (Test-Path $ExtensionPath)) {
  throw "Missing Chrome extension folder: $ExtensionPath. Run npm run build:chrome first."
}

New-Item -ItemType Directory -Force -Path $qaMirrorRoot | Out-Null
Remove-Item -Recurse -Force -Path $qaExtensionPath -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force -Path $ExtensionPath -Destination $qaExtensionPath

$chromeExe = Find-ChromeExecutable
$processes = @(Get-ChromeProcessPlan)
$mainProcessIds = @($processes | Where-Object { $_.isRepoQaProfile -or ($_.hasRemoteDebugging -and -not $_.isCodexIsolatedProfile) } | Select-Object -ExpandProperty pid)
$args = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=`"$UserDataDir`"",
  "--no-first-run",
  "--no-default-browser-check",
  "--load-extension=`"$qaExtensionPath`"",
  "--disable-extensions-except=`"$qaExtensionPath`"",
  $Url
)

$plan = [pscustomobject]@{
  action = if ($Apply) { 'apply' } else { 'dry-run' }
  mainBrowserEvidence = $false
  chromeExecutable = $chromeExe
  browserFlavor = if ($chromeExe -like '*\ms-playwright\chromium-*') { 'automation-chromium' } else { 'branded-chrome' }
  extensionPath = $ExtensionPath
  qaExtensionPath = $qaExtensionPath
  userDataDir = $UserDataDir
  port = $Port
  url = $Url
  qaChromeProcessIdsToClose = $mainProcessIds
  isolatedChromeProcessIdsIgnored = @($processes | Where-Object { $_.isCodexIsolatedProfile } | Select-Object -ExpandProperty pid)
  launchArgs = $args
  warning = 'Branded Chrome 136+ blocks default-profile remote debugging, and branded Chrome 137+ removes command-line unpacked extension loading. Automated extension QA uses Chrome for Testing/Chromium when available; use -UseBrandedChrome only for manual/profile checks.'
}

if (-not $Apply) {
  ConvertTo-JsonLine $plan
  exit 0
}

New-Item -ItemType Directory -Force -Path $runStateDir | Out-Null
New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null

foreach ($processId in $mainProcessIds) {
  try {
    Stop-Process -Id $processId -Force
  } catch {
    # The process may already be gone as Chrome closes its process tree.
  }
}

Start-Sleep -Milliseconds 1500

$started = Start-Process -FilePath $chromeExe -ArgumentList $args -PassThru
Start-Sleep -Seconds 2

$ready = $false
try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 3
  $ready = $response.StatusCode -eq 200
} catch {
  $ready = $false
}

ConvertTo-JsonLine ([pscustomobject]@{
  action = 'applied'
  mainBrowserEvidence = $ready
  port = $Port
  remoteDebuggingReady = $ready
  browserFlavor = if ($chromeExe -like '*\ms-playwright\chromium-*') { 'automation-chromium' } else { 'branded-chrome' }
  extensionPath = $ExtensionPath
  qaExtensionPath = $qaExtensionPath
  startedProcessId = $started.Id
  runStatePath = $runStatePath
  nextAction = if ($ready) { 'Run npm run qa:main:chrome:popup to verify the real action popup target.' } else { 'Chrome restarted but remote debugging was not reachable.' }
})

[pscustomobject]@{
  browser = 'chrome'
  browserFlavor = if ($chromeExe -like '*\ms-playwright\chromium-*') { 'automation-chromium' } else { 'branded-chrome' }
  startedAt = (Get-Date).ToString('o')
  executable = $chromeExe
  extensionPath = $ExtensionPath
  qaExtensionPath = $qaExtensionPath
  userDataDir = $UserDataDir
  port = $Port
  url = $Url
  startedProcessId = $started.Id
  launchArgs = $args
  cleanupCommand = 'npm run qa:browser-cleanup'
} | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $runStatePath
