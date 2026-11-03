import { defineConfig, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Firefox 157 still resolves shared app data outside its temporary profile.
// On macOS, isolate that data as well; never request access to a user's profile.
// https://github.com/microsoft/playwright/issues/42768
const firefoxAppDataRoot = path.resolve('.pgdata/firefox-app-data');
if (process.platform === 'darwin')
  mkdirSync(firefoxAppDataRoot, { recursive: true });
const firefoxLaunchOptions =
  process.platform === 'darwin'
    ? { env: { CFFIXED_USER_HOME: firefoxAppDataRoot } }
    : {};

process.env.DATABASE_URL =
  'postgres://postgres:postgres@127.0.0.1:55436/eduquest_e2e?sslmode=disable';
process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;

export default defineConfig({
  testDir: './frontend/e2e',
  timeout: 60_000,
  // PGlite exposes PostgreSQL over a socket but serializes execution internally.
  // Keep browser projects sequential so end-to-end jobs do not starve the worker.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5391',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/run-e2e-stack.mjs',
    url: 'http://127.0.0.1:5391',
    // Browser checks are an offline, deterministic suite. Do not inherit a
    // configured live provider from .env or reuse an interactive dev stack.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      AI_PROVIDER: 'mock',
      DATABASE_URL:
        'postgres://postgres:postgres@127.0.0.1:55436/eduquest_e2e?sslmode=disable',
      TEST_DATABASE_URL:
        'postgres://postgres:postgres@127.0.0.1:55436/eduquest_e2e?sslmode=disable',
      PGLITE_E2E_PORT: '55436',
      PGLITE_E2E_DIR: '.pgdata/e2e-suite-55436',
      PG_POOL_MAX: '1',
      E2E_TEST_MODE: '1',
      PORT: '4391',
      BACKEND_PORT: '4391',
      AI_PORT: '8391',
      AI_SERVICE_URL: 'http://127.0.0.1:8391',
      VITE_PORT: '5391',
    },
  },
  projects: [
    {
      name: 'webkit-mobile',
      testMatch: ['collaboration.spec.js', 'pwa-outage.spec.js'],
      use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'chromium-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: 'firefox-mobile',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: firefoxLaunchOptions,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'firefox-tablet',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: firefoxLaunchOptions,
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: firefoxLaunchOptions,
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
