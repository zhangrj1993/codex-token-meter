@echo off
setlocal
set "PLUGIN_DIR=%~dp0"
set "REPORT=%USERPROFILE%\Desktop\CodexTokenDashboard.html"
cd /d "%PLUGIN_DIR%"
node .\scripts\token-meter.mjs --cost --top 20 --html "%REPORT%"
start "" "%REPORT%"
