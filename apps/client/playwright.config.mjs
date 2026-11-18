import {defineConfig, devices} from '@playwright/test';
import {DEFAULT_TIMEZONE} from '@repo/shared/constants/app.js';
import {getWorkspacePath} from '@repo/tooling/workspace.js';
import {
  getE2eClientOrigin,
  getE2eApiPort,
  getE2eClientPort,
  resolveE2ePorts,
} from '../api/tests/e2e/ports.js';
import {loadClientEnv} from './env.mjs';
import {getApiUrl} from './tests/e2e/lib/api.js';
import {TALL_PHONE_VIEWPORT} from './tests/e2e/lib/viewport.js';

const SERVER_TIMEOUT = 180_000;
const BROWSER_LOCALE = 'en-US';

loadClientEnv();
await resolveE2ePorts();

const isCi = Boolean(process.env.CI);
const clientPort = getE2eClientPort();
const baseURL = getE2eClientOrigin();
const apiUrl = getApiUrl('');

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    baseURL,
    locale: BROWSER_LOCALE,
    timezoneId: DEFAULT_TIMEZONE,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'warmup',
      testMatch: 'setup/warmup.setup.js',
      use: {...devices['Desktop Chrome']},
    },
    {
      name: 'kit',
      testMatch: 'kit/**/*.spec.js',
      dependencies: ['warmup'],
      fullyParallel: true,
      use: {...devices['Desktop Chrome']},
    },
    {
      name: 'flows',
      testMatch: 'flows/**/*.spec.js',
      dependencies: ['warmup'],
      fullyParallel: false,
      workers: 1,
      use: {...devices['Desktop Chrome']},
    },
    {
      name: 'flows-phone',
      testMatch: 'flows/**/*.spec.js',
      dependencies: ['warmup'],
      fullyParallel: false,
      workers: 1,
      use: {...devices['Pixel 7'], viewport: TALL_PHONE_VIEWPORT},
    },
  ],
  webServer: [
    {
      name: 'client',
      command: 'pnpm dev',
      url: `${baseURL}/fixtures`,
      env: {
        NODE_ENV: 'test',
        NEXT_PORT: String(clientPort),
        NEXT_PUBLIC_API_URL: apiUrl,
      },
      timeout: SERVER_TIMEOUT,
      reuseExistingServer: false,
    },
    {
      name: 'api',
      command: 'pnpm --filter api e2e:server',
      cwd: getWorkspacePath(),
      port: getE2eApiPort(),
      gracefulShutdown: {signal: 'SIGINT', timeout: 15_000},
      timeout: SERVER_TIMEOUT,
      reuseExistingServer: false,
    },
  ],
});
