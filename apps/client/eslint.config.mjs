import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import {defineConfig, globalIgnores} from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import checkFile from 'eslint-plugin-check-file';

const features = readdirSync(new URL('./src/features', import.meta.url), {
  withFileTypes: true,
})
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name);

const sharedLayers = [
  './src/api',
  './src/components',
  './src/config',
  './src/hooks',
  './src/lib',
  './src/stores',
];

const sharedOnlyBoundaries = [
  {
    targets: sharedLayers,
    message: 'shared layers must not import from features or app',
  },
  {
    targets: ['./tests/e2e/fixtures'],
    message: 'fixtures must not import from features or app',
  },
];

const restrictedImportPaths = [
  {
    name: '@formkit/auto-animate/react',
    message: 'use useAutoAnimate from @/hooks/use-auto-animate',
  },
];

const restrictedClassPatterns = [
  {
    pattern: '(^|\\s)(\\S+:)?-?space-[xy]-',
    message: 'space-x/y-* is banned: use flex or grid with gap-*',
  },
  {
    pattern: '(^|\\s)(!\\S|\\S+!(\\s|$))',
    message: 'an important (!) utility is banned: fix the owning component',
  },
  {
    pattern:
      '(^|\\s)(\\S+:)?dark:(\\S+:)?(bg|text|border|ring|outline|fill|stroke|shadow|divide|decoration|placeholder|caret|accent)-',
    message:
      "a call-site dark: colour is banned: use a semantic token or the owning component's cva variant",
  },
];

const restrictedClassSelectors = restrictedClassPatterns.flatMap(
  ({pattern, message}) =>
    ['Literal[value', 'TemplateElement[value.raw'].map(node => ({
      selector: `:matches(JSXAttribute[name.name=/[cC]lassName$/], CallExpression[callee.name='cn'], VariableDeclarator[id.name=/CLASS/]) ${node}=/${pattern}/]`,
      message,
    })),
);

const eslintConfig = defineConfig([
  js.configs.recommended,
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  globalIgnores(['.next-test/**']),
  {
    languageOptions: {
      globals: {...globals.browser, ...globals.node},
    },
    settings: {
      'import/resolver': {
        node: {extensions: ['.js', '.jsx', '.ts', '.tsx']},
        typescript: {
          alwaysTryTypes: true,
          project: fileURLToPath(new URL('./jsconfig.json', import.meta.url)),
        },
      },
    },
    plugins: {'check-file': checkFile},
    rules: {
      'no-restricted-imports': ['error', {paths: restrictedImportPaths}],
      'import/no-cycle': 'error',
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
          pathGroups: [
            {pattern: '@repo/**', group: 'internal'},
            {pattern: '@/**', group: 'internal'},
            {pattern: '@tests/**', group: 'internal'},
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'never',
        },
      ],
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            ...features.map(feature => ({
              target: `./src/features/${feature}`,
              from: './src/features',
              except: [`./${feature}`],
              message: 'no cross-feature imports',
            })),
            {
              target: './src/features',
              from: './src/app',
              message: 'features must not import from app',
            },
            {
              target: './src/**/!(*.dev).{js,jsx}',
              from: './tests',
              message: 'only dev fixture pages may import from tests',
            },
            ...sharedOnlyBoundaries.map(({targets, message}) => ({
              target: targets,
              from: ['./src/features', './src/app'],
              message,
            })),
          ],
        },
      ],
    },
  },
  {
    files: ['src/**', 'tests/**'],
    ignores: ['src/app/**'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        {'**/*.{js,jsx}': 'KEBAB_CASE'},
        {ignoreMiddleExtensions: true},
      ],
      'check-file/folder-naming-convention': ['error', {'**/*': 'KEBAB_CASE'}],
    },
  },
  {
    files: ['src/features/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: [
            {
              group: ['@/features/*'],
              message: 'no cross-feature imports',
            },
          ],
        },
      ],
    },
  },
  ...sharedOnlyBoundaries.map(({targets, message}) => ({
    files: targets.map(target => `${target.slice(2)}/**`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: restrictedImportPaths,
          patterns: [{group: ['@/features/*', '@/app/*'], message}],
        },
      ],
    },
  })),
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-syntax': ['error', ...restrictedClassSelectors],
    },
  },
  {
    files: ['src/components/table/table-provider.js'],
    rules: {
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    files: ['src/components/ui/**'],
    rules: {
      'import/order': 'off',
      'import/no-default-export': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);

export default eslintConfig;
