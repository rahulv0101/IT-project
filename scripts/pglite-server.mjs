// @ts-nocheck - role configuration is selected at runtime from the CLI.
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const envPath = path.join(root, '.env');
const dataRoot = path.join(root, '.pgdata');
const scriptPath = fileURLToPath(import.meta.url);
const configs = {
  dev: {
    port: 5432,
    database: 'eduquest',
    dir: path.join(dataRoot, 'dev'),
    pid: path.join(root, '.pglite-dev.pid'),
  },
  test: {
    port: 5433,
    database: 'eduquest_test',
    dir: path.join(dataRoot, 'test'),
    pid: path.join(root, '.pglite-test.pid'),
  },
  suite: {
    port: Number(process.env.PGLITE_SUITE_PORT ?? 55433),
    database: 'eduquest_test',
    dir: process.env.PGLITE_SUITE_DIR ?? path.join(dataRoot, 'test-suite'),
    pid: path.join(root, '.pglite-suite.pid'),
  },
  e2e: {
    port: Number(process.env.PGLITE_E2E_PORT ?? 55434),
    database: 'eduquest_e2e',
    dir: process.env.PGLITE_E2E_DIR ?? path.join(dataRoot, 'e2e-suite'),
    pid: path.join(root, '.pglite-e2e.pid'),
  },
};

function errorText(error) {
  if (error instanceof Error)
    return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  return String(error);
}

async function writeEnv() {
  if (existsSync(envPath))
    return (await readFile(envPath, 'utf8'))
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => line.split('=')[0]);
  const lines = [
    'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/eduquest?sslmode=disable',
    'TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/eduquest_test?sslmode=disable',
    'PGLITE_DEV_PORT=5432',
    'PGLITE_TEST_PORT=5433',
    'AI_PROVIDER=openai_compatible',
    'AI_BASE_URL=http://127.0.0.1:11434/v1',
    'AI_API_KEY=ollama',
    'AI_MODEL=phi3:mini',
    'AI_TIMEOUT_SECONDS=300',
    'AI_REQUEST_TIMEOUT_SECONDS=300',
  ];
  await writeFile(envPath, `${lines.join('\n')}\n`, 'utf8');
  return lines.map((line) => line.split('=')[0]);
}

async function waitFor(port, database) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const client = new Client({
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
      connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/${database}?sslmode=disable`,
    });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch {
      try {
        await client.end();
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(
    `PGlite socket server did not accept connections on 127.0.0.1:${port}`,
  );
}

async function daemon(role) {
  const config = configs[role];
  if (!config) throw new Error(`Unknown PGlite role: ${role}`);
  await mkdir(config.dir, { recursive: true });
  const db = await PGlite.create(config.dir);
  const server = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port: config.port,
    // Test files each own a pg Pool; accept enough socket clients while PGlite
    // continues to serialize execution internally.
    maxConnections: 50,
  });
  server.addEventListener('error', (event) => {
    console.error(
      `[${new Date().toISOString()}] socket server error: ${errorText(event.detail)}`,
    );
  });
  server.addEventListener('close', () => {
    console.error(`[${new Date().toISOString()}] socket server closed`);
  });
  await server.start();
  console.error(
    `[${new Date().toISOString()}] PGlite ${role} listening on 127.0.0.1:${config.port}`,
  );
  await writeFile(config.pid, String(process.pid), 'utf8');
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.error(`[${new Date().toISOString()}] PGlite ${role} stopping`);
    const forcedExit = setTimeout(() => {
      console.error(
        `[${new Date().toISOString()}] PGlite ${role} shutdown timed out`,
      );
      process.exit(1);
    }, 5000);
    forcedExit.unref();
    try {
      await server.stop();
      await db.close();
      await unlink(config.pid).catch(() => {});
      process.exit(0);
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] PGlite ${role} shutdown failed: ${errorText(error)}`,
      );
      process.exit(1);
    }
  };
  process.on('uncaughtException', (error) => {
    console.error(
      `[${new Date().toISOString()}] uncaught exception: ${errorText(error)}`,
    );
    void shutdown();
  });
  process.on('unhandledRejection', (error) => {
    console.error(
      `[${new Date().toISOString()}] unhandled rejection: ${errorText(error)}`,
    );
    void shutdown();
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  setInterval(() => {}, 2 ** 31 - 1);
}

async function start() {
  const names = await writeEnv();
  for (const role of ['dev', 'test']) {
    if (existsSync(configs[role].pid)) {
      const pid = Number(await readFile(configs[role].pid, 'utf8'));
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
        await unlink(configs[role].pid);
      }
    }
    if (!existsSync(configs[role].pid)) {
      const child = spawn(process.execPath, [scriptPath, 'daemon', role], {
        cwd: root,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    }
  }
  await waitFor(configs.dev.port, configs.dev.database);
  await waitFor(configs.test.port, configs.test.database);
  console.log(
    'PGlite dev/test servers ready. .env variables written:',
    names.join(', '),
  );
}

async function startRole(role) {
  const config = configs[role];
  if (!config) throw new Error(`Unknown PGlite role: ${role}`);
  await writeEnv();
  if (existsSync(config.pid)) {
    const pid = Number(await readFile(config.pid, 'utf8'));
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      await unlink(config.pid);
    }
  }
  if (!existsSync(config.pid)) {
    const child = spawn(process.execPath, [scriptPath, 'daemon', role], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  }
  await waitFor(config.port, config.database);
  console.log(`PGlite ${role} server ready on 127.0.0.1:${config.port}`);
}

async function stopRole(role) {
  const config = configs[role];
  if (!config) throw new Error(`Unknown PGlite role: ${role}`);
  if (!existsSync(config.pid)) return;
  const pid = Number(await readFile(config.pid, 'utf8'));
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Stopping PGlite ${role} server`);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    await unlink(config.pid).catch(() => {});
  }
}

async function stop() {
  for (const config of Object.values(configs)) {
    if (existsSync(config.pid)) {
      const pid = Number(await readFile(config.pid, 'utf8'));
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`Stopping ${pid}`);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
        await unlink(config.pid).catch(() => {});
      }
    }
  }
}

async function status() {
  await waitFor(configs.dev.port, configs.dev.database);
  await waitFor(configs.test.port, configs.test.database);
  console.log('PGlite dev/test servers are ready');
}

const [command, role] = process.argv.slice(2);
if (command === 'daemon') await daemon(role);
else if (command === 'start') await start();
else if (command === 'start-role') await startRole(role);
else if (command === 'stop-role') await stopRole(role);
else if (command === 'stop') await stop();
else if (command === 'status') await status();
else
  throw new Error(
    'Usage: start|start-role <role>|stop-role <role>|stop|status',
  );
