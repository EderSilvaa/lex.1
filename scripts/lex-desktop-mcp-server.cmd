@echo off
setlocal

cd /d "%~dp0.."

if "%LEX_DESKTOP_BRIDGE_URL%"=="" (
  set "LEX_DESKTOP_BRIDGE_URL=http://127.0.0.1:32179"
)

node ".\scripts\lex-desktop-mcp-server.mjs" %*
exit /b %ERRORLEVEL%
