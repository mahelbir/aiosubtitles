import {isAbsolute} from 'node:path';
import {parseArgs} from 'node:util';
import {runInspect} from './commands/inspect.js';

const GLOBAL_OPTIONS = {atlas: {type: 'string'}};
const SENTENCE_END_PATTERN = /[.!?]?$/;

export const EVAL_COMMANDS = {
  inspect: {options: {}, run: runInspect},
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
  return {command, atlasRoot, commandOptions};
};
