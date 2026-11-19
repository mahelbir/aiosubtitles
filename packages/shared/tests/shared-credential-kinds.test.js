import {describe, expect, it} from 'vitest';
import {CredentialKind} from '../src/constants/credential.js';
import {SubtitleSource} from '../src/constants/subtitle-source.js';
import {
  listSharedCredentialKinds,
  SHARED_CREDENTIAL_KINDS_BY_SOURCE,
  toSharedCredentialsKey,
} from '../src/lib/shared-credential-kinds.js';

describe('listSharedCredentialKinds', () => {
  it('lists the kinds a source shares', () => {
    expect(listSharedCredentialKinds(SubtitleSource.ANISUB)).toEqual([
      CredentialKind.ACCESS_TOKEN,
    ]);
  });

  it('lists nothing for a source that shares no credential', () => {
    expect(listSharedCredentialKinds(SubtitleSource.SUBSOURCE)).toEqual([]);
  });

  it('lists nothing for an unknown source', () => {
    expect(listSharedCredentialKinds('unknown-source')).toEqual([]);
  });
});

describe('toSharedCredentialsKey', () => {
  it.each([
    [CredentialKind.API_KEY, 'apiKey'],
    [CredentialKind.ACCESS_TOKEN, 'accessToken'],
    [CredentialKind.ACCOUNT, 'account'],
    [SubtitleSource.OPENSUBTITLES_V3, 'opensubtitlesV3'],
    [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES, 'stremioCommunitySubtitles'],
  ])('keys %s as %s', (enumValue, settingsKey) => {
    expect(toSharedCredentialsKey(enumValue)).toBe(settingsKey);
  });
});

describe('SHARED_CREDENTIAL_KINDS_BY_SOURCE', () => {
  it('maps exactly the sources that share a credential to their kinds', () => {
    expect(SHARED_CREDENTIAL_KINDS_BY_SOURCE).toEqual({
      [SubtitleSource.OPENSUBTITLES]: [CredentialKind.API_KEY],
      [SubtitleSource.THESUBTITLEDB]: [CredentialKind.API_KEY],
      [SubtitleSource.ANISUB]: [CredentialKind.ACCESS_TOKEN],
      [SubtitleSource.JIMAKU]: [CredentialKind.API_KEY],
      [SubtitleSource.BETASERIES]: [CredentialKind.API_KEY],
    });
  });
});
