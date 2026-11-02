import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const script = path.join(root, 'Start-EduQuest.ps1');
const desktopBat = path.join(path.dirname(root), 'Run EduQuest.bat');

describe('EduQuest launcher', () => {
  it('runs the batch dry run visibly and preserves its exit status', () => {
    const output = execFileSync(
      'cmd.exe',
      ['/d', '/c', 'Run EduQuest.bat', '--dry-run'],
      { cwd: root, encoding: 'utf8', input: '\n', timeout: 30000 },
    );
    expect(output).toContain(`Working directory: ${root}`);
    for (const step of [
      'db:start',
      'db:migrate',
      'seed',
      'run-backend.ps1',
      'run-ai-service.ps1',
      'run-worker.ps1',
      'run-frontend.ps1',
    ]) {
      expect(output).toContain(step);
    }
    expect(output).not.toContain('FAILED:');
    expect(output).not.toContain('Press Enter to close');
  });

  it('targets an existing parseable PowerShell script', () => {
    expect(existsSync(script)).toBe(true);
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|% Message;exit 1}`,
      ],
      { encoding: 'utf8' },
    );
    expect(output).toBe('');
    if (existsSync(desktopBat)) {
      const bat = readFileSync(desktopBat, 'utf8');
      expect(bat).toContain(`-File "%ROOT%\\Start-EduQuest.ps1"`);
      expect(bat).toContain('-NoPause');
      expect(bat).not.toContain('RUNLOG');
      expect(bat).not.toContain('2>&1');
    }
  });

  it('dry-run lists every startup step and the project directory', () => {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-DryRun'],
      { encoding: 'utf8' },
    );
    expect(output).toContain(`DRY RUN: project root = ${root}`);
    for (const step of [
      'db:start',
      'db:migrate',
      'seed',
      'run-backend.ps1',
      'run-ai-service.ps1',
      'run-worker.ps1',
      'run-frontend.ps1',
    ])
      expect(output).toContain(step);
  });

  it('quotes every child PowerShell script path so folders with spaces work', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).toContain("$quotedScriptPath = '\"' + $scriptPath + '\"'");
    expect(source).toContain(
      "ArgumentList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $quotedScriptPath)",
    );
    expect(source).toContain('RedirectStandardOutput = $standardOutput');
    expect(source).toContain('RedirectStandardError = $standardError');
    expect(source).not.toMatch(
      /-File',\s*"\$ProjectRoot\\scripts\\run-(?:backend|ai-service|worker|frontend)\.ps1"/,
    );
  });

  it('runs every long-lived service hidden behind the single launcher window', () => {
    const source = readFileSync(script, 'utf8');
    for (const [name, file] of [
      ['Backend', 'run-backend.ps1'],
      ['AI service', 'run-ai-service.ps1'],
      ['AI worker', 'run-worker.ps1'],
      ['Frontend', 'run-frontend.ps1'],
    ]) {
      expect(source).toContain(
        `Start-ProjectScript '${name}' 'scripts\\${file}' -Hidden`,
      );
    }
  });

  it('serves the production frontend instead of the unstable Windows dev server', () => {
    const source = readFileSync(
      path.join(root, 'scripts', 'run-frontend.ps1'),
      'utf8',
    );
    expect(source).toContain("Write-Host 'Command: npm run build'");
    expect(source).toContain(
      "Write-Host 'Command: npx vite preview --config frontend/vite.config.js'",
    );
    expect(source).not.toContain(
      "Write-Host 'Command: npx vite --config frontend/vite.config.js'",
    );
  });

  it('rejects false-positive health checks from stale processes and prepares Ollama', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).toContain('$process.HasExited');
    expect(source).toContain('$consecutiveSuccesses -ge 3');
    expect(source).toContain("Step 'Check local AI provider'");
    expect(source).toContain("$tagsUrl = 'http://127.0.0.1:11434/api/tags'");
    expect(source).toContain('Start-Process @startArguments -PassThru');
  });
});
