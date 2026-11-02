import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { ensureLocalDatabaseEnv } from './local-env.mjs';

it('completes a token-only environment without overwriting provider credentials and is idempotent', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eduquest-env-'));
  const file = path.join(directory, '.env');
  try {
    await writeFile(
      file,
      'AI_SERVICE_TOKEN=preserve-token\nAI_API_KEY=preserve-provider\nDATABASE_URL=\n',
    );
    await ensureLocalDatabaseEnv(file, { devPort: 55470, testPort: 55471 });
    const first = await readFile(file, 'utf8');
    expect(first).toContain('AI_API_KEY=preserve-provider');
    expect(first).toContain('AI_SERVICE_TOKEN=preserve-token');
    expect(first).toContain(':55470/eduquest?');
    expect(first).toContain(':55471/eduquest_test?');
    await ensureLocalDatabaseEnv(file);
    expect(await readFile(file, 'utf8')).toBe(first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('preserves explicitly configured database URLs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eduquest-env-'));
  const file = path.join(directory, '.env');
  try {
    await writeFile(
      file,
      'DATABASE_URL=custom-development\nTEST_DATABASE_URL=custom-test\n',
    );
    await ensureLocalDatabaseEnv(file);
    const contents = await readFile(file, 'utf8');
    expect(contents).toContain('DATABASE_URL=custom-development');
    expect(contents).toContain('TEST_DATABASE_URL=custom-test');
    expect(contents).not.toContain('postgres://');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
