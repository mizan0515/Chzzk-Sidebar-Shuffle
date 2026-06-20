param(
  [switch] $Apply,
  [int] $Port = 9222,
  [string] $ExtensionPath,
  [string] $Url = 'https://chzzk.naver.com/following?tab=ALL'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExtensionPath) {
  $ExtensionPath = Join-Path $repoRoot 'dist\chrome'
}

function ConvertTo-JsonLine($Value) {
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Find-ChromeExecutable {
  $running = Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq 'chrome.exe' -and $_.CommandLine -match '^\s*"([^"]+chrome\.exe)"' } |
    Select-Object -First 1

  if ($running -and $running.CommandLine -match '^\s*"([^"]+chrome\.exe)"') {
    return $Matches[1]
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) {
    return $candidates[0]
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
        hasRemoteDebugging = $commandLine -match '--remote-debugging-port='
      }
    }
}

if (-not (Test-Path $ExtensionPath)) {
  throw "Missing Chrome extension folder: $ExtensionPath. Run npm run build:chrome first."
}

$chromeExe = Find-ChromeExecutable
$processes = @(Get-ChromeProcessPlan)
$mainProcessIds = @($processes | Where-Object { -not $_.isCodexIsolatedProfile } | Select-Object -ExpandProperty pid)
$args = @(
  "--remote-debugging-port=$Port",
  "--load-extension=`"$ExtensionPath`"",
  "--disable-extensions-except=`"$ExtensionPath`"",
  $Url
)

$plan = [pscustomobject]@{
  action = if ($Apply) { 'apply' } else { 'dry-run' }
  mainBrowserEvidence = $false
  chromeExecutable = $chromeExe
  extensionPath = $ExtensionPath
  port = $Port
  url = $Url
  mainChromeProcessIdsToClose = $mainProcessIds
  isolatedChromeProcessIdsIgnored = @($processes | Where-Object { $_.isCodexIsolatedProfile } | Select-Object -ExpandProperty pid)
  launchArgs = $args
  warning = 'This restarts the main Chrome browser. Open tabs may be restored by Chrome, but unsaved page state can be lost.'
}

if (-not $Apply) {
  ConvertTo-JsonLine $plan
  exit 0
}

foreach ($processId in $mainProcessIds) {
  try {
    Stop-Process -Id $processId -Force
  } catch {
    # The process may already be gone as Chrome closes its process tree.
  }
}

Start-Sleep -Milliseconds 1500

Start-Process -FilePath $chromeExe -ArgumentList $args | Out-Null
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
  extensionPath = $ExtensionPath
  nextAction = if ($ready) { 'Run npm run qa:main:chrome:popup to verify the real action popup target.' } else { 'Chrome restarted but remote debugging was not reachable.' }
})
