#requires -Version 7.0
#requires -PSEdition Core
param(
    [string]$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # Encoding setup is best-effort for older PowerShell hosts.
}

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path

Push-Location -LiteralPath $resolvedRoot
try {
    npm run validate
    if ($LASTEXITCODE -ne 0) {
        throw "npm run validate failed with exit code $LASTEXITCODE"
    }

    Write-Output 'RESULT: PASS repository validation gate'
} finally {
    Pop-Location
}
