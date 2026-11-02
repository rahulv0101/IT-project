// @ts-nocheck - Vitest global setup manages a child process at runtime.
import { closeSync, openSync } from 'node:fs';
import { mkdir, readFile, rm, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const dataRoot = path.resolve(root, '.pgdata');
const suiteDir = path.resolve(
  dataRoot,
  `test-suite-${process.pid}-${Date.now()}`,
);
const logDir = path.resolve(dataRoot, 'logs');
const logPath = path.resolve(logDir, 'test-suite.log');
const pidPath = path.resolve(root, '.pglite-suite.pid');
const serverScript = path.resolve(root, 'scripts', 'pglite-server.mjs');
const port = Number(process.env.PGLITE_SUITE_PORT ?? 55433);
const testUrl = `postgres://postgres:postgres@127.0.0.1:${port}/eduquest_test?sslmode=disable`;

if (
  path.dirname(suiteDir) !== dataRoot ||
  !/^test-suite-\d+-\d+$/.test(path.basename(suiteDir))
)
  throw new Error(`Refusing to reset unexpected test directory: ${suiteDir}`);

const pause = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForQuery(child) {
  let lastError;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`PGlite test server exited with code ${child.exitCode}`);
    const client = new Client({
      connectionString: testUrl,
      connectionTimeoutMillis: 1000,
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
      await pause(250);
    }
  }
  throw new Error(
    `PGlite test server did not accept select 1: ${lastError?.message ?? 'unknown error'}`,
  );
}

function runReset() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['backend/scripts/reset-test-db.js'],
      {
        cwd: root,
        env: {
          ...process.env,
          DATABASE_URL: testUrl,
          TEST_DATABASE_URL: testUrl,
        },
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Test database reset exited with code ${code}`));
    });
  });
}

async function printServerLog() {
  const log = await readFile(logPath, 'utf8').catch(
    () => 'No server log found.',
  );
  console.error(`--- PGlite test server log ---\n${log}`);
}

export default async function setup() {
  process.env.TEST_DATABASE_URL = testUrl;
  process.env.DATABASE_URL = testUrl;
  process.env.PG_POOL_MAX = '1';

  await unlink(pidPath).catch(() => {});
  await rm(suiteDir, { recursive: true, force: true });
  await mkdir(suiteDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  const logFd = openSync(logPath, 'w');
  const child = spawn(process.execPath, [serverScript, 'daemon', 'suite'], {
    cwd: root,
    env: {
      ...process.env,
      PGLITE_SUITE_PORT: String(port),
      PGLITE_SUITE_DIR: suiteDir,
    },
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  });
  closeSync(logFd);

  try {
    await waitForQuery(child);
    await runReset();
  } catch (error) {
    await printServerLog();
    child.kill('SIGKILL');
    throw error;
  }

  return async () => {
    child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise((resolve) => child.once('exit', () => resolve(true))),
      pause(6000).then(() => false),
    ]);
    if (!exited) child.kill('SIGKILL');
    await unlink(pidPath).catch(() => {});
    if (child.exitCode && child.exitCode !== 0) await printServerLog();
    await rm(suiteDir, { recursive: true, force: true });
  };
}
