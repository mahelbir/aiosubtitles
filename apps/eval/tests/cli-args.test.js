import {describe, expect, it} from 'vitest';
import {EvalUsageError, parseEvalArgs} from '../src/cli-args.js';

const ABSOLUTE_MESSAGE = '--atlas must be an absolute path.';

describe('parseEvalArgs', () => {
  it('reads the inspect command with an absolute Atlas root', () => {
    expect(parseEvalArgs(['inspect', '--atlas', '/data/atlas'])).toEqual({
      command: 'inspect',
      atlasRoot: '/data/atlas',
      commandOptions: {},
    });
  });

  it('rejects a relative Atlas root', () => {
    expect(() => parseEvalArgs(['inspect', '--atlas', 'rel/path'])).toThrow(
      EvalUsageError,
    );
    expect(() => parseEvalArgs(['inspect', '--atlas', 'rel/path'])).toThrow(
      ABSOLUTE_MESSAGE,
    );
  });

  it('rejects a missing Atlas root', () => {
    expect(() => parseEvalArgs(['inspect'])).toThrow(EvalUsageError);
  });

  it('rejects an unknown command', () => {
    expect(() =>
      parseEvalArgs(['unknown-command', '--atlas', '/data/atlas']),
    ).toThrow(EvalUsageError);
  });

  it('rejects a missing command', () => {
    expect(() => parseEvalArgs(['--atlas', '/data/atlas'])).toThrow(
      EvalUsageError,
    );
  });

  it.each([
    ['an undeclared option', ['inspect', '--atlas', '/x', '--bogus', 'y']],
    ['a missing option value', ['inspect', '--atlas']],
    ['a positional argument', ['inspect', 'extra', '--atlas', '/x']],
  ])('ends the message for %s with punctuation', (_label, argv) => {
    expect(() => parseEvalArgs(argv)).toThrow(/[.!?]$/);
  });

  it('rejects an empty argument list', () => {
    expect(() => parseEvalArgs([])).toThrow(EvalUsageError);
  });

  it('rejects an option the command does not declare', () => {
    expect(() =>
      parseEvalArgs(['inspect', '--atlas', '/data/atlas', '--bogus', 'x']),
    ).toThrow(EvalUsageError);
  });

  it('gives usage errors a name', () => {
    expect(new EvalUsageError('x').name).toBe('EvalUsageError');
  });
});
