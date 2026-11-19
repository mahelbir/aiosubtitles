import {readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {IDENTITY_CODENAMES} from '../src/codenames.js';
import {CorpusShapeError, readCorpus} from '../src/corpus/read-corpus.js';
import {
  changeLocalJson,
  copyAtlasFixture,
  renamePoolList,
} from './support/atlas-fixture.js';

const MAPPED_POOL_LIST_NAME = 'Fixture Pool';

describe('readCorpus on a damaged corpus', () => {
  let atlasRoot;

  const changeV90Local = change => changeLocalJson(atlasRoot, 'V90', change);

  beforeEach(async () => {
    atlasRoot = await copyAtlasFixture();
  });

  afterEach(async () => {
    await rm(atlasRoot, {recursive: true, force: true});
  });

  it('rejects a pool list whose row ids do not pair with poolList', async () => {
    await changeV90Local(local => {
      local.lists.orion.rowIds.pop();
    });
    await expect(readCorpus({atlasRoot})).rejects.toBeInstanceOf(
      CorpusShapeError,
    );
  });

  it('rejects a case candidate that local.json lacks', async () => {
    await changeV90Local(local => {
      delete local.candidates['V90/c3'];
    });
    await expect(readCorpus({atlasRoot})).rejects.toThrow(/^V90:/);
  });

  it('leaves the video hash null for a video without an identity', async () => {
    const identitiesPath = join(
      atlasRoot,
      'docs',
      'research',
      'private',
      'identities.json',
    );
    const identities = JSON.parse(await readFile(identitiesPath, 'utf8'));
    delete identities.videos.V92;
    await writeFile(identitiesPath, JSON.stringify(identities));
    const evalCases = await readCorpus({atlasRoot});
    expect(evalCases[1].video.videoHash).toBeNull();
  });

  it('reads the pool list under the name the codenames give orion', async () => {
    const identityCases = await readCorpus({atlasRoot});
    await renamePoolList(atlasRoot, MAPPED_POOL_LIST_NAME);
    const mappedCases = await readCorpus({
      atlasRoot,
      codenames: {...IDENTITY_CODENAMES, orion: MAPPED_POOL_LIST_NAME},
    });
    expect(mappedCases).toEqual(identityCases);
    await expect(readCorpus({atlasRoot})).rejects.toBeInstanceOf(TypeError);
  });

  it('leaves label and site identity null for a row missing from the list blob', async () => {
    await changeV90Local(local => {
      local.lists.orion.rowIds[2] = '[SubSource] ✓ Ücretsiz | Renamed_Row';
    });
    const [evalCase] = await readCorpus({atlasRoot});
    expect(evalCase.poolRows[2]).toEqual({
      servedIndex: 2,
      candidateId: 'V90/c4',
      rowId: '[SubSource] ✓ Ücretsiz | Renamed_Row',
      label: null,
      siteIdentity: null,
    });
  });
});
