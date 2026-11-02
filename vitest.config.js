import { defineConfig } from 'vitest/config';

process.env.EMAIL_DELIVERY = 'development-file';

export default defineConfig({
  test: {
    fileParallelism: false,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'frontend/e2e/**',
      'backend/tests/real-db-concurrency.test.js',
    ],
  },
});
