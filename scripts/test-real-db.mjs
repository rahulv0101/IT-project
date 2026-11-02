import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const url = process.env.REAL_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'REAL_TEST_DATABASE_URL is required for real PostgreSQL verification',
  );
if (url === process.env.DATABASE_URL)
  throw new Error('Real database tests refuse the development database');
const env = { ...process.env, DATABASE_URL: url, TEST_DATABASE_URL: url };
for (const args of [
  ['backend/scripts/migrate.js'],
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'vitest.real.config.js',
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
