import {z} from 'zod';
import {CredentialKind, CredentialStatus} from '../constants/credential.js';
import {
  CredentialRequirement,
  SubtitleSource,
} from '../constants/subtitle-source.js';
import {SubtitleLanguage} from '../constants/subtitle-language.js';
import {
  CREDENTIAL_SECRET_LENGTH_MAX,
  SUBTITLE_LANGUAGE_LIMIT_DEFAULT,
  SUBTITLE_LANGUAGE_LIMIT_MAX,
  SUBTITLE_LANGUAGE_LIMIT_MIN,
  USER_CONFIG_LANGUAGE_CODES_MAX,
  USER_CONFIG_LANGUAGE_CODES_MIN,
  USER_CONFIG_PASSWORD_LENGTH_MAX,
  USER_CONFIG_PASSWORD_LENGTH_MIN,
} from '../constants/user-config.js';
import {toPatchSchema} from '../lib/schema.js';
import {
  baseUrlField,
  getCrossFieldCheck,
  getCrossFieldIssueCheck,
  getEnumField,
  getUuidField,
  isoDateTimeField,
  jwtField,
} from './common.js';

const SUBTITLE_LANGUAGE_LIMIT_MESSAGE = `Subtitles per language must be between ${SUBTITLE_LANGUAGE_LIMIT_MIN} and ${SUBTITLE_LANGUAGE_LIMIT_MAX}`;

const CREDENTIAL_SECRET_PART_MESSAGES = Object.freeze({
  apiKey: 'Enter the API key',
  username: 'Enter the username',
  password: 'Enter the password',
  accessToken: 'Enter the access token',
});

const KEPT_CREDENTIAL_SECRET_PARTS = ['username'];

export const CHANGED_ACCOUNT_SECRET_MESSAGE =
  'Enter both the username and the password';

const subtitleSourceField = z.enum(SubtitleSource.values);

const credentialKindField = z.enum(CredentialKind.values);

const uuidField = getUuidField();

const enteredPasswordField = z.string().min(1);

const credentialSecretPartField = z
  .string()
  .overwrite(credentialSecretPart =>
    credentialSecretPart.trim() === '' ? '' : credentialSecretPart,
  )
  .max(CREDENTIAL_SECRET_LENGTH_MAX);

export const userConfigPasswordField = z
  .string()
  .min(
    USER_CONFIG_PASSWORD_LENGTH_MIN,
    `Password must be at least ${USER_CONFIG_PASSWORD_LENGTH_MIN} characters`,
  )
  .max(
    USER_CONFIG_PASSWORD_LENGTH_MAX,
    `Password must be at most ${USER_CONFIG_PASSWORD_LENGTH_MAX} characters`,
  );

export const languageCodesField = z
  .array(getEnumField(SubtitleLanguage, 'Choose a language from the list'))
  .min(USER_CONFIG_LANGUAGE_CODES_MIN, 'Choose at least one language')
  .max(
    USER_CONFIG_LANGUAGE_CODES_MAX,
    `Choose at most ${USER_CONFIG_LANGUAGE_CODES_MAX} languages`,
  )
  .refine(
    languageCodes => new Set(languageCodes).size === languageCodes.length,
    'Each language can be added once',
  );

export const subtitleLanguageLimitField = z
  .int()
  .min(SUBTITLE_LANGUAGE_LIMIT_MIN, SUBTITLE_LANGUAGE_LIMIT_MESSAGE)
  .max(SUBTITLE_LANGUAGE_LIMIT_MAX, SUBTITLE_LANGUAGE_LIMIT_MESSAGE)
  .default(SUBTITLE_LANGUAGE_LIMIT_DEFAULT);

export const subtitleSourceSwitchStatesField = z.partialRecord(
  subtitleSourceField,
  z.boolean(),
);

function getCredentialSecretParts(credentialKind) {
  return CredentialKind.item(credentialKind).credentialSecretParts;
}

function toCredentialSecretField(credentialKind, getPartField) {
  return z.strictObject(
    Object.fromEntries(
      getCredentialSecretParts(credentialKind).map(credentialSecretPart => [
        credentialSecretPart,
        getPartField(credentialSecretPart),
      ]),
    ),
  );
}

export function getCredentialSecretField(credentialKind) {
  return toCredentialSecretField(credentialKind, credentialSecretPart =>
    credentialSecretPartField.min(
      1,
      CREDENTIAL_SECRET_PART_MESSAGES[credentialSecretPart],
    ),
  );
}

function getBlankableCredentialSecretField(credentialKind) {
  return toCredentialSecretField(
    credentialKind,
    () => credentialSecretPartField,
  );
}

function isCredentialKindTaken(subtitleSource, credentialKind) {
  return (
    SubtitleSource.has(subtitleSource) &&
    SubtitleSource.item(subtitleSource).credentialKinds.includes(credentialKind)
  );
}

export function getCredentialKindCheck() {
  return getCrossFieldCheck(
    ['subtitleSource', 'credentialKind'],
    ({subtitleSource, credentialKind}) =>
      isCredentialKindTaken(subtitleSource, credentialKind),
    {
      message: 'This source does not take this kind of credential',
      path: ['credentialKind'],
    },
  );
}

export function getCredentialLimitCheck() {
  return z.superRefine((credentials, context) => {
    const credentialCounts = new Map();
    for (const [index, credential] of credentials.entries()) {
      const {subtitleSource, credentialKind} = credential;
      if (!isCredentialKindTaken(subtitleSource, credentialKind)) {
        continue;
      }
      const credentialCount = (credentialCounts.get(subtitleSource) ?? 0) + 1;
      credentialCounts.set(subtitleSource, credentialCount);
      if (
        credentialCount ===
        SubtitleSource.item(subtitleSource).credentialLimit + 1
      ) {
        context.addIssue({
          code: 'custom',
          input: credentials,
          message: 'Too many credentials for this source',
          path: [index, 'subtitleSource'],
        });
      }
    }
  });
}

