// @ts-nocheck - subprocess environment assertions are runtime-only.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const root = process.cwd();
const tempDirectories = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // Temporary test cleanup is best effort on Windows.
    }
  }
});

function tempEnv(contents = '') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'eduquest-token-'));
  tempDirectories.push(directory);
  const file = path.join(directory, '.env');
  writeFileSync(file, contents, 'utf8');
  return file;
}

describe('AI service token startup configuration', () => {
  test('replaces example placeholders while preserving provider credentials', () => {
    const envFile = tempEnv(
      'AI_SERVICE_TOKEN=generate-a-long-random-token\nMFA_ENCRYPTION_KEY=generate-a-64-character-hex-key-with-npm-run-setup-token\nAI_API_KEY=preserve-provider-key\n',
    );
    const output = execFileSync(process.execPath, ['scripts/setup-token.mjs'], {
      cwd: root,
      env: { ...process.env, ENV_FILE: envFile },
      encoding: 'utf8',
    });
    const contents = readFileSync(envFile, 'utf8');
    expect(contents).toMatch(/^AI_SERVICE_TOKEN=[A-Za-z0-9]{48}$/m);
    expect(contents).toMatch(/^MFA_ENCRYPTION_KEY=[a-f0-9]{64}$/m);
    expect(contents).toContain('AI_API_KEY=preserve-provider-key');
    expect(output).not.toContain('preserve-provider-key');
  });

  test('setup-token creates an alphanumeric token only when missing', () => {
    const envFile = tempEnv('DATABASE_URL=test\n');
    const firstOutput = execFileSync(
      process.execPath,
      ['scripts/setup-token.mjs'],
      {
        cwd: root,
        env: { ...process.env, ENV_FILE: envFile },
        encoding: 'utf8',
      },
    );
    const firstContents = readFileSync(envFile, 'utf8');
    const token = firstContents.match(/^AI_SERVICE_TOKEN=(.+)$/m)?.[1];
    expect(token).toMatch(/^[A-Za-z0-9]{32,}$/);
    expect(firstOutput).not.toContain(token);

    execFileSync(process.execPath, ['scripts/setup-token.mjs'], {
      cwd: root,
      env: { ...process.env, ENV_FILE: envFile },
      encoding: 'utf8',
    });
    expect(readFileSync(envFile, 'utf8')).toBe(firstContents);
  });

  test('backend startup fails clearly when the token is missing', () => {
    const envFile = tempEnv('NODE_ENV=development\n');
    const env = { ...process.env, DOTENV_CONFIG_PATH: envFile, PORT: '0' };
    delete env.AI_SERVICE_TOKEN;
    const result = spawnSync(process.execPath, ['backend/src/index.js'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 5000,
    });
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain(
      'AI_SERVICE_TOKEN is missing: run npm run setup:token',
    );
  });
});
