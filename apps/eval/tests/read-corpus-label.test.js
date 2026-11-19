import {createHash} from 'node:crypto';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {readCorpus} from '../src/corpus/read-corpus.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

const LABEL_ROW_ID = '[AltyazıDB] ✓ Ücretsiz · HI | Fixture Pack (2)';
const TWIN_ROW_ID = '[TheSubtitleDB] ✓ Ücretsiz | Fixture.Film.2019.1080p';

const LIST_BLOB_TEXT = `${JSON.stringify(
  {
    subtitles: [
      {
        id: LABEL_ROW_ID,
        url: 'https://pool.example/languages=tr&ui=tr&auth=FAKE-AUTH-0004/adb/tr/1-2-3.srt',
        lang: 'tur',
        label: LABEL_ROW_ID,
      },
      {
        id: TWIN_ROW_ID,
        url: 'https://tsdb.example/get/6001',
        lang: 'tur',
        label: TWIN_ROW_ID,
      },
    ],
  },
  null,
  2,
)}\n`;

const readJson = async filePath => JSON.parse(await readFile(filePath, 'utf8'));

const writeJson = (filePath, jsonValue) =>
  writeFile(filePath, `${JSON.stringify(jsonValue, null, 2)}\n`, 'utf8');

const buildLabelledAtlas = async () => {
  const atlasRoot = await mkdtemp(join(tmpdir(), 'eval-label-'));
  await cp(ATLAS_FIXTURE_ROOT, atlasRoot, {recursive: true});
  const listSha256 = createHash('sha256').update(LIST_BLOB_TEXT).digest('hex');
  const blobFolder = join(
    atlasRoot,
    'eval',
    'cache',
    'frozen',
    'sha256',
    listSha256.slice(0, 2),
  );
  await mkdir(blobFolder, {recursive: true});
  await writeFile(join(blobFolder, listSha256), LIST_BLOB_TEXT, 'utf8');
  const localJsonPath = join(
    atlasRoot,
    'eval',
    'cache',
    'corpus',
    'V92',
    'local.json',
  );
  const localJson = await readJson(localJsonPath);
  localJson.lists.orion.sha256 = listSha256;
  localJson.lists.orion.rowIds = [LABEL_ROW_ID, TWIN_ROW_ID];
  localJson.candidates['V92/c1'].rowId = LABEL_ROW_ID;
  await writeJson(localJsonPath, localJson);
  return atlasRoot;
};

describe('readCorpus release names', () => {
  let atlasRoot;
  let candidateById;

  beforeAll(async () => {
    atlasRoot = await buildLabelledAtlas();
    const evalCases = await readCorpus({atlasRoot});
    candidateById = new Map(
      evalCases
        .flatMap(evalCase => evalCase.candidates)
        .map(candidate => [candidate.candidateId, candidate]),
    );
  });

  afterAll(async () => {
    await rm(atlasRoot, {recursive: true, force: true});
  });

  it('takes the release names from the list label, keeping a trailing (2)', () => {
    expect(candidateById.get('V92/c1').parsedRowId.releaseNames).toEqual([
      'Fixture Pack (2)',
    ]);
  });

  it('still takes the flags and the suffix from the rowId grammar', () => {
    expect(candidateById.get('V92/c1').parsedRowId).toMatchObject({
      subtitleSourceName: 'AltyazıDB',
      isFree: true,
      isHearingImpaired: true,
      duplicateIndex: 2,
    });
  });

  it('falls back to the rowId grammar for a row outside the current list', () => {
    expect(candidateById.get('V90/c3').parsedRowId.releaseNames).toEqual([
      'Fixture Show S01E01',
    ]);
  });
});
