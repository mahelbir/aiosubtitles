import {describe, expect, it} from 'vitest';
import {z} from 'zod';
import {CredentialKind} from '../src/constants/credential.js';
import {SubtitleSource} from '../src/constants/subtitle-source.js';
import {
  CREDENTIAL_SECRET_LENGTH_MAX,
  SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
  SUBTITLE_LANGUAGE_LIMIT_MAX,
  SUBTITLE_LANGUAGE_LIMIT_MIN,
  USER_CONFIG_LANGUAGE_CODES_MAX,
  USER_CONFIG_LANGUAGE_CODES_MIN,
  USER_CONFIG_PASSWORD_LENGTH_MAX,
  USER_CONFIG_PASSWORD_LENGTH_MIN,
} from '../src/constants/user-config.js';
import {
  changeUserConfigPasswordSchema,
  createdUserConfigSchema,
  createUserConfigSchema,
  createUserConfigSessionSchema,
  deleteUserConfigSchema,
  getCredentialKindCheck,
  getCredentialLimitCheck,
  getCredentialSecretField,
  languageCodesField,
  listImprovementSwitchStatesField,
  maskedCredentialSchema,
  subtitleLanguageLimitField,
  subtitleSourceOptionSchema,
  subtitleSourceSwitchStatesField,
  updateUserConfigSchema,
  userConfigPasswordField,
  userConfigSchema,
  userConfigSessionSchema,
} from '../src/schemas/user-config.js';

const UUID = '018f3a2b-6c4d-7e8f-9a0b-1c2d3e4f5061';
const ELEVEN_LANGUAGE_CODES = [
  'tur',
  'eng',
  'ger',
  'fre',
  'spa',
  'ita',
  'por',
  'rus',
  'jpn',
  'kor',
  'ara',
];

function getIssueMessages(schema, input) {
  return schema.safeParse(input).error?.issues.map(({message}) => message);
}

function getIssuePaths(schema, input) {
  return schema.safeParse(input).error?.issues.map(({path}) => path);
}

function getNewConfig(overrides) {
  return {
    password: 'correct horse',
    languageCodes: ['tur', 'eng'],
    subtitleSourceSwitchStates: {},
    credentials: [],
    ...overrides,
  };
}

function getApiKeyCredential(subtitleSource, apiKey) {
  return {
    subtitleSource,
    credentialKind: 'api-key',
    credentialSecret: {apiKey},
  };
}

function getAccessTokenCredential(subtitleSource, accessToken) {
  return {
    subtitleSource,
    credentialKind: 'access-token',
    credentialSecret: {accessToken},
  };
}

describe('user config constants', () => {
  it('bounds the password, languages, per-language limit and secrets', () => {
    expect([
      USER_CONFIG_PASSWORD_LENGTH_MIN,
      USER_CONFIG_PASSWORD_LENGTH_MAX,
      USER_CONFIG_LANGUAGE_CODES_MIN,
      USER_CONFIG_LANGUAGE_CODES_MAX,
      SUBTITLE_LANGUAGE_LIMIT_MIN,
      SUBTITLE_LANGUAGE_LIMIT_MAX,
      SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
      CREDENTIAL_SECRET_LENGTH_MAX,
    ]).toEqual([8, 255, 1, 10, 1, 30, 10, 512]);
  });
});

describe('userConfigPasswordField', () => {
  it('refuses a 7-character password', () => {
    expect(getIssueMessages(userConfigPasswordField, 'a'.repeat(7))).toEqual([
      'Password must be at least 8 characters',
    ]);
  });

  it('refuses a 256-character password', () => {
    expect(getIssueMessages(userConfigPasswordField, 'a'.repeat(256))).toEqual([
      'Password must be at most 255 characters',
    ]);
  });

  it('accepts 8 and 255 characters', () => {
    expect(userConfigPasswordField.safeParse('a'.repeat(8)).success).toBe(true);
    expect(userConfigPasswordField.safeParse('a'.repeat(255)).success).toBe(
      true,
    );
  });

  it('never trims a password', () => {
    expect(userConfigPasswordField.parse('  padded secret  ')).toBe(
      '  padded secret  ',
    );
  });
});

