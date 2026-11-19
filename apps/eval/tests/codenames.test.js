import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  CodenamesFileError,
  IDENTITY_CODENAMES,
  loadCodenames,
} from '../src/codenames.js';

const EXAMPLE_PATH = join(import.meta.dirname, '..', 'codenames.example.json');

const MAPPED_NAMES = {
  atlas: 'Corpus Project',
  orion: 'Pool Addon',
  lyra: 'Sense Addon',
  vega: 'Maker Addon',
};

describe('loadCodenames', () => {
  let codenamesDir;
  let codenamesPath;

  beforeEach(async () => {
    codenamesDir = await mkdtemp(join(tmpdir(), 'eval-codenames-'));
    codenamesPath = join(codenamesDir, 'codenames.local.json');
  });

  afterEach(async () => {
    await rm(codenamesDir, {recursive: true, force: true});
  });

  it('maps every codename to itself when the file is absent', async () => {
    expect(await loadCodenames(codenamesPath)).toEqual({
      atlas: 'atlas',
      orion: 'orion',
      lyra: 'lyra',
      vega: 'vega',
    });
  });

  it('reads the name of every codename from the file', async () => {
    await writeFile(
      codenamesPath,
      JSON.stringify({...MAPPED_NAMES, extra: 'Ignored'}),
    );
    expect(await loadCodenames(codenamesPath)).toEqual(MAPPED_NAMES);
  });

  it.each([
    ['a missing codename', JSON.stringify({...MAPPED_NAMES, vega: undefined})],
    ['an empty name', JSON.stringify({...MAPPED_NAMES, lyra: ''})],
    [
      'a name that is not a string',
      JSON.stringify({...MAPPED_NAMES, orion: 1}),
    ],
    ['a file that is not an object', '[]'],
    ['a file that is not JSON', '{'],
  ])('rejects %s', async (_case, codenamesText) => {
    await writeFile(codenamesPath, codenamesText);
    await expect(loadCodenames(codenamesPath)).rejects.toBeInstanceOf(
      CodenamesFileError,
    );
  });

  it('keeps the tracked example in the shape the loader reads', async () => {
    const example = JSON.parse(await readFile(EXAMPLE_PATH, 'utf8'));
    expect(Object.keys(example)).toEqual(Object.keys(IDENTITY_CODENAMES));
    expect(await loadCodenames(EXAMPLE_PATH)).toEqual(example);
  });
});
