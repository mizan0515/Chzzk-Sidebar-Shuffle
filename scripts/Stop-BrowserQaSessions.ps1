param(
  [switch] $Apply
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$runStateDir = Join-Path $repoRoot '.runtime\browser-qa'
$chromeQaProfile = Join-Path $runStateDir 'chrome-profile'
$whaleQaProfile = Join-Path $runStateDir 'whale-profile'
$qaMirrorRoot = Join-Path $env:TEMP 'chzzk-sidebar-shuffler-browser-qa'
$extensionRoots = @(
  (Join-Path $repoRoot 'dist\chrome'),
  (Join-Path $repoRoot 'dist\whale'),
  (Join-Path $qaMirrorRoot 'chrome-extension'),
  (Join-Path $qaMirrorRoot 'whale-extension')
)
$ports = @(9222, 9223)

function ConvertTo-JsonLine($Value) {
  $Value | ConvertTo-Json -Depth 8 -Compress
}

function Get-RunStatePids {
  if (-not (Test-Path $runStateDir)) { return @() }
  Get-ChildItem -Path $runStateDir -Filter '*.json' -ErrorAction SilentlyContinue |
    ForEach-Object {
      try {
        $state = Get-Content -Raw -Path $_.FullName | ConvertFrom-Json
        if ($state.startedProcessId) {
          [pscustomobject]@{
            pid = [int]$state.startedProcessId
            source = $_.FullName
            browser = [string]$state.browser
          }
        }
      } catch {
        # Ignore malformed historical state files.
      }
    }
}

function Get-QaBrowserProcesses {
  $runStatePids = @(Get-RunStatePids)
  $runPidSet = @{}
  foreach ($item in $runStatePids) {
    $runPidSet[[int]$item.pid] = $item
  }

  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -ieq 'chrome.exe' -or $_.Name -ieq 'whale.exe' } |
    ForEach-Object {
      $commandLine = [string]$_.CommandLine
      $matchesPort = $false
      foreach ($port in $ports) {
        if ($commandLine -match "--remote-debugging-port=$port(\D|$)") {
          $matchesPort = $true
        }
      }
      $matchesExtension = $false
      foreach ($root in $extensionRoots) {
        if ($commandLine -like "*$root*") {
          $matchesExtension = $true
        }
      }
      $matchesRunState = $runPidSet.ContainsKey([int]$_.ProcessId)
      $matchesQaProfile = $commandLine -like "*$chromeQaProfile*" -or $commandLine -like "*$whaleQaProfile*"
      if ($matchesPort -or $matchesExtension -or $matchesRunState -or $matchesQaProfile) {
        [pscustomobject]@{
          pid = $_.ProcessId
          name = $_.Name
          matchesPort = $matchesPort
          matchesExtension = $matchesExtension
          matchesRunState = $matchesRunState
          matchesQaProfile = $matchesQaProfile
          commandLine = $commandLine
        }
      }
    }
}

$targets = @(Get-QaBrowserProcesses)

if ($Apply) {
  foreach ($target in $targets) {
    try {
      Stop-Process -Id $target.pid -Force
    } catch {
      # The browser may have already exited.
    }
  }
  if (Test-Path $runStateDir) {
    Remove-Item -Path (Join-Path $runStateDir '*.json') -Force -ErrorAction SilentlyContinue
  }
}

ConvertTo-JsonLine ([pscustomobject]@{
  action = if ($Apply) { 'applied' } else { 'dry-run' }
  targetCount = $targets.Count
  targets = $targets | Select-Object pid,name,matchesPort,matchesExtension,matchesRunState,matchesQaProfile
  runStateDir = $runStateDir
  nextAction = if ($targets.Count -gt 0 -and -not $Apply) { 'Run npm run qa:browser-cleanup to close QA browser sessions created for extension testing.' } else { 'No QA browser cleanup needed.' }
})