describe('languageCodesField', () => {
  it('keeps the order the user chose', () => {
    expect(languageCodesField.parse(['eng', 'tur', 'ger'])).toEqual([
      'eng',
      'tur',
      'ger',
    ]);
  });

  it('refuses no language', () => {
    expect(getIssueMessages(languageCodesField, [])).toEqual([
      'Choose at least one language',
    ]);
  });

  it('refuses 11 languages', () => {
    expect(getIssueMessages(languageCodesField, ELEVEN_LANGUAGE_CODES)).toEqual(
      ['Choose at most 10 languages'],
    );
  });

  it('refuses a repeated language', () => {
    expect(getIssueMessages(languageCodesField, ['tur', 'eng', 'tur'])).toEqual(
      ['Each language can be added once'],
    );
  });

  it('refuses a code that is not a subtitle language', () => {
    expect(getIssuePaths(languageCodesField, ['tur', 'xx'])).toEqual([[1]]);
  });
});

describe('subtitleLanguageLimitField', () => {
  it('defaults to 10', () => {
    expect(subtitleLanguageLimitField.parse(undefined)).toBe(10);
  });

  it('accepts 1 and 30', () => {
    expect(subtitleLanguageLimitField.parse(1)).toBe(1);
    expect(subtitleLanguageLimitField.parse(30)).toBe(30);
  });

  it.each([0, 31])('refuses %s', subtitleLanguageLimit => {
    expect(
      getIssueMessages(subtitleLanguageLimitField, subtitleLanguageLimit),
    ).toEqual(['Subtitles per language must be between 1 and 30']);
  });

  it('refuses a fraction', () => {
    expect(
      subtitleLanguageLimitField.safeParse(2.5).error?.issues[0]?.expected,
    ).toBe('int');
  });
});

describe('subtitleSourceSwitchStatesField', () => {
  it('accepts a partial record, leaving missing sources out', () => {
    expect(subtitleSourceSwitchStatesField.parse({anisub: false})).toEqual({
      anisub: false,
    });
  });

  it('refuses a key that is not a subtitle source', () => {
    expect(
      subtitleSourceSwitchStatesField.safeParse({
        anisub: true,
        'not-a-source': true,
      }).error?.issues,
    ).toEqual([
      expect.objectContaining({
        code: 'unrecognized_keys',
        keys: ['not-a-source'],
      }),
    ]);
  });

  it('refuses a state that is not a boolean', () => {
    expect(
      getIssuePaths(subtitleSourceSwitchStatesField, {anisub: 'on'}),
    ).toEqual([['anisub']]);
  });
});

describe('listImprovementSwitchStatesField', () => {
  it('accepts a partial record of the sources that carry the switch', () => {
    expect(
      listImprovementSwitchStatesField.parse({
        opensubtitles: true,
        wyzie: false,
      }),
    ).toEqual({opensubtitles: true, wyzie: false});
  });

  it.each(['anisub', 'jimaku', 'betaseries', 'yify', 'not-a-source'])(
    'refuses the source %s, which carries no switch',
    subtitleSource => {
      expect(
        listImprovementSwitchStatesField.safeParse({[subtitleSource]: true})
          .success,
      ).toBe(false);
    },
  );

  it('refuses a state that is not a boolean', () => {
    expect(
      getIssuePaths(listImprovementSwitchStatesField, {subdl: 'on'}),
    ).toEqual([['subdl']]);
  });

  it('leaves a new configuration without states to the defaults', () => {
    expect(
      createUserConfigSchema.parse(getNewConfig()).listImprovementSwitchStates,
    ).toEqual({});
  });

  it('keeps the states a new configuration sends', () => {
    expect(
      createUserConfigSchema.parse(
        getNewConfig({listImprovementSwitchStates: {subdl: true}}),
      ).listImprovementSwitchStates,
    ).toEqual({subdl: true});
  });

  it('leaves the states out of a patch that does not send them', () => {
    expect(updateUserConfigSchema.parse({})).toEqual({});
  });

  it('keeps only the states that differ from their source default', () => {
    expect(
      listImprovementSwitchStatesField.parse({
        opensubtitles: false,
        subdl: true,
        wyzie: true,
        subsource: false,
      }),
    ).toEqual({subdl: true, subsource: false});
  });

  it('takes the states in a patch', () => {
    expect(
      updateUserConfigSchema.parse({
        listImprovementSwitchStates: {opensubtitles: true},
      }),
    ).toEqual({listImprovementSwitchStates: {opensubtitles: true}});
  });
});

