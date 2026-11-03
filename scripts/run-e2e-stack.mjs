// @ts-nocheck
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, rm, unlink } from 'node:fs/promises';
import pg from 'pg';
import { resolvePython } from './python-runtime.mjs';

const env = {
  ...process.env,
  DATABASE_URL:
    'postgres://postgres:postgres@127.0.0.1:55436/eduquest_e2e?sslmode=disable',
  TEST_DATABASE_URL:
    'postgres://postgres:postgres@127.0.0.1:55436/eduquest_e2e?sslmode=disable',
  PORT: '4391',
  BACKEND_PORT: '4391',
  AI_PORT: '8391',
  AI_SERVICE_URL: 'http://127.0.0.1:8391',
  VITE_PORT: '5391',
  AI_PROVIDER: 'mock',
  EMAIL_DELIVERY: 'development-file',
  PGLITE_E2E_DIR: '.pgdata/e2e-suite-55436',
  // The socket adapter is single-connection. Serialising backend queries avoids
  // protocol-level errors when one browser page loads several summaries.
  PG_POOL_MAX: '1',
  E2E_TEST_MODE: '1',
};

const dbUrl = env.DATABASE_URL;
const dbPidPath = '.pglite-e2e.pid';
const oldPid = Number(await readFile(dbPidPath, 'utf8').catch(() => '0'));
if (oldPid) {
  try {
    process.kill(oldPid, 'SIGTERM');
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
await unlink(dbPidPath).catch(() => {});
await rm(env.PGLITE_E2E_DIR, { recursive: true, force: true });
const db = spawn(
  process.execPath,
  ['scripts/pglite-server.mjs', 'daemon', 'e2e'],
  {
    cwd: process.cwd(),
    env: { ...env, PGLITE_E2E_PORT: '55436' },
    stdio: 'inherit',
    windowsHide: true,
  },
);
const children = [];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  db.kill('SIGTERM');
  void unlink(dbPidPath);
  setTimeout(() => process.exit(code), 500);
};
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
db.once('error', (error) => {
  console.error(error.message);
  stop(1);
});
db.once('exit', () => {
  if (!stopping) stop(1);
});

const waitForDatabase = async () => {
  let lastError;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (db.exitCode !== null)
      throw new Error('E2E database process exited during startup');
    const client = new pg.Client({
      connectionString: dbUrl,
      connectionTimeoutMillis: 500,
      query_timeout: 1000,
    });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(
    `E2E database did not start: ${lastError?.message ?? 'unknown error'}`,
  );
};
const runSetup = (script) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...env, DATABASE_URL: dbUrl, TEST_DATABASE_URL: dbUrl },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} exited with ${code}`)),
    );
  });

try {
  await waitForDatabase();
  await runSetup('backend/scripts/reset-test-db.js');
  await runSetup('backend/scripts/seed.js');
  const build = spawnSync(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--config',
      'frontend/vite.config.js',
    ],
    {
      cwd: process.cwd(),
      env: { ...env, NODE_ENV: 'production' },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (build.status !== 0)
    throw new Error(`frontend production build failed with ${build.status}`);

  const pwa = spawnSync(process.execPath, ['scripts/build-pwa.mjs'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (pwa.status !== 0) throw new Error('PWA build failed');

  const commands = [
    [process.execPath, ['backend/scripts/session-reminders.js']],
    [process.execPath, ['backend/tests/helpers/e2e-server.js']],
    [resolvePython(), ['ai-service/run.py']],
    [process.execPath, ['backend/scripts/ai-worker.js']],
    [
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--config',
        'frontend/vite.config.js',
        '--host',
        '127.0.0.1',
        '--port',
        '5391',
      ],
    ],
  ];
  children.push(
    ...commands.map(([command, args]) =>
      spawn(command, args, {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
        windowsHide: true,
      }),
    ),
  );
  for (const [index, child] of children.entries())
    child.once('exit', (code, signal) => {
      console.error(
        `[e2e-stack] child ${commands[index][0]} ${commands[index][1][0]} exited code=${code} signal=${signal ?? 'none'}`,
      );
      if (!stopping && code !== 0) stop(code || 1);
    });
  setInterval(() => {}, 2 ** 31 - 1);
} catch (error) {
  console.error(error.message);
  stop(1);
}
