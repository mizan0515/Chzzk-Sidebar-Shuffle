param(
  [switch] $Apply,
  [int] $Port = 9223,
  [string] $ExtensionPath,
  [string] $Url = 'https://chzzk.naver.com/following?tab=ALL'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExtensionPath) {
  $ExtensionPath = Join-Path $repoRoot 'dist\whale'
}
$runStateDir = Join-Path $repoRoot '.runtime\browser-qa'
$runStatePath = Join-Path $runStateDir 'main-whale-qa.json'
$qaMirrorRoot = Join-Path $env:TEMP 'chzzk-sidebar-shuffler-browser-qa'
$qaExtensionPath = Join-Path $qaMirrorRoot 'whale-extension'

function ConvertTo-JsonLine($Value) {
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Find-WhaleExecutable {
  $running = Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq 'whale.exe' -and $_.ExecutablePath -and (Test-Path $_.ExecutablePath) } |
    Select-Object -First 1

  if ($running) {
    return $running.ExecutablePath
  }

  $candidates = @(@(
    (Join-Path $env:LOCALAPPDATA 'Naver\Naver Whale\Application\whale.exe'),
    (Join-Path $env:ProgramFiles 'Naver\Naver Whale\Application\whale.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Naver\Naver Whale\Application\whale.exe')
  ) | Where-Object { $_ -and (Test-Path $_) })

  if ($candidates.Count -gt 0) {
    return @($candidates)[0]
  }

  throw 'NAVER Whale executable not found.'
}

function Get-WhaleProcessPlan {
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq 'whale.exe' } |
    ForEach-Object {
      $commandLine = [string]$_.CommandLine
      [pscustomobject]@{
        pid = $_.ProcessId
        isCodexIsolatedProfile = $commandLine -like '*codex-whale-profile*' -or $commandLine -like '*codex-whale-chzzk-sidebar*'
        hasRemoteDebugging = $commandLine -match '--remote-debugging-port='
        title = ''
      }
    }
}

if (-not (Test-Path $ExtensionPath)) {
  throw "Missing Whale extension folder: $ExtensionPath. Run npm run build:whale first."
}

New-Item -ItemType Directory -Force -Path $qaMirrorRoot | Out-Null
Remove-Item -Recurse -Force -Path $qaExtensionPath -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force -Path $ExtensionPath -Destination $qaExtensionPath

$whaleExe = Find-WhaleExecutable
$processes = @(Get-WhaleProcessPlan)
$mainProcessIds = @($processes | Where-Object { -not $_.isCodexIsolatedProfile } | Select-Object -ExpandProperty pid)
$args = @(
  "--remote-debugging-port=$Port",
  "--load-extension=`"$qaExtensionPath`"",
  $Url
)

$plan = [pscustomobject]@{
  action = if ($Apply) { 'apply' } else { 'dry-run' }
  mainBrowserEvidence = $false
  whaleExecutable = $whaleExe
  extensionPath = $ExtensionPath
  qaExtensionPath = $qaExtensionPath
  port = $Port
  url = $Url
  mainWhaleProcessIdsToClose = $mainProcessIds
  isolatedWhaleProcessIdsIgnored = @($processes | Where-Object { $_.isCodexIsolatedProfile } | Select-Object -ExpandProperty pid)
  launchArgs = $args
  warning = 'This restarts the main Whale browser. Open tabs may be restored by Whale, but unsaved page state can be lost.'
}

if (-not $Apply) {
  ConvertTo-JsonLine $plan
  exit 0
}

foreach ($processId in $mainProcessIds) {
  try {
    Stop-Process -Id $processId -Force
  } catch {
    # The process may already be gone as Whale closes its process tree.
  }
}

Start-Sleep -Milliseconds 1500

$started = Start-Process -FilePath $whaleExe -ArgumentList $args -PassThru
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
  qaExtensionPath = $qaExtensionPath
  startedProcessId = $started.Id
  runStatePath = $runStatePath
  nextAction = if ($ready) { 'Run npm run qa:main:readiness, then use @whale to inspect the existing main Whale session.' } else { 'Whale restarted but remote debugging was not reachable.' }
})

New-Item -ItemType Directory -Force -Path $runStateDir | Out-Null
[pscustomobject]@{
  browser = 'whale'
  startedAt = (Get-Date).ToString('o')
  executable = $whaleExe
  extensionPath = $ExtensionPath
  qaExtensionPath = $qaExtensionPath
  port = $Port
  url = $Url
  startedProcessId = $started.Id
  launchArgs = $args
  cleanupCommand = 'npm run qa:browser-cleanup'
} | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $runStatePath