describe('createUserConfigSchema', () => {
  it('accepts a new configuration and defaults the per-language limit', () => {
    const parsed = createUserConfigSchema.parse({
      password: 'correct horse',
      languageCodes: ['tur', 'eng'],
      subtitleSourceSwitchStates: {},
      credentials: [],
    });
    expect(parsed.subtitleLanguageLimit).toBe(10);
  });

  it('refuses a 7-character password', () => {
    expect(
      getIssueMessages(
        createUserConfigSchema,
        getNewConfig({password: 'a'.repeat(7)}),
      ),
    ).toEqual(['Password must be at least 8 characters']);
  });

  it('refuses 11 languages', () => {
    expect(
      getIssueMessages(
        createUserConfigSchema,
        getNewConfig({languageCodes: ELEVEN_LANGUAGE_CODES}),
      ),
    ).toEqual(['Choose at most 10 languages']);
  });

  it('refuses a repeated tur', () => {
    expect(
      getIssueMessages(
        createUserConfigSchema,
        getNewConfig({languageCodes: ['tur', 'tur']}),
      ),
    ).toEqual(['Each language can be added once']);
  });

  it('refuses xx as a language', () => {
    expect(
      getIssuePaths(
        createUserConfigSchema,
        getNewConfig({languageCodes: ['xx']}),
      ),
    ).toEqual([['languageCodes', 0]]);
  });

  it('refuses a per-language limit of 31', () => {
    expect(
      getIssueMessages(
        createUserConfigSchema,
        getNewConfig({subtitleLanguageLimit: 31}),
      ),
    ).toEqual(['Subtitles per language must be between 1 and 30']);
  });

  it('needs a non-empty secret for every new credential', () => {
    expect(
      getIssueMessages(
        createUserConfigSchema,
        getNewConfig({credentials: [getApiKeyCredential('subsource', '')]}),
      ),
    ).toEqual(['Enter the API key']);
  });
});

describe('updateUserConfigSchema', () => {
  it('accepts an empty update', () => {
    expect(updateUserConfigSchema.parse({})).toEqual({});
  });

  it('accepts an AltyazıDB key and refuses an AltyazıDB account', () => {
    const key = {
      subtitleSource: 'altyazidb',
      credentialKind: 'api-key',
      credentialSecret: {apiKey: 'fixture-key'},
    };
    expect(updateUserConfigSchema.safeParse({credentials: [key]}).success).toBe(
      true,
    );
    const account = {
      subtitleSource: 'altyazidb',
      credentialKind: 'account',
      credentialSecret: {username: 'u', password: 'p'},
    };
    expect(
      updateUserConfigSchema.safeParse({credentials: [account]}).error.issues[0]
        .message,
    ).toBe('This source does not take this kind of credential');
  });

  it('keeps a blank secret only for a stored credential', () => {
    const blank = {
      subtitleSource: 'subsource',
      credentialKind: 'api-key',
      credentialSecret: {apiKey: ''},
    };
    expect(
      updateUserConfigSchema.safeParse({
        credentials: [{...blank, credentialId: UUID}],
      }).success,
    ).toBe(true);
    expect(
      updateUserConfigSchema.safeParse({credentials: [blank]}).success,
    ).toBe(false);
  });

  it('never trims a secret', () => {
    const parsed = updateUserConfigSchema.parse({
      credentials: [
        {
          subtitleSource: 'subsource',
          credentialKind: 'api-key',
          credentialSecret: {apiKey: ' key '},
        },
      ],
    });
    expect(parsed.credentials[0].credentialSecret.apiKey).toBe(' key ');
  });

  it('accepts an OpenSubtitles account and key together', () => {
    const account = {
      subtitleSource: 'opensubtitles',
      credentialKind: 'account',
      credentialSecret: {username: 'fixture-user', password: 'fixture-pass'},
    };
    expect(
      updateUserConfigSchema.safeParse({
        credentials: [account, getApiKeyCredential('opensubtitles', 'k')],
      }).success,
    ).toBe(true);
  });

  it('keeps a stored account with both secret strings blank', () => {
    const storedAccount = {
      credentialId: UUID,
      subtitleSource: 'opensubtitles',
      credentialKind: 'account',
      credentialSecret: {username: '', password: ''},
    };
    expect(
      updateUserConfigSchema.safeParse({credentials: [storedAccount]}).success,
    ).toBe(true);
  });

  it.each([
    ['account', {username: '', password: 'fixture-pass'}, 'Enter the username'],
    ['account', {username: 'fixture-user', password: ''}, 'Enter the password'],
    ['api-key', {apiKey: ''}, 'Enter the API key'],
  ])(
    'names the blank %s secret of a new credential',
    (credentialKind, credentialSecret, message) => {
      expect(
        getIssueMessages(updateUserConfigSchema, {
          credentials: [
            {subtitleSource: 'opensubtitles', credentialKind, credentialSecret},
          ],
        }),
      ).toEqual([message]);
    },
  );

  it('names a blank access token of a new credential', () => {
    expect(
      getIssueMessages(updateUserConfigSchema, {
        credentials: [getAccessTokenCredential('anisub', '')],
      }),
    ).toEqual(['Enter the access token']);
  });

  it('refuses two AniSub tokens', () => {
    expect(
      getIssueMessages(updateUserConfigSchema, {
        credentials: [
          getAccessTokenCredential('anisub', 'fixture-token-1'),
          getAccessTokenCredential('anisub', 'fixture-token-2'),
        ],
      }),
    ).toEqual(['Too many credentials for this source']);
  });

  it('counts the credential limit per source', () => {
    const tenKeys = Array.from({length: 10}, (_, index) =>
      getApiKeyCredential('subsource', `fixture-key-${index}`),
    );
    expect(
      updateUserConfigSchema.safeParse({
        credentials: [
          ...tenKeys,
          getAccessTokenCredential('anisub', 'fixture-token'),
        ],
      }).success,
    ).toBe(true);
    expect(
      getIssueMessages(updateUserConfigSchema, {
        credentials: [
          ...tenKeys,
          getApiKeyCredential('subsource', 'fixture-key-10'),
        ],
      }),
    ).toEqual(['Too many credentials for this source']);
  });

  it('accepts a 512-character secret and refuses 513', () => {
    expect(
      updateUserConfigSchema.safeParse({
        credentials: [getApiKeyCredential('subsource', 'k'.repeat(512))],
      }).success,
    ).toBe(true);
    expect(
      getIssuePaths(updateUserConfigSchema, {
        credentials: [getApiKeyCredential('subsource', 'k'.repeat(513))],
      }),
    ).toEqual([['credentials', 0, 'credentialSecret', 'apiKey']]);
  });

  it('refuses a secret shaped for another kind', () => {
    expect(
      getIssuePaths(updateUserConfigSchema, {
        credentials: [
          {
            subtitleSource: 'subsource',
            credentialKind: 'api-key',
            credentialSecret: {accessToken: 'fixture-token'},
          },
        ],
      })?.[0]?.slice(0, 3),
    ).toEqual(['credentials', 0, 'credentialSecret']);
  });

  it('refuses a credential id that is not a UUID', () => {
    expect(
      getIssuePaths(updateUserConfigSchema, {
        credentials: [
          {
            ...getApiKeyCredential('subsource', 'fixture-key'),
            credentialId: 'not-a-uuid',
          },
        ],
      }),
    ).toEqual([['credentials', 0, 'credentialId']]);
  });

  it('refuses a per-language limit of 31', () => {
    expect(
      getIssueMessages(updateUserConfigSchema, {subtitleLanguageLimit: 31}),
    ).toEqual(['Subtitles per language must be between 1 and 30']);
  });
});

