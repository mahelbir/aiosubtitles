import {defineConfig, devices} from '@playwright/test';
import {getWorkspacePath} from '@repo/tooling/workspace.js';
import {
  getE2eClientOrigin,
  getE2eClientPort,
  resolveE2ePorts,
} from '../api/tests/e2e/ports.js';
import {loadClientEnv} from './env.mjs';
import {getApiUrl} from './tests/e2e/lib/api.js';
import {ADMIN_STORAGE_STATE_PATH} from './tests/e2e/lib/session.js';

const SERVER_TIMEOUT = 180_000;

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
      name: 'setup',
      testMatch: ['setup/auth.setup.js', 'setup/sweep.setup.js'],
      dependencies: ['warmup'],
      teardown: 'cleanup',
    },
    {
      name: 'cleanup',
      testMatch: 'setup/**/*.teardown.js',
    },
    {
      name: 'flows',
      testMatch: 'flows/**/*.spec.js',
      dependencies: ['setup'],
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STORAGE_STATE_PATH,
      },
    },
  ],
  webServer: [
    {
      name: 'client',
      command: 'pnpm dev',
      url: `${baseURL}/admin/fixtures`,
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
      url: `${apiUrl}/`,
      gracefulShutdown: {signal: 'SIGINT', timeout: 15_000},
      timeout: SERVER_TIMEOUT,
      reuseExistingServer: false,
    },
  ],
});
