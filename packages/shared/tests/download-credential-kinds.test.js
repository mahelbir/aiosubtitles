import {describe, expect, it} from 'vitest';
import {CredentialKind} from '../src/constants/credential.js';
import {SubtitleSource} from '../src/constants/subtitle-source.js';
import {listDownloadCredentialKinds} from '../src/lib/download-credential-kinds.js';

describe('listDownloadCredentialKinds', () => {
  it('downloads from OpenSubtitles with an account only', () => {
    expect(listDownloadCredentialKinds(SubtitleSource.OPENSUBTITLES)).toEqual([
      CredentialKind.ACCOUNT,
    ]);
  });

  it.each([
    [SubtitleSource.WYZIE, [CredentialKind.API_KEY]],
    [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES, [CredentialKind.ACCESS_TOKEN]],
    [SubtitleSource.YIFY, []],
  ])(
    'downloads from %s with every credential kind it takes',
    (subtitleSource, credentialKinds) => {
      expect(listDownloadCredentialKinds(subtitleSource)).toEqual(
        credentialKinds,
      );
    },
  );

  it('knows no credential kind for an unknown source', () => {
    expect(listDownloadCredentialKinds('not-a-source')).toEqual([]);
  });
});