describe('session and password schemas', () => {
  it('opens a session with any non-empty password', () => {
    expect(createUserConfigSessionSchema.parse({password: 'x'})).toEqual({
      password: 'x',
    });
    expect(
      getIssuePaths(createUserConfigSessionSchema, {password: ''}),
    ).toEqual([['password']]);
  });

  it('holds a new password to the password rules', () => {
    expect(
      changeUserConfigPasswordSchema.safeParse({
        currentPassword: 'old secret',
        newPassword: 'new secret',
      }).success,
    ).toBe(true);
    expect(
      getIssueMessages(changeUserConfigPasswordSchema, {
        currentPassword: 'old secret',
        newPassword: 'a'.repeat(7),
      }),
    ).toEqual(['Password must be at least 8 characters']);
  });

  it('deletes with the password', () => {
    expect(deleteUserConfigSchema.parse({password: 'correct horse'})).toEqual({
      password: 'correct horse',
    });
  });
});

describe('getCredentialSecretField', () => {
  it.each([
    ['api-key', {apiKey: 'fixture-key'}],
    ['account', {username: 'fixture-user', password: 'fixture-pass'}],
    ['access-token', {accessToken: 'fixture-token'}],
  ])('accepts the %s secret shape', (credentialKind, credentialSecret) => {
    expect(
      getCredentialSecretField(credentialKind).parse(credentialSecret),
    ).toEqual(credentialSecret);
  });

  it('refuses an account secret for an API key', () => {
    expect(
      getCredentialSecretField('api-key').safeParse({
        username: 'fixture-user',
        password: 'fixture-pass',
      }).success,
    ).toBe(false);
  });

  it('refuses a mixed shape and an unknown part', () => {
    expect(
      getCredentialSecretField('api-key').safeParse({
        apiKey: 'k',
        accessToken: 't',
      }).success,
    ).toBe(false);
    expect(
      getCredentialSecretField('access-token').safeParse({token: 't'}).success,
    ).toBe(false);
  });

  it.each(CredentialKind.values)(
    'names every blank part of the %s secret with its own message',
    credentialKind => {
      const credentialSecretParts =
        CredentialKind.item(credentialKind).credentialSecretParts;
      const messages = getIssueMessages(
        getCredentialSecretField(credentialKind),
        Object.fromEntries(credentialSecretParts.map(part => [part, ''])),
      );
      expect(messages).toHaveLength(credentialSecretParts.length);
      for (const message of messages) {
        expect(message).toMatch(/^Enter the /);
      }
    },
  );

  it('refuses a whitespace-only secret', () => {
    expect(
      getIssueMessages(getCredentialSecretField('api-key'), {apiKey: '   '}),
    ).toEqual(['Enter the API key']);
  });

  it('never trims a filled secret', () => {
    expect(
      getCredentialSecretField('access-token').parse({accessToken: ' token '}),
    ).toEqual({accessToken: ' token '});
  });
});

