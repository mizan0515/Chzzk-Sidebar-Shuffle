$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$stopScript = Join-Path $PSScriptRoot 'Stop-BrowserQaSessions.ps1'
$result = & $stopScript | ConvertFrom-Json

if ($result.targetCount -gt 0) {
  Write-Error "QA browser sessions are still running. Run npm run qa:browser-cleanup before final Done/PR_READY. Targets: $($result.targetCount)"
  exit 1
}

Write-Output "Browser QA cleanup guard passed"
