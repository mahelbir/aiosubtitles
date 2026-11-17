import {cp, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {CorpusShapeError, readCorpus} from '../src/corpus/read-corpus.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

const V90_LOCAL_SEGMENTS = ['eval', 'cache', 'corpus', 'V90', 'local.json'];

describe('readCorpus on a damaged corpus', () => {
  let atlasRoot;

  const changeV90Local = async change => {
    const localPath = join(atlasRoot, ...V90_LOCAL_SEGMENTS);
    const local = JSON.parse(await readFile(localPath, 'utf8'));
    change(local);
    await writeFile(localPath, JSON.stringify(local));
  };

  beforeEach(async () => {
    atlasRoot = await mkdtemp(join(tmpdir(), 'eval-atlas-'));
    await cp(ATLAS_FIXTURE_ROOT, atlasRoot, {recursive: true});
  });

  afterEach(async () => {
    await rm(atlasRoot, {recursive: true, force: true});
  });

  it('rejects a pool list whose row ids do not pair with poolList', async () => {
    await changeV90Local(local => {
      local.lists.Orion.rowIds.pop();
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

  it('leaves label and site identity null for a row missing from the list blob', async () => {
    await changeV90Local(local => {
      local.lists.Orion.rowIds[2] = '[SubSource] ✓ Ücretsiz | Renamed_Row';
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