describe('getCredentialKindCheck', () => {
  const credentialSchema = z
    .object({subtitleSource: z.string(), credentialKind: z.string()})
    .check(getCredentialKindCheck());

  it('accepts a kind the source takes', () => {
    expect(
      credentialSchema.safeParse({
        subtitleSource: 'anisub',
        credentialKind: 'access-token',
      }).success,
    ).toBe(true);
  });

  it('refuses a kind the source does not take, on the kind', () => {
    expect(
      credentialSchema.safeParse({
        subtitleSource: 'anisub',
        credentialKind: 'api-key',
      }).error?.issues,
    ).toEqual([
      expect.objectContaining({
        message: 'This source does not take this kind of credential',
        path: ['credentialKind'],
      }),
    ]);
  });

  it('stays silent while the source is already invalid', () => {
    expect(
      getIssuePaths(credentialSchema, {
        subtitleSource: 1,
        credentialKind: 'api-key',
      }),
    ).toEqual([['subtitleSource']]);
  });

  it('refuses an unknown source instead of throwing', () => {
    expect(
      getIssueMessages(credentialSchema, {
        subtitleSource: 'not-a-source',
        credentialKind: 'api-key',
      }),
    ).toEqual(['This source does not take this kind of credential']);
  });
});

describe('getCredentialLimitCheck', () => {
  const credentialListSchema = z
    .array(z.object({subtitleSource: z.string(), credentialKind: z.string()}))
    .check(getCredentialLimitCheck());
  const communityToken = {
    subtitleSource: 'stremio-community-subtitles',
    credentialKind: 'access-token',
  };
  const anisubToken = {
    subtitleSource: 'anisub',
    credentialKind: 'access-token',
  };

  it('accepts up to the limit of each source', () => {
    expect(
      credentialListSchema.safeParse([anisubToken, communityToken]).success,
    ).toBe(true);
  });

  it('refuses more than the limit of a source', () => {
    expect(
      getIssueMessages(credentialListSchema, [communityToken, communityToken]),
    ).toEqual(['Too many credentials for this source']);
  });

  it('flags the first item past the limit of each source', () => {
    expect(
      getIssuePaths(credentialListSchema, [
        anisubToken,
        communityToken,
        anisubToken,
        communityToken,
        anisubToken,
      ]),
    ).toEqual([
      [2, 'subtitleSource'],
      [3, 'subtitleSource'],
    ]);
  });

  it('skips an unknown source and a kind the source does not take', () => {
    expect(
      credentialListSchema.safeParse([
        {subtitleSource: 'not-a-source', credentialKind: 'api-key'},
        {subtitleSource: 'anisub', credentialKind: 'api-key'},
        {subtitleSource: 'anisub', credentialKind: 'api-key'},
      ]).success,
    ).toBe(true);
  });
});

describe('credential limit paths', () => {
  it('places two AniSub tokens on the second token', () => {
    expect(
      getIssuePaths(updateUserConfigSchema, {
        credentials: [
          getAccessTokenCredential('anisub', 'fixture-token-1'),
          getAccessTokenCredential('anisub', 'fixture-token-2'),
        ],
      }),
    ).toEqual([['credentials', 1, 'subtitleSource']]);
  });

  it('places an eleventh SubSource key on that key', () => {
    expect(
      getIssuePaths(createUserConfigSchema, {
        ...getNewConfig(),
        credentials: Array.from({length: 11}, (_, index) =>
          getApiKeyCredential('subsource', `fixture-key-${index}`),
        ),
      }),
    ).toEqual([['credentials', 10, 'subtitleSource']]);
  });
});

