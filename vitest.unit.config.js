import { defineConfig } from 'vitest/config';

const databaseTests = [
  'backend/tests/admin-api.test.js',
  'backend/tests/group-sessions-api.test.js',
  'backend/tests/group-messaging-api.test.js',
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
];

export default defineConfig({
  test: {
    maxWorkers: 4,
    minWorkers: 1,
    exclude: [
      'backend/tests/real-db-concurrency.test.js',
      'backend/tests/study-groups-api.test.js',
      '**/node_modules/**',
      '**/dist/**',
      'frontend/e2e/**',
      ...databaseTests,
    ],
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
