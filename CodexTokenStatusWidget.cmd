@echo off
setlocal
powershell -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0CodexTokenStatusWidget.ps1"
