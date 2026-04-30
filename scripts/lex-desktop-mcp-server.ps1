$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDir '..')

Set-Location -LiteralPath $projectRoot

if (-not $env:LEX_DESKTOP_BRIDGE_URL) {
    $env:LEX_DESKTOP_BRIDGE_URL = 'http://127.0.0.1:32179'
}

& node '.\scripts\lex-desktop-mcp-server.mjs' @args
exit $LASTEXITCODE
