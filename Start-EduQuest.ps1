param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$LogPath = Join-Path $ProjectRoot 'docs\eduquest-launch.log'
$RuntimeLogDirectory = Join-Path $ProjectRoot 'docs\runtime-logs'

function Say($message) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $message" }
function Step($name, [scriptblock]$action) {
  Say "STEP: $name"
  try { & $action; if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Exit code $LASTEXITCODE" } }
  catch { throw "${name}: $($_.Exception.Message)" }
}

try {
  if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    throw "EduQuest project folder does not exist: $ProjectRoot"
  }
  Step 'Set working directory' { Set-Location -LiteralPath $ProjectRoot; Say "Working directory: $((Get-Location).Path)" }

  if ($DryRun) {
    Say "DRY RUN: project root = $ProjectRoot"
    Say 'Would run: npm run db:start'
    Say 'Would run: npm run db:migrate'
    Say 'Would run: npm run seed'
    Say 'Would start: study session reminders worker'
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-backend.ps1`""
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-ai-service.ps1`""
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-worker.ps1`""
    Say "Would start: powershell -NoProfile -ExecutionPolicy Bypass -File `"$ProjectRoot\scripts\run-frontend.ps1`""
    exit 0
  }

  Step 'Check required runtimes' {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
      $nodeInstall = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*\node-v*-win-x64\node.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($nodeInstall) { $env:Path = "$($nodeInstall.DirectoryName);$env:Path" }
    }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js is missing. Install the Node.js LTS Windows version, then click Run EduQuest.bat again.' }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm is missing from PATH. Repair the Node.js LTS installation and click Run EduQuest.bat again.' }
    if (-not (Get-Command py.exe -ErrorAction SilentlyContinue) -and -not (Get-Command python.exe -ErrorAction SilentlyContinue)) { throw 'Python 3 is missing. Install Python 3, then click Run EduQuest.bat again.' }
  }

function Stop-ProjectProcess($port) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and $process.CommandLine.Replace('/', '\').ToLower().Contains($PSScriptRoot.ToLower())) {
      Write-Host "Stopping old EduQuest process on port $port"
      Stop-Process -Id $connection.OwningProcess -Force
    }
  }
}

