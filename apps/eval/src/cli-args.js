import {isAbsolute} from 'node:path';
import {parseArgs} from 'node:util';
import {runExportDisagreements} from './commands/export-disagreements.js';
import {runExportNames} from './commands/export-names.js';
import {runInspect} from './commands/inspect.js';
import {runParserTestCommand} from './commands/parser-test.js';

const GLOBAL_OPTIONS = {atlas: {type: 'string'}};
const SENTENCE_END_PATTERN = /[.!?]?$/;
const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STRING_OPTION = {type: 'string'};

const ABSOLUTE_PATH_CHECK = {
  isValid: isAbsolute,
  problem: 'must be an absolute path',
};

const OPTION_CHECKS = {
  'names-output': ABSOLUTE_PATH_CHECK,
  'guessit-output': ABSOLUTE_PATH_CHECK,
  'pending-output': ABSOLUTE_PATH_CHECK,
  'parser-labels': ABSOLUTE_PATH_CHECK,
  'report-date': {
    isValid: optionValue => REPORT_DATE_PATTERN.test(optionValue),
    problem: 'must be YYYY-MM-DD',
  },
};

export const EVAL_COMMANDS = {
  inspect: {options: {}, run: runInspect},
  'export-names': {
    options: {'names-output': STRING_OPTION},
    run: runExportNames,
  },
  'export-disagreements': {
    options: {
      'guessit-output': STRING_OPTION,
      'pending-output': STRING_OPTION,
    },
    run: runExportDisagreements,
  },
  'parser-test': {
    options: {
      'parser-labels': STRING_OPTION,
      'guessit-output': STRING_OPTION,
      'report-date': STRING_OPTION,
    },
    run: runParserTestCommand,
  },
};

export class EvalUsageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EvalUsageError';
  }
}

const parseCommandArgs = (commandArgs, commandOptions) => {
  try {
    return parseArgs({
      args: commandArgs,
      options: {...GLOBAL_OPTIONS, ...commandOptions},
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw new EvalUsageError(error.message.replace(SENTENCE_END_PATTERN, '.'), {
      cause: error,
    });
  }
};

const assertCommandOptions = (optionNames, commandOptions) => {
  for (const optionName of optionNames) {
    const optionValue = commandOptions[optionName];
    if (optionValue === undefined) {
      throw new EvalUsageError(`--${optionName} is required.`);
    }
    const {isValid, problem} = OPTION_CHECKS[optionName];
    if (!isValid(optionValue)) {
      throw new EvalUsageError(`--${optionName} ${problem}.`);
    }
  }
};

export const parseEvalArgs = argv => {
  const [command, ...commandArgs] = argv;
  if (!Object.hasOwn(EVAL_COMMANDS, command ?? '')) {
    throw new EvalUsageError(
      `The first argument must be a command: ${Object.keys(EVAL_COMMANDS).join(', ')}.`,
    );
  }
  const {atlas: atlasRoot, ...commandOptions} = parseCommandArgs(
    commandArgs,
    EVAL_COMMANDS[command].options,
  );
  if (atlasRoot === undefined) {
    throw new EvalUsageError('--atlas is required.');
  }
  if (!isAbsolute(atlasRoot)) {
    throw new EvalUsageError('--atlas must be an absolute path.');
  }
  assertCommandOptions(
    Object.keys(EVAL_COMMANDS[command].options),
    commandOptions,
  );
  return {command, atlasRoot, commandOptions};
};
