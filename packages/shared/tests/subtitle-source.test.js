import {describe, expect, it} from 'vitest';
import {
  CredentialRequirement,
  SubtitleSource,
} from '../src/constants/subtitle-source.js';

const SUBTITLE_SOURCES = [
  ['opensubtitles', 'OpenSubtitles', 1, 'optional'],
  ['opensubtitles-v3', 'OpenSubtitles v3', 1, 'none'],
  ['altyazidb', 'AltyazıDB', 1, 'required'],
  ['thesubtitledb', 'TheSubtitleDB', 1, 'optional'],
  ['subsource', 'SubSource', 1, 'required'],
  ['anisub', 'AniSub', 1, 'optional'],
  ['subdl', 'SubDL', 2, 'required'],
  ['wyzie', 'Wyzie', 2, 'required'],
  ['jimaku', 'Jimaku', 2, 'none'],
  ['stremio-community-subtitles', 'Community Subtitles', 2, 'required'],
  ['gestdown', 'Gestdown', 2, 'none'],
  ['animetosho', 'AnimeTosho', 2, 'none'],
  ['yify', 'YIFY', 2, 'none'],
  ['tvsubtitles', 'TVsubtitles', 2, 'none'],
  ['betaseries', 'BetaSeries', 2, 'required'],
];

describe('CredentialRequirement', () => {
  it('lists required, optional and none', () => {
    expect(CredentialRequirement.REQUIRED).toBe('required');
    expect(CredentialRequirement.OPTIONAL).toBe('optional');
    expect(CredentialRequirement.NONE).toBe('none');
    expect(CredentialRequirement.values).toEqual([
      'required',
      'optional',
      'none',
    ]);
  });
});

describe('SubtitleSource', () => {
  it('lists the 15 sources in spec order', () => {
    expect(SubtitleSource.values).toEqual(
      SUBTITLE_SOURCES.map(([subtitleSource]) => subtitleSource),
    );
  });

  it('names members in constant case', () => {
    expect(SubtitleSource.OPENSUBTITLES).toBe('opensubtitles');
    expect(SubtitleSource.OPENSUBTITLES_V3).toBe('opensubtitles-v3');
    expect(SubtitleSource.STREMIO_COMMUNITY_SUBTITLES).toBe(
      'stremio-community-subtitles',
    );
    expect(SubtitleSource.BETASERIES).toBe('betaseries');
  });

  it('labels the community source as Community Subtitles', () => {
    expect(SubtitleSource.label('stremio-community-subtitles')).toBe(
      'Community Subtitles',
    );
  });

  it.each(SUBTITLE_SOURCES)(
    'describes %s',
    (subtitleSource, label, subtitleSourcePhase, credentialRequirement) => {
      const subtitleSourceItem = SubtitleSource.item(subtitleSource);
      expect(subtitleSourceItem.label).toBe(label);
      expect(subtitleSourceItem.subtitleSourcePhase).toBe(subtitleSourcePhase);
      expect(subtitleSourceItem.credentialRequirement).toBe(
        credentialRequirement,
      );
      expect(
        CredentialRequirement.has(subtitleSourceItem.credentialRequirement),
      ).toBe(true);
    },
  );
});
