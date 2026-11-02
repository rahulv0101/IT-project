@echo off
setlocal EnableExtensions EnableDelayedExpansion
for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "LOG=%ROOT%\docs\eduquest-launch.log"
set "RUNLOG=%ROOT%\docs\eduquest-launch-%RANDOM%-%RANDOM%.tmp.log"
if not exist "%ROOT%\" (
  echo FAILED: project folder does not exist: %ROOT%
  pause
  exit /b 1
)
if /I "%~1"=="--dry-run" (
  echo STEP: dry run
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1" -DryRun > "!RUNLOG!" 2>&1
  set "RC=!ERRORLEVEL!"
  type "!RUNLOG!"
  copy /Y "!RUNLOG!" "%LOG%" >nul 2>&1
  if errorlevel 1 echo WARNING: The main log is in use. This run is saved at !RUNLOG!.
  if not "!RC!"=="0" echo FAILED: dry run failed.
  pause
  exit /b !RC!
)
echo Command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1"
call powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\Start-EduQuest.ps1" > "%RUNLOG%" 2>&1
set "RC=%ERRORLEVEL%"
type "%RUNLOG%"
copy /Y "%RUNLOG%" "%LOG%" >nul 2>&1
if errorlevel 1 (
  echo WARNING: The main log is in use. This run is saved at %RUNLOG%.
) else (
  del /Q "%RUNLOG%" >nul 2>&1
)
if not "%RC%"=="0" echo FAILED: EduQuest launcher failed.
pause
exit /b %RC%
