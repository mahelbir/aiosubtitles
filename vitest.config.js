import {defineConfig} from 'vitest/config';

const INTEGRATION_DIRS = 'integration,security,contract,concurrency,budget';

/* The autoloader imports plugins, routes and models with a runtime `import()`,
   which Vite never sees. Left transformed, an integration test would hold a
   second copy of every model — one without the scopes and cache hooks the
   database plugin applies. Externalising the workspace source keeps the app and
   its tests on one graph.
   It costs something: V8 cannot attribute per-file coverage to a natively
   loaded module whose work happens inside its functions. So it is applied only
   where it is needed — the projects that boot the app — and coverage is
   measured on the ones where it is trustworthy. */
const server = {
  deps: {
    external: [
      /[\\/]apps[\\/]api[\\/]src[\\/]/,
      /[\\/]packages[\\/][^\\/]+[\\/]src[\\/]/,
    ],
  },
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          include: ['tests/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'subtitle-core',
          root: './packages/subtitle-core',
          include: ['tests/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'eval',
          root: './apps/eval',
          include: ['tests/**/*.test.js'],
        },
      },
      {
        test: {
          name: 'api-unit',
          root: './apps/api',
          include: ['tests/unit/**/*.test.js'],
          setupFiles: ['./tests/setup/network.js'],
        },
      },
      {
        test: {
          name: 'api-integration',
          root: './apps/api',
          include: [`tests/{${INTEGRATION_DIRS}}/**/*.test.js`],
          globalSetup: ['./tests/setup/containers.js'],
          setupFiles: ['./tests/setup/network.js', './tests/setup/database.js'],
          /* Forks so each worker owns its own process.env, and one at a time so
             the shared database is never truncated out from under another file. */
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 180000,
          server,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      /* Its own directory: `c8` reports the other tier beside it, and the
         runner cleans whatever directory it is pointed at. */
      reportsDirectory: 'coverage/logic',
      /* Matched against the repo root only while no `--project` filter is set;
         under one, each file is matched against its own project's root, where
         `src/lib/settings.js` names a file in both packages. The logic tier is
         therefore selected by test path, never by `--project`. */
      include: [
        'apps/api/src/**/*.js',
        'apps/eval/src/**/*.js',
        'packages/shared/src/**/*.js',
        'packages/subtitle-core/src/**/*.js',
      ],
      /* What only a booted application reaches. Those paths are covered by the
         integration project, whose coverage V8 cannot attribute — counting them
         here would report a number that is wrong in the pessimistic direction. */
      exclude: [
        'apps/api/src/{app,build,server}.js',
        'apps/api/src/{plugins,routes,workers,redis}/**',
        'apps/api/src/db/{models,migrations,seeders,cli,hooks}/**',
        'apps/api/src/db/{index,init}.js',
        'apps/api/src/lib/settings.js',
      ],
    },
  },
});
