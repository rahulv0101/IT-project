import { defineConfig } from 'vitest/config';

process.env.EMAIL_DELIVERY = 'development-file';

const suitePort = Number(process.env.PGLITE_SUITE_PORT ?? 55433);
const suiteUrl = `postgres://postgres:postgres@127.0.0.1:${suitePort}/eduquest_test?sslmode=disable`;
process.env.TEST_DATABASE_URL = suiteUrl;
process.env.DATABASE_URL = suiteUrl;
process.env.PG_POOL_MAX = '1';

export default defineConfig({
  test: {
    include: [
      'backend/tests/admin-api.test.js',
      'backend/tests/group-sessions-api.test.js',
      'backend/tests/group-messaging-api.test.js',
      'backend/tests/study-groups-api.test.js',
      'backend/tests/ai-worker.test.js',
      'backend/tests/identity-api.test.js',
      'backend/tests/mfa-api.test.js',
      'backend/tests/profile-api.test.js',
      'backend/tests/api.test.js',
      'backend/tests/authorization-matrix.test.js',
      'backend/tests/database.invariants.test.js',
      'backend/tests/infected-api.test.js',
      'backend/tests/island-escape-api.test.js',
      'backend/tests/memory-match-api.test.js',
      'backend/tests/boss-battle-api.test.js',
      'backend/tests/pixel-racer-api.test.js',
      'backend/tests/timer-trivia-api.test.js',
      'backend/tests/module-resource-catalogue-api.test.js',
      'backend/tests/labs-api.test.js',
    ],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // Password hashing and the PGlite socket server occasionally exceed Vitest's
    // generic 5s default on Windows. This does not relax assertions; it gives
    // the serial database integration suite its documented 15s ceiling.
    testTimeout: 15000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    isolate: true,
    globalSetup: ['./backend/tests/helpers/pglite-global-setup.js'],
    setupFiles: ['./backend/tests/helpers/database-lifecycle.js'],
    reporters: ['default', './scripts/no-skipped-tests-reporter.mjs'],
    sequence: {
      shuffle: {
        files: process.env.TEST_SHUFFLE === 'true',
        tests: false,
      },
      seed: Number(process.env.TEST_SEQUENCE_SEED ?? 1),
    },
  },
});
