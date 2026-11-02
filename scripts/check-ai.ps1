param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) { Write-Error "Project folder does not exist: $ProjectRoot"; exit 1 }
Set-Location -LiteralPath $ProjectRoot
if ($DryRun) {
  Write-Host "DRY RUN: project root = $ProjectRoot"
  Write-Host "Would run: python ai-service/tools/live_check.py --prepare"
  Write-Host "Would run: python ai-service/tools/live_check.py"
  exit 0
}
$python = $null
$pythonArgs = @()
if (where.exe py 2>$null) { $python = 'py'; $pythonArgs = @('-3') }
elseif (where.exe python 2>$null) { $python = 'python' }
else { Write-Error 'Python not found. Install it from https://www.python.org/downloads/windows/'; exit 1 }
Write-Host "Python command: $python $($pythonArgs -join ' ')"
$prepared = & $python @pythonArgs ai-service/tools/live_check.py --prepare 2>&1
if ($LASTEXITCODE -ne 0) { $prepared | Write-Host; Write-Error 'AI_MODEL is empty or invalid in .env.'; exit 1 }
$prepared | Write-Host
$model = ($prepared | Where-Object { $_ -match '^model=' } | Select-Object -First 1) -replace '^model=', ''
if ([string]::IsNullOrWhiteSpace($model)) { Write-Error 'AI_MODEL is empty in .env.'; exit 1 }
Write-Host 'Command: python ai-service/tools/live_check.py'
& $python @pythonArgs ai-service/tools/live_check.py
exit $LASTEXITCODE
