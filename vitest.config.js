import { defineConfig } from 'vitest/config';

process.env.EMAIL_DELIVERY = 'development-file';
process.env.EMAIL_OTP_SECRET = 'offline-tests-only-email-verification-secret';

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
