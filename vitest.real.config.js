import { defineConfig } from 'vitest/config';
import databaseConfig from './vitest.db.config.js';

if (!process.env.REAL_TEST_DATABASE_URL)
  throw new Error('REAL_TEST_DATABASE_URL is required');
process.env.DATABASE_URL = process.env.REAL_TEST_DATABASE_URL;
process.env.TEST_DATABASE_URL = process.env.REAL_TEST_DATABASE_URL;
process.env.PG_POOL_MAX = '12';

export default defineConfig({
  test: {
    ...databaseConfig.test,
    globalSetup: [],
    include: [
      ...databaseConfig.test.include,
      'backend/tests/real-db-concurrency.test.js',
    ],
  },
});
