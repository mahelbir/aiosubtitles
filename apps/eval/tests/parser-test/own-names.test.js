import {describe, expect, it} from 'vitest';
import {
  extractListNames,
  readOwnNames,
} from '../../src/parser-test/datasets/own-names.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';

const LIST_BLOB = {
  subtitles: [
    {
      id: '[AltyazıDB] ✓ Ücretsiz | Film Name (12)',
      url: 'https://pool.example/languages=tr&ui=tr&auth=FAKE-AUTH-0009/adb/tr/1-2-3.srt',
      lang: 'tur',
      label: '[AltyazıDB] ✓ Ücretsiz | Film Name (12)',
    },
    {
      id: '[SubDL] ✓ Ücretsiz | A.Name.WEB _ B_Name.HDTV  (2)',
      url: 'https://pool.example/languages=tr&ui=tr&auth=FAKE-AUTH-0009/sd/tr/4.srt',
      lang: 'tur',
      label: '[SubDL] ✓ Ücretsiz | A.Name.WEB _ B_Name.HDTV ',
    },
    {
      id: '[OpenSubtitles] 1 hak harcar · bugün 9 kaldı | Show | Part - One',
      url: 'https://pool.example/languages=tr&ui=tr&auth=FAKE-AUTH-0009/sub/tr/tt1/5.srt',
      lang: 'tur',
      label: '[OpenSubtitles] 1 hak harcar · bugün 9 kaldı | Show | Part - One',
    },
    {
      id: '[TheSubtitleDB] ✓ Ücretsiz | A.Name.WEB',
      url: 'https://tsdb.example/get/6',
      lang: 'tur',
      label: '[TheSubtitleDB] ✓ Ücretsiz | A.Name.WEB',
    },
  ],
};

const FIXTURE_OWN_NAMES = [
  'Fixture Film (2019)',
  'Fixture.Film.2019.1080p',
  'Fixture.Show.S01E01.1080p.WEB-FAKE',
  'Fixture_Show_S01E01',
  'Fixture.Show.S01E01.720p',
  'Fixture.Show.S01E01.WEB',
  'Fixture.Show.S01E01.HDTV',
  'Fixture Show 01',
  'Fixture Unreferenced Film (12)',
  'Fixture.Show.S01E01.1080p.WEB-FAKE.mkv',
  'Fixture.Show.S01E01.720p.TWIN.mkv',
  'Fixture.Film.2019.1080p.mp4',
  'Fixture.Other.Video.mkv',
];

describe('extractListNames', () => {
  it('takes the names after the first separator of each label, split, trimmed and deduped', () => {
    expect(extractListNames(LIST_BLOB)?.toSorted()).toEqual(
      [
        'Film Name (12)',
        'A.Name.WEB',
        'B_Name.HDTV',
        'Show | Part - One',
      ].toSorted(),
    );
  });

  it('keeps a name that ends in a short number in parentheses', () => {
    expect(extractListNames(LIST_BLOB)).toContain('Film Name (12)');
    expect(extractListNames(LIST_BLOB)).not.toContain('Film Name');
  });
});

describe('readOwnNames', () => {
  it('returns the sorted distinct video and list names of the corpus', async () => {
    expect(await readOwnNames({atlasRoot: ATLAS_FIXTURE_ROOT})).toEqual(
      FIXTURE_OWN_NAMES.toSorted(),
    );
  });

  it('reads a frozen list that no case references', async () => {
    expect(await readOwnNames({atlasRoot: ATLAS_FIXTURE_ROOT})).toContain(
      'Fixture Unreferenced Film (12)',
    );
  });

  it('skips frozen blobs that are not lists', async () => {
    const ownNames = await readOwnNames({atlasRoot: ATLAS_FIXTURE_ROOT});
    expect(ownNames).toHaveLength(FIXTURE_OWN_NAMES.length);
    expect(ownNames).not.toContain('Fixture.Not.A.List.Name');
  });
});