function getStoredCredentialSecretCheck(credentialKind) {
  const credentialSecretParts = getCredentialSecretParts(credentialKind);
  return getCrossFieldIssueCheck(
    ['credentialId', 'credentialSecret'],
    ({credentialId, credentialSecret}) => {
      const blankCredentialSecretParts = credentialSecretParts.filter(
        credentialSecretPart => credentialSecret[credentialSecretPart] === '',
      );
      const toIssue = (credentialSecretPart, message) => ({
        message:
          message ?? CREDENTIAL_SECRET_PART_MESSAGES[credentialSecretPart],
        path: ['credentialSecret', credentialSecretPart],
      });
      if (credentialId === undefined) {
        return blankCredentialSecretParts.map(credentialSecretPart =>
          toIssue(credentialSecretPart),
        );
      }
      if (blankCredentialSecretParts.length === credentialSecretParts.length) {
        return [];
      }
      const isChangingKeptPart = KEPT_CREDENTIAL_SECRET_PARTS.some(
        credentialSecretPart =>
          credentialSecretParts.includes(credentialSecretPart) &&
          credentialSecret[credentialSecretPart] !== '',
      );
      return blankCredentialSecretParts
        .filter(
          credentialSecretPart =>
            !KEPT_CREDENTIAL_SECRET_PARTS.includes(credentialSecretPart),
        )
        .map(credentialSecretPart =>
          toIssue(
            credentialSecretPart,
            isChangingKeptPart ? CHANGED_ACCOUNT_SECRET_MESSAGE : undefined,
          ),
        );
    },
  );
}

function getCredentialIdCheck() {
  return getCrossFieldIssueCheck(['credentials'], ({credentials = []}) => {
    const credentialIds = new Set();
    return credentials.flatMap(({credentialId}, index) => {
      if (credentialId === undefined) {
        return [];
      }
      if (credentialIds.has(credentialId)) {
        return [
          {
            message: 'Each credential can be added once',
            path: ['credentials', index, 'credentialId'],
          },
        ];
      }
      credentialIds.add(credentialId);
      return [];
    });
  });
}

function getCredentialListField(getCredentialOption) {
  return z
    .array(
      z.discriminatedUnion(
        'credentialKind',
        CredentialKind.values.map(getCredentialOption),
      ),
    )
    .check(getCredentialLimitCheck());
}

const createCredentialListField = getCredentialListField(credentialKind =>
  z
    .object({
      subtitleSource: subtitleSourceField,
      credentialKind: z.literal(credentialKind),
      credentialSecret: getCredentialSecretField(credentialKind),
    })
    .check(getCredentialKindCheck()),
);

const updateCredentialListField = getCredentialListField(credentialKind =>
  z
    .object({
      credentialId: uuidField.optional(),
      subtitleSource: subtitleSourceField,
      credentialKind: z.literal(credentialKind),
      credentialSecret: getBlankableCredentialSecretField(credentialKind),
    })
    .check(
      getCredentialKindCheck(),
      getStoredCredentialSecretCheck(credentialKind),
    ),
);

const userConfigPreferenceFields = {
  languageCodes: languageCodesField,
  subtitleLanguageLimit: subtitleLanguageLimitField,
  subtitleSourceSwitchStates: subtitleSourceSwitchStatesField,
};

export const createUserConfigSchema = z.strictObject({
  password: userConfigPasswordField,
  ...userConfigPreferenceFields,
  credentials: createCredentialListField,
});

export const updateUserConfigSchema = toPatchSchema(
  z.object({
    ...userConfigPreferenceFields,
    credentials: updateCredentialListField,
  }),
).check(getCredentialIdCheck());

export const createUserConfigSessionSchema = z.object({
  password: enteredPasswordField,
});

export const changeUserConfigPasswordSchema = z.object({
  currentPassword: enteredPasswordField,
  newPassword: userConfigPasswordField,
});

export const deleteUserConfigSchema = z.object({
  password: enteredPasswordField,
});

export const maskedCredentialSchema = z.object({
  credentialId: uuidField,
  subtitleSource: subtitleSourceField,
  credentialKind: credentialKindField,
  maskedSecret: z.string(),
  credentialStatus: z.enum(CredentialStatus.values),
  credentialCheckedAt: isoDateTimeField.nullable(),
  quotaRemainingCount: z.int().nonnegative().nullable(),
  quotaResetAt: isoDateTimeField.nullable(),
});

export const userConfigSessionSchema = z.object({
  sessionToken: jwtField,
});

export const createdUserConfigSchema = userConfigSessionSchema.extend({
  userConfigId: uuidField,
  manifestUrl: baseUrlField,
});

export const userConfigSchema = z.object({
  userConfigId: uuidField,
  manifestUrl: baseUrlField,
  languageCodes: languageCodesField,
  subtitleLanguageLimit: subtitleLanguageLimitField.unwrap(),
  subtitleSourceSwitchStates: z.record(subtitleSourceField, z.boolean()),
  credentials: z.array(maskedCredentialSchema),
});

export const subtitleSourceOptionSchema = z.object({
  subtitleSource: subtitleSourceField,
  label: z.string(),
  credentialRequirement: z.enum(CredentialRequirement.values),
  credentialKinds: z.array(credentialKindField),
  credentialLimit: z.int().nonnegative(),
});
