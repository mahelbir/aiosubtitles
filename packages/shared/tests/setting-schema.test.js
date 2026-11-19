import {describe, expect, it} from 'vitest';
import {CredentialKind} from '../src/constants/credential.js';
import {SubtitleSource} from '../src/constants/subtitle-source.js';
import {
  getSharedCredentialsField,
  settingsDefinition,
} from '../src/schemas/setting.js';

const EMPTY_SHARED_CREDENTIALS = {
  opensubtitles: {apiKey: []},
  thesubtitledb: {apiKey: []},
  anisub: {accessToken: []},
  jimaku: {apiKey: []},
  betaseries: {apiKey: []},
};

function parseSharedCredentials(sharedCredentials) {
  return settingsDefinition.schema.parse({sharedCredentials}).sharedCredentials;
}

function isSharedCredentialsValid(sharedCredentials) {
  return settingsDefinition.schema.safeParse({sharedCredentials}).success;
}

describe('settingsDefinition shared credentials', () => {
  it('reads an empty file as no shared credential for any source and kind', () => {
    expect(settingsDefinition.schema.parse({}).sharedCredentials).toEqual(
      EMPTY_SHARED_CREDENTIALS,
    );
  });

  it('fills the sources and kinds a partial group leaves out', () => {
    expect(
      parseSharedCredentials({
        jimaku: {apiKey: [{apiKey: 'jimaku-shared-a'}]},
      }),
    ).toEqual({
      ...EMPTY_SHARED_CREDENTIALS,
      jimaku: {apiKey: [{apiKey: 'jimaku-shared-a'}]},
    });
  });

  it('keeps each secret part as written and drops a repeated entry', () => {
    expect(
      parseSharedCredentials({
        betaseries: {
          apiKey: [
            {apiKey: ' betaseries-shared-a '},
            {apiKey: 'betaseries-shared-b'},
            {apiKey: ' betaseries-shared-a '},
          ],
        },
      }).betaseries,
    ).toEqual({
      apiKey: [
        {apiKey: ' betaseries-shared-a '},
        {apiKey: 'betaseries-shared-b'},
      ],
    });
  });

  it('parses its own output to the same value, so a stored round trip stays valid', () => {
    const parsedSettings = settingsDefinition.schema.parse({
      sharedCredentials: {
        anisub: {accessToken: [{accessToken: 'anisub-shared'}]},
      },
    });

    expect(settingsDefinition.schema.parse(parsedSettings)).toEqual(
      parsedSettings,
    );
  });

  it.each([
    ['a plain list of secrets', {jimaku: ['jimaku-shared']}],
    ['a kind the source does not share', {opensubtitles: {account: []}}],
    ['a source that takes no shared credential', {subsource: {apiKey: []}}],
    [
      'a kind keyed by its kebab-case value',
      {jimaku: {[CredentialKind.API_KEY]: [{apiKey: 'jimaku-shared'}]}},
    ],
    ['an entry missing its secret part', {jimaku: {apiKey: [{}]}}],
    [
      'an entry with an unknown part',
      {jimaku: {apiKey: [{apikey: 'jimaku-shared'}]}},
    ],
    ['a blank secret part', {jimaku: {apiKey: [{apiKey: '   '}]}}],
    ['a secret part that is not a string', {jimaku: {apiKey: [{apiKey: 42}]}}],
  ])('rejects %s', (caseName, sharedCredentials) => {
    expect(isSharedCredentialsValid(sharedCredentials)).toBe(false);
  });

  it('keeps the shared credentials a server field, out of every editable schema', () => {
    expect(settingsDefinition.editableSchema.shape).not.toHaveProperty(
      'sharedCredentials',
    );
    expect(
      settingsDefinition.updateSchema.safeParse({
        sharedCredentials: EMPTY_SHARED_CREDENTIALS,
      }).success,
    ).toBe(false);
  });
});

describe('getSharedCredentialsField', () => {
  const sharedCredentialsField = getSharedCredentialsField({
    [SubtitleSource.OPENSUBTITLES]: [
      CredentialKind.API_KEY,
      CredentialKind.ACCOUNT,
    ],
  });

  it('gives every kind of a source its own list', () => {
    expect(
      sharedCredentialsField.parse({
        opensubtitles: {
          apiKey: [{apiKey: 'search-key'}],
          account: [{username: 'shared-user', password: 'shared password '}],
        },
      }),
    ).toEqual({
      opensubtitles: {
        apiKey: [{apiKey: 'search-key'}],
        account: [{username: 'shared-user', password: 'shared password '}],
      },
    });
  });

  it('takes one kind without the other', () => {
    expect(
      sharedCredentialsField.parse({
        opensubtitles: {
          account: [{username: 'shared-user', password: 'shared-password'}],
        },
      }),
    ).toEqual({
      opensubtitles: {
        apiKey: [],
        account: [{username: 'shared-user', password: 'shared-password'}],
      },
    });
  });

  it('rejects an entry of several parts that misses one', () => {
    expect(
      sharedCredentialsField.safeParse({
        opensubtitles: {account: [{username: 'shared-user'}]},
      }).success,
    ).toBe(false);
  });

  describe('for a source with a hyphenated value', () => {
    const hyphenatedField = getSharedCredentialsField({
      [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: [
        CredentialKind.ACCESS_TOKEN,
      ],
    });

    it('keys the source and kind in camelCase', () => {
      expect(
        hyphenatedField.parse({
          stremioCommunitySubtitles: {
            accessToken: [{accessToken: 'community-token'}],
          },
        }),
      ).toEqual({
        stremioCommunitySubtitles: {
          accessToken: [{accessToken: 'community-token'}],
        },
      });
    });

    it('rejects the source keyed by its kebab-case value', () => {
      expect(
        hyphenatedField.safeParse({
          [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: {
            accessToken: [{accessToken: 'community-token'}],
          },
        }).success,
      ).toBe(false);
    });
  });
});
