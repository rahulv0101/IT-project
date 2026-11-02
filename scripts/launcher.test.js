import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const script = path.join(root, 'Start-EduQuest.ps1');
const batch = path.join(root, 'Run EduQuest.bat');

describe('EduQuest launcher', () => {
  it('resolves the batch launcher relative to its own checkout', () => {
    const source = readFileSync(batch, 'utf8');
    expect(source).toContain('set "ROOT=%~dp0"');
    expect(source).not.toContain('C:\\Users\\User');
    expect(source).toContain('exit /b %RC%');
    if (process.platform === 'win32') {
      const output = execFileSync('cmd.exe', ['/d', '/c', batch, '--dry-run'], {
        cwd: root,
        encoding: 'utf8',
        input: '\n',
        timeout: 30000,
      });
      expect(output).not.toContain('FAILED:');
    }
  });

  it('has a valid platform launcher and a parseable portable entrypoint', () => {
    expect(existsSync(script)).toBe(true);
    execFileSync(process.execPath, ['--check', 'scripts/start.mjs'], {
      cwd: root,
    });
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}`,
        ],
        { encoding: 'utf8' },
      );
    }
  });

  it('dry-run lists startup steps without starting services or changing files', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/start.mjs', '--dry-run'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    expect(output).toContain(`DRY RUN: project root = ${root}`);
    for (const step of ['setup:token', 'db:start', 'db:migrate', 'seed', 'dev'])
      expect(output).toContain(`Would run: npm run ${step}`);
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