describe('credential edge cases', () => {
  it('refuses a credential for a source that takes none', () => {
    expect(
      getIssueMessages(updateUserConfigSchema, {
        credentials: [getApiKeyCredential('gestdown', 'fixture-key')],
      }),
    ).toEqual(['This source does not take this kind of credential']);
  });

  it('refuses an account secret sent as an API key', () => {
    expect(
      updateUserConfigSchema.safeParse({
        credentials: [
          {
            subtitleSource: 'opensubtitles',
            credentialKind: 'api-key',
            credentialSecret: {username: 'fixture-user', password: 'p'},
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('refuses a stored credential that omits a secret key', () => {
    expect(
      getIssuePaths(updateUserConfigSchema, {
        credentials: [
          {
            credentialId: UUID,
            subtitleSource: 'opensubtitles',
            credentialKind: 'account',
            credentialSecret: {username: ''},
          },
        ],
      }),
    ).toEqual([['credentials', 0, 'credentialSecret', 'password']]);
  });

  it('lets a stored account change its password alone, keeping the stored username', () => {
    expect(
      updateUserConfigSchema.safeParse({
        credentials: [
          {
            credentialId: UUID,
            subtitleSource: 'opensubtitles',
            credentialKind: 'account',
            credentialSecret: {username: '', password: 'fixture-new-pass'},
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('refuses a new username on a stored account without a new password, naming both fields', () => {
    const credentials = [
      {
        credentialId: UUID,
        subtitleSource: 'opensubtitles',
        credentialKind: 'account',
        credentialSecret: {username: 'fixture-user', password: ''},
      },
    ];

    expect(getIssuePaths(updateUserConfigSchema, {credentials})).toEqual([
      ['credentials', 0, 'credentialSecret', 'password'],
    ]);
    expect(getIssueMessages(updateUserConfigSchema, {credentials})).toEqual([
      'Enter both the username and the password',
    ]);
  });

  it('replaces every string of a stored account', () => {
    const storedAccount = {
      credentialId: UUID,
      subtitleSource: 'opensubtitles',
      credentialKind: 'account',
      credentialSecret: {username: 'fixture-user', password: 'fixture-pass'},
    };
    expect(
      updateUserConfigSchema.parse({credentials: [storedAccount]}),
    ).toEqual({credentials: [storedAccount]});
  });

  it.each([
    ['createUserConfigSchema', createUserConfigSchema, getNewConfig()],
    ['updateUserConfigSchema', updateUserConfigSchema, {}],
  ])('names both blank strings of a new account on %s', (_, schema, input) => {
    expect(
      getIssueMessages(schema, {
        ...input,
        credentials: [
          {
            subtitleSource: 'opensubtitles',
            credentialKind: 'account',
            credentialSecret: {username: '', password: ''},
          },
        ],
      }),
    ).toEqual(['Enter the username', 'Enter the password']);
  });

  it('refuses a whitespace-only secret on a new credential', () => {
    expect(
      getIssueMessages(updateUserConfigSchema, {
        credentials: [getApiKeyCredential('subsource', '   ')],
      }),
    ).toEqual(['Enter the API key']);
  });

  it('keeps the stored secret behind a whitespace-only one', () => {
    expect(
      updateUserConfigSchema.parse({
        credentials: [
          {
            ...getApiKeyCredential('subsource', '   '),
            credentialId: UUID,
          },
        ],
      }).credentials[0].credentialSecret,
    ).toEqual({apiKey: ''});
  });

  it('refuses a repeated credential id on its second item', () => {
    const storedKey = {
      ...getApiKeyCredential('subsource', ''),
      credentialId: UUID,
    };
    const issues = updateUserConfigSchema.safeParse({
      credentials: [
        storedKey,
        getApiKeyCredential('subsource', 'k'),
        storedKey,
      ],
    }).error?.issues;
    expect(issues).toEqual([
      expect.objectContaining({
        message: 'Each credential can be added once',
        path: ['credentials', 2, 'credentialId'],
      }),
    ]);
  });
});

describe('user config edge cases', () => {
  it('names an unknown language code', () => {
    expect(getIssueMessages(languageCodesField, ['tur', 'xx'])).toEqual([
      'Choose a language from the list',
    ]);
  });

  it('refuses an unknown key on a new configuration', () => {
    expect(
      getIssuePaths(createUserConfigSchema, {
        ...getNewConfig(),
        userConfigId: UUID,
      }),
    ).toEqual([[]]);
  });

  it('refuses a saved configuration without its per-language limit', () => {
    expect(
      getIssuePaths(userConfigSchema, {
        userConfigId: UUID,
        manifestUrl: `https://aiosubtitles.example/${UUID}/manifest.json`,
        languageCodes: ['tur'],
        subtitleSourceSwitchStates: Object.fromEntries(
          SubtitleSource.values.map(subtitleSource => [subtitleSource, true]),
        ),
        listImprovementSwitchStates: {
          opensubtitles: false,
          altyazidb: true,
          thesubtitledb: true,
          subsource: true,
          subdl: false,
          wyzie: true,
          'stremio-community-subtitles': true,
        },
        credentials: [],
      }),
    ).toEqual([['subtitleLanguageLimit']]);
  });
});

describe('response schemas', () => {
  const maskedCredential = {
    credentialId: UUID,
    subtitleSource: 'opensubtitles',
    credentialKind: 'api-key',
    credentialSecret: {apiKey: 'osk_fixture_abcd'},
    credentialStatus: 'valid',
    credentialCheckedAt: '2026-11-18T10:00:00.000Z',
    quotaRemainingCount: 20,
    quotaResetAt: '2026-11-19T00:00:00.000Z',
  };
  const fullSwitchStates = Object.fromEntries(
    SubtitleSource.values.map(subtitleSource => [subtitleSource, true]),
  );
  const fullListImprovementSwitchStates = {
    opensubtitles: false,
    altyazidb: true,
    thesubtitledb: true,
    subsource: true,
    subdl: false,
    wyzie: true,
    'stremio-community-subtitles': true,
  };

  it('describes a masked credential', () => {
    expect(maskedCredentialSchema.parse(maskedCredential)).toEqual(
      maskedCredential,
    );
  });

  it('describes a never-checked credential of a source with no quota', () => {
    const uncheckedCredential = {
      ...maskedCredential,
      credentialStatus: 'unchecked',
      credentialCheckedAt: null,
      quotaRemainingCount: null,
      quotaResetAt: null,
    };
    expect(maskedCredentialSchema.parse(uncheckedCredential)).toEqual(
      uncheckedCredential,
    );
  });

  it('describes a saved configuration with every source switch state', () => {
    const userConfig = {
      userConfigId: UUID,
      manifestUrl: `https://aiosubtitles.example/${UUID}/manifest.json`,
      languageCodes: ['tur', 'eng'],
      subtitleLanguageLimit: 10,
      subtitleSourceSwitchStates: fullSwitchStates,
      listImprovementSwitchStates: fullListImprovementSwitchStates,
      credentials: [maskedCredential],
    };
    expect(userConfigSchema.parse(userConfig)).toEqual(userConfig);
  });

  it('refuses a saved configuration missing a list improvement state', () => {
    const {subdl: _subdl, ...partialStates} = fullListImprovementSwitchStates;
    expect(
      userConfigSchema
        .safeParse({
          userConfigId: UUID,
          manifestUrl: `https://aiosubtitles.example/${UUID}/manifest.json`,
          languageCodes: ['tur'],
          subtitleLanguageLimit: 10,
          subtitleSourceSwitchStates: fullSwitchStates,
          listImprovementSwitchStates: partialStates,
          credentials: [],
        })
        .error?.issues[0]?.path.slice(0, 1),
    ).toEqual(['listImprovementSwitchStates']);
  });

  it('refuses a saved configuration missing a source switch state', () => {
    const {anisub: _anisub, ...partialSwitchStates} = fullSwitchStates;
    expect(
      userConfigSchema
        .safeParse({
          userConfigId: UUID,
          manifestUrl: `https://aiosubtitles.example/${UUID}/manifest.json`,
          languageCodes: ['tur'],
          subtitleLanguageLimit: 10,
          subtitleSourceSwitchStates: partialSwitchStates,
          credentials: [],
        })
        .error?.issues[0]?.path.slice(0, 1),
    ).toEqual(['subtitleSourceSwitchStates']);
  });

  it('describes a created configuration and a session', () => {
    const createdUserConfig = {
      userConfigId: UUID,
      manifestUrl: `https://aiosubtitles.example/${UUID}/manifest.json`,
      sessionToken: 'a.b.c',
    };
    expect(createdUserConfigSchema.parse(createdUserConfig)).toEqual(
      createdUserConfig,
    );
    expect(userConfigSessionSchema.parse({sessionToken: 'a.b.c'})).toEqual({
      sessionToken: 'a.b.c',
    });
  });

  it.each([
    `http://localhost:7000/${UUID}/manifest.json`,
    `http://192.168.1.10/${UUID}/manifest.json`,
  ])('accepts a manifest url on a local host: %s', manifestUrl => {
    for (const schema of [createdUserConfigSchema, userConfigSchema]) {
      expect(schema.shape.manifestUrl.safeParse(manifestUrl).success).toBe(
        true,
      );
    }
  });

  it.each([
    `https://aiosubtitles.example/${UUID}/manifest.json?x=1`,
    `https://user:pass@aiosubtitles.example/${UUID}/manifest.json`,
  ])('refuses a manifest url with a query or userinfo: %s', manifestUrl => {
    for (const schema of [createdUserConfigSchema, userConfigSchema]) {
      expect(schema.shape.manifestUrl.safeParse(manifestUrl).success).toBe(
        false,
      );
    }
  });

  it('describes every subtitle source as an option', () => {
    const subtitleSourceOptions = SubtitleSource.toList({
      extra: subtitleSourceItem => ({
        credentialRequirement: subtitleSourceItem.raw.credentialRequirement,
        credentialKinds: subtitleSourceItem.raw.credentialKinds,
        credentialLimit: subtitleSourceItem.raw.credentialLimit,
      }),
    }).map(
      ({
        value,
        label,
        credentialRequirement,
        credentialKinds,
        credentialLimit,
      }) => ({
        subtitleSource: value,
        label,
        credentialRequirement,
        credentialKinds,
        credentialLimit,
      }),
    );
    for (const subtitleSourceOption of subtitleSourceOptions) {
      expect(subtitleSourceOptionSchema.parse(subtitleSourceOption)).toEqual(
        subtitleSourceOption,
      );
    }
  });
});

describe('Community Subtitles token field', () => {
  const communityToken = 'scs-fixture_token-0001-abcdEFGH';
  const communityTokenPath = [
    'credentials',
    0,
    'credentialSecret',
    'accessToken',
  ];
  const tokenInputs = [
    communityToken,
    `https://stremio-community-subtitles.top/${communityToken}/manifest.json`,
    `stremio://stremio-community-subtitles.top/${communityToken}/manifest.json`,
    `http://stremio-community-subtitles.top/${communityToken}/manifest.json`,
    `  https://stremio-community-subtitles.top/${communityToken}/manifest.json  `,
  ];
  const noTokenInputs = [
    'https://stremio-community-subtitles.top/configure',
    'https://stremio-community-subtitles.top/manifest.json',
    'not a token',
    'short',
    `stremio-community-subtitles.top/${communityToken}/manifest.json/extra`,
  ];

  function readAccessToken(schema, input) {
    return schema.parse(input).credentials[0].credentialSecret.accessToken;
  }

  it('keeps only the token from a link or a bare token on create', () => {
    for (const tokenInput of tokenInputs) {
      expect(
        readAccessToken(
          createUserConfigSchema,
          getNewConfig({
            credentials: [
              getAccessTokenCredential(
                'stremio-community-subtitles',
                tokenInput,
              ),
            ],
          }),
        ),
      ).toBe(communityToken);
    }
  });

  it('keeps only the token from a link or a bare token on update', () => {
    for (const tokenInput of tokenInputs) {
      expect(
        readAccessToken(updateUserConfigSchema, {
          credentials: [
            {
              credentialId: UUID,
              ...getAccessTokenCredential(
                'stremio-community-subtitles',
                tokenInput,
              ),
            },
          ],
        }),
      ).toBe(communityToken);
    }
  });

  it('flags the token field for a value that holds no token', () => {
    for (const noTokenInput of noTokenInputs) {
      expect(
        getIssuePaths(
          createUserConfigSchema,
          getNewConfig({
            credentials: [
              getAccessTokenCredential(
                'stremio-community-subtitles',
                noTokenInput,
              ),
            ],
          }),
        ),
      ).toEqual([communityTokenPath]);
    }
  });

  it('keeps a blank token on a stored credential', () => {
    expect(
      readAccessToken(updateUserConfigSchema, {
        credentials: [
          {
            credentialId: UUID,
            ...getAccessTokenCredential('stremio-community-subtitles', ''),
          },
        ],
      }),
    ).toBe('');
  });

  it('leaves another source access token as entered', () => {
    expect(
      readAccessToken(
        createUserConfigSchema,
        getNewConfig({
          credentials: [getAccessTokenCredential('anisub', '7|anisub token')],
        }),
      ),
    ).toBe('7|anisub token');
  });
});
