import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ConfidenceWord,
  SubtitleFileExtension,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {buildStremioSubtitles} from '../../../src/lib/stremio-row/build-stremio-subtitles.js';
import {
  BASE_URL,
  makeRankedRow,
  URL_CODE,
  USER_CONFIG_ID,
} from '../../helpers/stremio-row.js';

const ALTYAZIDB_NAME = SubtitleSource.label(SubtitleSource.ALTYAZIDB);
const OPENSUBTITLES_NAME = SubtitleSource.label(SubtitleSource.OPENSUBTITLES);
const OWN_RELEASE_NAME = 'Show.S01E01.720p.HDTV-KILLERS';
const CLOSEST_RELEASE_NAME = 'Show.S01E01.1080p.WEB-DL-NTb';
const VIDEO_ID = 'tt1:1:1';

const build = rankedRows =>
  buildStremioSubtitles({
    baseUrl: BASE_URL,
    userConfigId: USER_CONFIG_ID,
    videoId: VIDEO_ID,
    rankedRows,
  });

describe('buildStremioSubtitles', () => {
  it('keeps the own release name in id and the closest one in label', () => {
    const rows = build([
      makeRankedRow({
        urlCode: URL_CODE,
        subtitleSource: SubtitleSource.ALTYAZIDB,
        releaseNames: [OWN_RELEASE_NAME, CLOSEST_RELEASE_NAME],
        subtitleFileName: CLOSEST_RELEASE_NAME,
      }),
    ]);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.id).toBe(`${ALTYAZIDB_NAME} · ${OWN_RELEASE_NAME} · 3fa9c2d1`);
    expect(row.label.endsWith(CLOSEST_RELEASE_NAME)).toBe(true);
    expect(row.subtitleFileName).toBe(CLOSEST_RELEASE_NAME);
  });

  it('builds the whole Stremio object from a ranked row', () => {
    const rows = build([
      makeRankedRow({
        urlCode: URL_CODE,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        languageCode: 'tur',
        fileExtension: SubtitleFileExtension.ASS,
        releaseNames: [CLOSEST_RELEASE_NAME],
        subtitleFileName: CLOSEST_RELEASE_NAME,
        confidenceWord: ConfidenceWord.EXACT,
        isHearingImpaired: true,
        isForced: null,
        isMachineTranslated: false,
        isQuotaCostly: true,
      }),
    ]);
    expect(rows).toEqual([
      {
        id: `${OPENSUBTITLES_NAME} · ${CLOSEST_RELEASE_NAME} · 3fa9c2d1`,
        url: `${BASE_URL}/addon/${USER_CONFIG_ID}/subtitle-files/${VIDEO_ID}/${URL_CODE}.ass`,
        lang: 'tur',
        label: `$ · ${ConfidenceWord.label(ConfidenceWord.EXACT)} · ${OPENSUBTITLES_NAME} · HI · ${CLOSEST_RELEASE_NAME}`,
        subtitleFileName: CLOSEST_RELEASE_NAME,
      },
    ]);
  });

  it('omits subtitleFileName when the row has no release name', () => {
    const rows = build([
      makeRankedRow({
        urlCode: URL_CODE,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        releaseNames: [],
        subtitleFileName: null,
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('subtitleFileName');
    expect(rows[0].id).toBe(`${OPENSUBTITLES_NAME} · 3fa9c2d1`);
    expect(rows[0].label).toBe(OPENSUBTITLES_NAME);
  });

  it('omits a blank subtitleFileName the same way the label skips it', () => {
    const rows = build([
      makeRankedRow({
        urlCode: URL_CODE,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        releaseNames: [CLOSEST_RELEASE_NAME],
        subtitleFileName: '  ',
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('subtitleFileName');
    expect(rows[0].label).toBe(OPENSUBTITLES_NAME);
  });

  it('switches ids to the full code when long names differ only after the cut', () => {
    const sharedStart = 'Show.S01E01.'.repeat(30);
    const makeRow = (urlCode, releaseName) =>
      makeRankedRow({
        urlCode,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        releaseNames: [releaseName],
        subtitleFileName: releaseName,
      });
    const firstCode = `3fa9c2d1${'a'.repeat(56)}`;
    const secondCode = `3fa9c2d1${'b'.repeat(56)}`;
    const rows = build([
      makeRow(firstCode, `${sharedStart}1080p-NTb`),
      makeRow(secondCode, `${sharedStart}720p-KILLERS`),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].id.endsWith(` · ${firstCode}`)).toBe(true);
    expect(rows[1].id.endsWith(` · ${secondCode}`)).toBe(true);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it('drops rows whose url cannot be built', () => {
    const rows = buildStremioSubtitles({
      baseUrl: BASE_URL,
      userConfigId: USER_CONFIG_ID,
      videoId: 't'.repeat(129),
      rankedRows: [makeRankedRow({urlCode: URL_CODE})],
    });
    expect(rows).toEqual([]);
  });

  it('switches colliding ids to the full code and keeps the others short', () => {
    const firstCode = `3fa9c2d1${'a'.repeat(56)}`;
    const secondCode = `3fa9c2d1${'b'.repeat(56)}`;
    const otherCode = `0123abcd${'c'.repeat(56)}`;
    const makeRow = urlCode =>
      makeRankedRow({
        urlCode,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        releaseNames: [CLOSEST_RELEASE_NAME],
        subtitleFileName: CLOSEST_RELEASE_NAME,
      });
    const rows = build([
      makeRow(firstCode),
      makeRow(otherCode),
      makeRow(secondCode),
    ]);
    expect(rows.map(row => row.id)).toEqual([
      `${OPENSUBTITLES_NAME} · ${CLOSEST_RELEASE_NAME} · ${firstCode}`,
      `${OPENSUBTITLES_NAME} · ${CLOSEST_RELEASE_NAME} · 0123abcd`,
      `${OPENSUBTITLES_NAME} · ${CLOSEST_RELEASE_NAME} · ${secondCode}`,
    ]);
  });

  it('never starts an id with error. or notice-', () => {
    const releaseNameSets = [
      ['error.rate-limited'],
      ['notice-opensubtitles-account'],
      [],
    ];
    const rankedRows = SubtitleSource.values.flatMap(
      (subtitleSource, sourceIndex) =>
        releaseNameSets.map((releaseNames, setIndex) =>
          makeRankedRow({
            urlCode: `${sourceIndex}-${setIndex}`.padEnd(64, '0'),
            subtitleSource,
            releaseNames,
            subtitleFileName: releaseNames[0] ?? null,
          }),
        ),
    );
    const rows = build(rankedRows);
    expect(rows).toHaveLength(rankedRows.length);
    for (const row of rows) {
      expect(row.id.startsWith('error.')).toBe(false);
      expect(row.id.startsWith('notice-')).toBe(false);
    }
  });
});