function Stop-ProcessTree([int]$processId) {
  $processes = Get-CimInstance Win32_Process
  $children = @($processes | Where-Object { $_.ParentProcessId -eq $processId })
  foreach ($child in $children) { Stop-ProcessTree $child.ProcessId }
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

function Stop-PreviousProjectLaunchers {
  $normalRoot = $ProjectRoot.Replace('/', '\').ToLowerInvariant()
  $knownScripts = @('run-backend.ps1', 'run-ai-service.ps1', 'run-worker.ps1', 'run-frontend.ps1', 'run-session-reminders.ps1')
  $launchers = Get-CimInstance Win32_Process | Where-Object {
    $command = if ($_.CommandLine) { $_.CommandLine.Replace('/', '\').ToLowerInvariant() } else { '' }
    $_.Name -eq 'powershell.exe' -and $command.Contains($normalRoot) -and ($knownScripts | Where-Object { $command.Contains($_) })
  }
  foreach ($launcher in $launchers) {
    Say "Stopping previous EduQuest $($launcher.ProcessId)"
    Stop-ProcessTree $launcher.ProcessId
  }
}

function Wait-Health($url, $headers = @{}) {
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  throw "Health check failed: $url"
}

function Start-ProjectScript([string]$name, [string]$relativePath, [switch]$Hidden) {
  $scriptPath = Join-Path $ProjectRoot $relativePath
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "$name script does not exist: $scriptPath"
  }
  $quotedScriptPath = '"' + $scriptPath + '"'
  New-Item -ItemType Directory -Path $RuntimeLogDirectory -Force | Out-Null
  $logStem = [IO.Path]::GetFileNameWithoutExtension($relativePath)
  $standardOutput = Join-Path $RuntimeLogDirectory "$logStem.out.log"
  $standardError = Join-Path $RuntimeLogDirectory "$logStem.err.log"
  Say "Command: powershell.exe -NoProfile -ExecutionPolicy Bypass -File $quotedScriptPath"
  $startArguments = @{
    FilePath = 'powershell.exe'
    ArgumentList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedScriptPath)
    WorkingDirectory = $ProjectRoot
    RedirectStandardOutput = $standardOutput
    RedirectStandardError = $standardError
  }
  if ($Hidden) { $startArguments.WindowStyle = 'Hidden' }
  Start-Process @startArguments
}

  Step 'Install dependencies if needed' { if (-not (Test-Path 'node_modules')) { npm install } }
  Step 'Install AI service dependencies if needed' {
    if (Get-Command py.exe -ErrorAction SilentlyContinue) { $pythonCommand = 'py'; $pythonVersionArgs = @('-3') }
    else { $pythonCommand = 'python'; $pythonVersionArgs = @() }
    & $pythonCommand @pythonVersionArgs -c "import anthropic, fastapi, openai, uvicorn"
    if ($LASTEXITCODE -ne 0) { & $pythonCommand @pythonVersionArgs -m pip install -r 'ai-service\requirements.txt' }
  }
  Step 'Stop old project processes' {
    Stop-PreviousProjectLaunchers
    foreach ($port in @(4000, 5173, 8000)) { Stop-ProjectProcess $port }
  }

  Step 'Start database' { npm run db:start }
  Step 'Set up service token' { npm run setup:token }
  Step 'Start local Ollama when configured' {
    $envLines = Get-Content .env
    $providerLine = $envLines | Where-Object { $_ -match '^AI_PROVIDER=' } | Select-Object -First 1
    $baseLine = $envLines | Where-Object { $_ -match '^AI_BASE_URL=' } | Select-Object -First 1
    if ($providerLine -and $providerLine -match '=\s*openai_compatible\s*$' -and $baseLine -and $baseLine -match '=\s*http://(127\.0\.0\.1|localhost):11434') {
      $ollama = Get-Command ollama.exe -ErrorAction SilentlyContinue
      $ollamaPath = if ($ollama) { $ollama.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
      if (-not (Test-Path -LiteralPath $ollamaPath -PathType Leaf)) { throw 'Ollama is configured but not installed. Install Ollama, then click Run EduQuest.bat again.' }
      $tags = $null
      try { $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 } catch {
        Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
        for ($attempt = 1; $attempt -le 60; $attempt++) {
          try { $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; break } catch { Start-Sleep -Seconds 1 }
        }
      }
      if (-not $tags) { throw 'Ollama did not start on 127.0.0.1:11434.' }
      $modelLine = $envLines | Where-Object { $_ -match '^AI_MODEL=' } | Select-Object -First 1
      $model = if ($modelLine) { ($modelLine -split '=', 2)[1].Trim().Trim('"').Trim("'") } else { 'phi3:mini' }
      if (-not ($tags.models | Where-Object { $_.name -eq $model })) { throw "Ollama model $model is missing. Run: ollama pull $model" }
      Say "Ollama ready with model $model"
    }
  }
  Step 'Run migrations' { npm run db:migrate }
  Step 'Seed demo data' { npm run seed }
  Step 'Start session reminders' { Start-ProjectScript 'Session reminders' 'scripts\run-session-reminders.ps1' -Hidden }

  $tokenLine = Get-Content .env | Where-Object { $_ -match '^AI_SERVICE_TOKEN=' } | Select-Object -First 1
  if (-not $tokenLine) { throw 'AI_SERVICE_TOKEN is missing: run npm run setup:token' }
  $token = $tokenLine.Substring('AI_SERVICE_TOKEN='.Length).Trim().Trim('"')
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'AI_SERVICE_TOKEN is empty: run npm run setup:token' }
  $env:AI_SERVICE_TOKEN = $token

  Step 'Start backend' { Start-ProjectScript 'Backend' 'scripts\run-backend.ps1' -Hidden }
  Step 'Start AI service' { Start-ProjectScript 'AI service' 'scripts\run-ai-service.ps1' -Hidden }
  Step 'Start AI worker' { Start-ProjectScript 'AI worker' 'scripts\run-worker.ps1' -Hidden }
  Step 'Start frontend' { Start-ProjectScript 'Frontend' 'scripts\run-frontend.ps1' -Hidden }

  Step 'Check backend health' { Wait-Health 'http://127.0.0.1:4000/health' }
  Step 'Check AI service health' { Wait-Health 'http://127.0.0.1:8000/health' @{ 'x-ai-service-token' = $token } }
  Step 'Check frontend health' { Wait-Health 'http://127.0.0.1:5173/health' }

  Say 'EduQuest is running:'
  Say 'Frontend: http://127.0.0.1:5173'
  Say 'Backend:  http://127.0.0.1:4000'
  Say 'AI:       http://127.0.0.1:8000'
} catch {
  Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Working directory: $((Get-Location).Path)"
  Write-Host 'Fix the reported step, then double-click Run EduQuest.bat again.'
  exit 1
} finally {
  Read-Host 'Press Enter to close'
}
