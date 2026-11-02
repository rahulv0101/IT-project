@echo off
setlocal EnableExtensions
set "ROOT=C:\Users\User\Desktop\IT project build"
if not exist "%ROOT%\" (
  echo FAILED: project folder does not exist: %ROOT%
  pause
  exit /b 1
)
if /I "%~1"=="--dry-run" goto dryrun
echo Command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1" -NoPause
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo FAILED: EduQuest launcher failed.
pause
exit /b %RC%

:dryrun
echo STEP: dry run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1" -DryRun -NoPause
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo FAILED: dry run failed.
pause
exit /b %RC%
