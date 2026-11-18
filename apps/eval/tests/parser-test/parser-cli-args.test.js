import {describe, expect, it} from 'vitest';
import {EvalUsageError, parseEvalArgs} from '../../src/cli-args.js';

const ATLAS_ARGS = ['--atlas', '/data/atlas'];

const PARSER_TEST_ARGS = [
  'parser-test',
  ...ATLAS_ARGS,
  '--parser-labels',
  '/data/private/parser-labels.json',
  '--guessit-output',
  '/data/private/guessit-output.json',
  '--report-date',
  '2026-11-18',
];

const replaceOption = (argv, optionName, optionValue) =>
  argv.map((argument, argumentIndex) =>
    argv[argumentIndex - 1] === optionName ? optionValue : argument,
  );

const dropOption = (argv, optionName) => {
  const optionIndex = argv.indexOf(optionName);
  return argv.filter(
    (_, argumentIndex) =>
      argumentIndex !== optionIndex && argumentIndex !== optionIndex + 1,
  );
};

const expectUsageError = (argv, message) => {
  expect(() => parseEvalArgs(argv)).toThrow(EvalUsageError);
  expect(() => parseEvalArgs(argv)).toThrow(message);
};

describe('parseEvalArgs export-names', () => {
  it('reads the names output path', () => {
    expect(
      parseEvalArgs([
        'export-names',
        ...ATLAS_ARGS,
        '--names-output',
        '/data/private/parser-names.json',
      ]),
    ).toEqual({
      command: 'export-names',
      atlasRoot: '/data/atlas',
      commandOptions: {'names-output': '/data/private/parser-names.json'},
    });
  });

  it('requires an absolute names output path', () => {
    expectUsageError(
      ['export-names', ...ATLAS_ARGS, '--names-output', 'parser-names.json'],
      '--names-output must be an absolute path.',
    );
  });

  it('requires the names output path', () => {
    expectUsageError(
      ['export-names', ...ATLAS_ARGS],
      '--names-output is required.',
    );
  });
});

describe('parseEvalArgs export-disagreements', () => {
  it('reads the guessit output and pending labels paths', () => {
    expect(
      parseEvalArgs([
        'export-disagreements',
        ...ATLAS_ARGS,
        '--guessit-output',
        '/data/private/guessit-output.json',
        '--pending-output',
        '/data/private/parser-labels-pending.json',
      ]),
    ).toEqual({
      command: 'export-disagreements',
      atlasRoot: '/data/atlas',
      commandOptions: {
        'guessit-output': '/data/private/guessit-output.json',
        'pending-output': '/data/private/parser-labels-pending.json',
      },
    });
  });

  it('requires an absolute pending labels path', () => {
    expectUsageError(
      [
        'export-disagreements',
        ...ATLAS_ARGS,
        '--guessit-output',
        '/data/private/guessit-output.json',
        '--pending-output',
        'pending.json',
      ],
      '--pending-output must be an absolute path.',
    );
  });
});

describe('parseEvalArgs parser-test', () => {
  it('reads the labels path, the guessit output path and the report date', () => {
    expect(parseEvalArgs(PARSER_TEST_ARGS)).toEqual({
      command: 'parser-test',
      atlasRoot: '/data/atlas',
      commandOptions: {
        'parser-labels': '/data/private/parser-labels.json',
        'guessit-output': '/data/private/guessit-output.json',
        'report-date': '2026-11-18',
      },
    });
  });

  it.each(['2026-1-18', '18-11-2026', '2026/11/18', 'today'])(
    'rejects the report date %s',
    reportDate => {
      expectUsageError(
        replaceOption(PARSER_TEST_ARGS, '--report-date', reportDate),
        '--report-date must be YYYY-MM-DD.',
      );
    },
  );

  it('requires the report date instead of reading the clock', () => {
    expectUsageError(
      dropOption(PARSER_TEST_ARGS, '--report-date'),
      '--report-date is required.',
    );
  });

  it('requires an absolute labels path', () => {
    expectUsageError(
      replaceOption(PARSER_TEST_ARGS, '--parser-labels', 'labels.json'),
      '--parser-labels must be an absolute path.',
    );
  });

  it('requires an absolute guessit output path', () => {
    expectUsageError(
      replaceOption(PARSER_TEST_ARGS, '--guessit-output', 'guessit.json'),
      '--guessit-output must be an absolute path.',
    );
  });

  it('requires the guessit output path', () => {
    expectUsageError(
      dropOption(PARSER_TEST_ARGS, '--guessit-output'),
      '--guessit-output is required.',
    );
  });
});
