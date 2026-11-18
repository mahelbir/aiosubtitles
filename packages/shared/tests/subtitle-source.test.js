import {describe, expect, it} from 'vitest';
import {CredentialKind} from '../src/constants/credential.js';
import {
  CredentialRequirement,
  SubtitleSource,
} from '../src/constants/subtitle-source.js';

const SUBTITLE_SOURCES = [
  ['opensubtitles', 'OpenSubtitles', 1, 'optional', ['account', 'api-key'], 10],
  ['opensubtitles-v3', 'OpenSubtitles v3', 1, 'none', [], 0],
  ['altyazidb', 'AltyazıDB', 1, 'required', ['api-key'], 10],
  ['thesubtitledb', 'TheSubtitleDB', 1, 'optional', ['api-key'], 10],
  ['subsource', 'SubSource', 1, 'required', ['api-key'], 10],
  ['anisub', 'AniSub', 1, 'optional', ['access-token'], 1],
  ['subdl', 'SubDL', 2, 'required', ['api-key'], 10],
  ['wyzie', 'Wyzie', 2, 'required', ['api-key'], 10],
  ['jimaku', 'Jimaku', 2, 'none', [], 0],
  [
    'stremio-community-subtitles',
    'Community Subtitles',
    2,
    'required',
    ['access-token'],
    1,
  ],
  ['gestdown', 'Gestdown', 2, 'none', [], 0],
  ['animetosho', 'AnimeTosho', 2, 'none', [], 0],
  ['yify', 'YIFY', 2, 'none', [], 0],
  ['tvsubtitles', 'TVsubtitles', 2, 'none', [], 0],
  ['betaseries', 'BetaSeries', 2, 'required', ['api-key'], 10],
];
const SUBTITLE_SOURCE_CREDENTIALS = SUBTITLE_SOURCES.map(
  ([subtitleSource, , , , credentialKinds, credentialLimit]) => [
    subtitleSource,
    credentialKinds,
    credentialLimit,
  ],
);

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

  it.each(SUBTITLE_SOURCE_CREDENTIALS)(
    'takes the credentials of %s',
    (subtitleSource, credentialKinds, credentialLimit) => {
      const subtitleSourceItem = SubtitleSource.item(subtitleSource);
      expect(subtitleSourceItem.credentialKinds).toEqual(credentialKinds);
      expect(subtitleSourceItem.credentialLimit).toBe(credentialLimit);
      expect(
        subtitleSourceItem.credentialKinds.every(credentialKind =>
          CredentialKind.has(credentialKind),
        ),
      ).toBe(true);
    },
  );

  it('lists every source with its credential fields through toList', () => {
    const subtitleSourceList = SubtitleSource.toList({
      extra: subtitleSourceItem => ({
        credentialKinds: subtitleSourceItem.raw.credentialKinds,
        credentialLimit: subtitleSourceItem.raw.credentialLimit,
      }),
    });

    expect(
      subtitleSourceList.map(({value, credentialKinds, credentialLimit}) => [
        value,
        credentialKinds,
        credentialLimit,
      ]),
    ).toEqual(SUBTITLE_SOURCE_CREDENTIALS);
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
