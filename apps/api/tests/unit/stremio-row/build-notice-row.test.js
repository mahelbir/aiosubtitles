import {describe, expect, it} from 'vitest';
import {buildNoticeRow} from '../../../src/lib/stremio-row/build-notice-row.js';
import {SubtitleNotice} from '../../../src/lib/stremio-row/stremio-row-enums.js';
import {BASE_URL, USER_CONFIG_ID} from '../../helpers/stremio-row.js';

const HIDDEN_SUBTITLE_COUNT = 7;

describe('buildNoticeRow', () => {
  it('builds the OpenSubtitles account notice with the hidden subtitle count', () => {
    const noticeRow = buildNoticeRow({
      baseUrl: BASE_URL,
      userConfigId: USER_CONFIG_ID,
      subtitleNotice: SubtitleNotice.OPENSUBTITLES_ACCOUNT,
      languageCode: 'tur',
      hiddenSubtitleCount: HIDDEN_SUBTITLE_COUNT,
    });
    expect(noticeRow).toEqual({
      id: 'notice-opensubtitles-account',
      url: `${BASE_URL}/addon/${USER_CONFIG_ID}/subtitle-notices/opensubtitles-account.srt`,
      lang: 'tur',
      label: SubtitleNotice.label(SubtitleNotice.OPENSUBTITLES_ACCOUNT).replace(
        '{hiddenSubtitleCount}',
        String(HIDDEN_SUBTITLE_COUNT),
      ),
    });
    expect(noticeRow.label).toContain(` ${HIDDEN_SUBTITLE_COUNT} `);
    expect(noticeRow.label).not.toContain('{');
  });

  it('has no subtitleFileName key', () => {
    const noticeRow = buildNoticeRow({
      baseUrl: BASE_URL,
      userConfigId: USER_CONFIG_ID,
      subtitleNotice: SubtitleNotice.OPENSUBTITLES_ACCOUNT,
      languageCode: 'eng',
      hiddenSubtitleCount: 1,
    });
    expect(Object.keys(noticeRow)).toEqual(
      expect.arrayContaining(['id', 'url', 'lang', 'label']),
    );
    expect(noticeRow).not.toHaveProperty('subtitleFileName');
  });
});
