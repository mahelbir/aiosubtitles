import {beforeAll, describe, expect, it} from 'vitest';
import {
  getPrivateValues,
  readOwnPrivateValues,
  readReportPrivateValues,
} from '../src/corpus/private-values.js';
import {readCorpus} from '../src/corpus/read-corpus.js';
import {
  FIXTURE_PRIVATE_VALUES,
  ATLAS_FIXTURE_ROOT,
} from './support/atlas-fixture.js';

describe('getPrivateValues', () => {
  let privateValues;

  beforeAll(async () => {
    privateValues = getPrivateValues(
      await readCorpus({atlasRoot: ATLAS_FIXTURE_ROOT}),
    );
  });

  it('collects video file names, release names and video hashes', () => {
    expect(privateValues).toEqual(
      expect.arrayContaining(FIXTURE_PRIVATE_VALUES),
    );
  });

  it('collects every rowId and label, served or not', () => {
    expect(privateValues).toEqual(
      expect.arrayContaining([
        '[TheSubtitleDB] ✓ Ücretsiz | Fixture Show S01E01',
        '[AltyazıDB] ✓ Ücretsiz · HI | Fixture.Show.S01E01.1080p.WEB-FAKE (2)',
        '[AltyazıDB] ✓ Ücretsiz · HI | Fixture.Show.S01E01.1080p.WEB-FAKE',
        'Fixture.Show.S01E01.HDTV',
      ]),
    );
  });

  it('collects the raw and track hashes and the content keys', () => {
    expect(privateValues).toEqual(
      expect.arrayContaining([
        'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
        'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
        '11111111111111111111111111111111',
      ]),
    );
  });

  it('lists each value once and skips missing ones', () => {
    expect(new Set(privateValues).size).toBe(privateValues.length);
    expect(privateValues.every(privateValue => privateValue)).toBe(true);
  });
});

describe('readOwnPrivateValues', () => {
  let ownPrivateValues;

  beforeAll(async () => {
    ownPrivateValues = await readOwnPrivateValues({
      atlasRoot: ATLAS_FIXTURE_ROOT,
    });
  });

  it('collects the names, ids and labels of every frozen list, referenced or not', () => {
    expect(ownPrivateValues).toEqual(
      expect.arrayContaining([
        'Fixture Unreferenced Film (12)',
        '[OpenSubtitles] ✓ Ücretsiz | Fixture Unreferenced Film (12)',
        'Fixture.Show.S01E01.WEB',
        'Fixture.Show.S01E01.HDTV',
      ]),
    );
  });

  it('collects every video file name, including those outside the cases', () => {
    expect(ownPrivateValues).toEqual(
      expect.arrayContaining([
        'Fixture.Other.Video.mkv',
        'Fixture.Show.S01E01.720p.TWIN.mkv',
        'Fixture.Film.2019.1080p.mp4',
      ]),
    );
  });

  it('lists each value once', () => {
    expect(new Set(ownPrivateValues).size).toBe(ownPrivateValues.length);
  });
});

describe('readReportPrivateValues', () => {
  it('joins the corpus values and the own-name values', async () => {
    const reportPrivateValues = await readReportPrivateValues({
      atlasRoot: ATLAS_FIXTURE_ROOT,
    });
    expect(reportPrivateValues).toEqual(
      expect.arrayContaining([
        ...FIXTURE_PRIVATE_VALUES,
        'Fixture Unreferenced Film (12)',
        'Fixture.Other.Video.mkv',
      ]),
    );
    expect(new Set(reportPrivateValues).size).toBe(reportPrivateValues.length);
  });
});
