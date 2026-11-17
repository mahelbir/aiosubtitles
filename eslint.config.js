import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import checkFile from 'eslint-plugin-check-file';

const KEBAB_FILE_NAME = '?(_)+([a-z0-9])*(-+([a-z0-9]))';

const restrictedIpAccess = [
  'MemberExpression[computed=false][property.name="ip"][object.name=/^(request|req)$/]',
  'MemberExpression[computed=true][property.value="ip"][object.name=/^(request|req)$/]',
  'VariableDeclarator[init.name=/^(request|req)$/] > ObjectPattern > Property[key.name="ip"]',
  ':function > ObjectPattern:first-child > Property[key.name="ip"]',
].map(selector => ({
  selector,
  message:
    'Read request.clientIp instead — it resolves the header an edge is configured with.',
}));

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/storage/**',
      '**/coverage/**',
      '.reference/**',
      '.claude/**',
      'apps/client/**',
    ],
  },
  js.configs.recommended,
  {
    plugins: {
      import: importPlugin,
      'check-file': checkFile,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // args: Fastify handler/plugin signatures keep unused args like (request, reply).
      // ignoreRestSiblings: allows the omit-via-destructuring pattern ({ secret, ...safe }).
      'no-unused-vars': ['error', {args: 'none', ignoreRestSiblings: true}],
      // Always use the timezone-aware wrapper (lib/datetime.js), never raw dayjs.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dayjs',
              message:
                'Import the timezone-aware wrapper from lib/datetime.js instead.',
            },
          ],
        },
      ],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always', {null: 'ignore'}],
      'no-var': 'error',
      'prefer-const': 'error',
      'one-var': ['error', 'never'],
      camelcase: ['error', {properties: 'never'}],
      'new-cap': ['error', {capIsNew: false}],
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      'no-throw-literal': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'no-array-constructor': 'error',
      'no-object-constructor': 'error',
      'check-file/filename-naming-convention': [
        'error',
        {'**/*.{js,mjs,cjs}': KEBAB_FILE_NAME},
        {ignoreMiddleExtensions: true},
      ],
      'import/enforce-node-protocol-usage': ['error', 'always'],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [{pattern: '@repo/**', group: 'internal'}],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'never',
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-default-export': 'error',
      'import/no-cycle': 'error',
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: ['./apps/api/src', './packages/*/src/**'],
              from: ['./apps/*/tests/**', './packages/*/tests/**'],
              message: 'Shipped code never imports from a tests tree.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/plugins/client-ip.js'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedIpAccess],
    },
  },
  {
    files: ['apps/**', 'packages/**'],
    // Route folders carry the autoloader's group syntax, e.g. (admin).
    ignores: ['apps/api/src/routes/**'],
    plugins: {'check-file': checkFile},
    rules: {
      'check-file/folder-naming-convention': ['error', {'**/*': 'KEBAB_CASE'}],
    },
  },
  {
    // The wrapper is the one place allowed to import the real dayjs.
    files: ['**/lib/datetime.js'],
    rules: {'no-restricted-imports': 'off'},
  },
  {
    files: [
      'apps/api/src/app.js',
      'apps/api/src/plugins/**',
      'apps/api/src/routes/**',
      'apps/api/src/workers/**',
      'apps/api/tests/setup/**',
      '*.config.js',
    ],
    rules: {'import/no-default-export': 'off'},
  },
];
