@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"
if /I "%~1"=="--dry-run" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\check-ai.ps1" -DryRun
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\scripts\check-ai.ps1"
)
set "RC=%ERRORLEVEL%"
pause
exit /b %RC%
