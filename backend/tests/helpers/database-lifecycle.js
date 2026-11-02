// @ts-nocheck - Vitest lifecycle helper is exercised at runtime.
import 'dotenv/config';
import { afterAll, beforeAll } from 'vitest';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for database tests; database tests may not be skipped.',
  );
}

process.env.DATABASE_URL = testUrl;
process.env.PG_POOL_MAX ||= '1';

const { pool } = await import('../../db.js');

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function assertDatabaseReady() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(attempt * 100);
    }
  }
  throw new Error(
    `Test database did not accept a query after 3 attempts: ${lastError?.message ?? 'unknown error'}`,
    { cause: lastError },
  );
}

export async function closeDatabasePoolAndAssertNoLeaks() {
  await pool.end();
  if (
    pool.totalCount !== 0 ||
    pool.idleCount !== 0 ||
    pool.waitingCount !== 0
  ) {
    throw new Error(
      `Database connection leak detected after pool shutdown: total=${pool.totalCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`,
    );
  }
}

beforeAll(assertDatabaseReady);
afterAll(closeDatabasePoolAndAssertNoLeaks);
