import {withTimeout} from 'es-toolkit';
import {z} from 'zod';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {ErrorCode} from '@repo/shared/constants/error-code.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {getUuidField} from '@repo/shared/schemas/common.js';
import {config} from '../../../config/index.js';
import {UserConfig} from '../../../db/models/user-config.js';
import {
  markCredentialStatus,
  openCredentialSecret,
  sealCredentialSecret,
} from '../../../lib/credential-secret.js';
import {hashPassword, verifyPassword} from '../../../lib/crypto.js';
import {
  tooManyRequests,
  unauthorized,
  unprocessable,
} from '../../../lib/errors.js';
import {RateLimitKey, RateLimitPenalty} from '../../../lib/rate-limit.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
} from '../../../lib/subtitle-sources/subtitle-source-errors.js';
import {getRequestBaseUrl} from '../../_request-base-url.js';

export const CREDENTIAL_CHECK_DEADLINE = 5000;

export const LOGIN_REFUSAL = 'Wrong configuration ID or password.';

const SUBTITLE_SOURCE_UNAVAILABLE = 'This source is not available yet.';

const PASSWORD_RATE_LIMIT_GROUP = 'user-config-password';

const DUMMY_PASSWORD_HASH = hashPassword('user-config-dummy-password');

const MASK = '••••';

const MASK_VISIBLE_LENGTH = 4;

const MASK_REVEAL_LENGTH_MIN = 8;

export const USER_CONFIG_API_ROUTE_CONFIG = {
  rateLimitGroup: 'user-config-api',
  rateLimits: [
    {max: 30, timeWindow: 60000},
    {key: RateLimitKey.USER_CONFIG, max: 30, timeWindow: 60000},
  ],
};

export const userConfigParamsSchema = z.object({
  userConfigId: getUuidField(),
});

export const loginRefusal = () =>
  unauthorized(LOGIN_REFUSAL, ErrorCode.PASSWORD_INCORRECT);

export const userConfigGoneRefusal = () =>
  unauthorized(LOGIN_REFUSAL, ErrorCode.SESSION_EXPIRED);

export function createPasswordAttemptCheck(fastify) {
  const [ipLimit, userConfigLimit] = [
    {max: config.userConfigPasswordRateLimitIpMax},
    {
      key: RateLimitKey.USER_CONFIG,
      max: config.userConfigPasswordRateLimitUserConfigMax,
    },
  ].map(window =>
    fastify.rateLimiter({
      ...window,
      timeWindow: config.userConfigPasswordRateLimitWindow,
      scope: PASSWORD_RATE_LIMIT_GROUP,
      penalty: RateLimitPenalty.NONE,
    }),
  );
  return async function assertPasswordAttempt(
    request,
    {password, passwordHash},
  ) {
    const rateLimitResults = await Promise.all([
      ipLimit(request),
      userConfigLimit(request),
    ]);
    if (rateLimitResults.some(rateLimitResult => rateLimitResult.isExceeded)) {
      return tooManyRequests(LOGIN_REFUSAL);
    }
    const isPasswordRight = verifyPassword(
      password,
      passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!passwordHash || !isPasswordRight) {
      return loginRefusal();
    }
    await Promise.all([
      ipLimit.refund(request),
      userConfigLimit.reset(request),
    ]);
    return null;
  };
}

export function assertSubtitleSourcesAvailable(
  subtitleSourceRegistry,
  credentials = [],
) {
  const isEveryAvailable = credentials.every(
    ({subtitleSource}) =>
      subtitleSourceRegistry.getSubtitleSourceClient(subtitleSource) !== null,
  );
  return isEveryAvailable ? null : unprocessable(SUBTITLE_SOURCE_UNAVAILABLE);
}

export function getCredentialPositions(credentials) {
  const credentialCounts = new Map();
  return credentials.map(({subtitleSource}) => {
    const credentialPosition = credentialCounts.get(subtitleSource) ?? 0;
    credentialCounts.set(subtitleSource, credentialPosition + 1);
    return credentialPosition;
  });
}

export function toCredentialRow({
  userConfigId,
  credential,
  credentialPosition,
}) {
  const {subtitleSource, credentialKind, credentialSecret} = credential;
  return {
    userConfigId,
    subtitleSource,
    credentialKind,
    credentialSecret: sealCredentialSecret({
      userConfigId,
      subtitleSource,
      credentialSecret,
    }),
    credentialPosition,
  };
}

export function toManifestUrl(request, userConfigId) {
  return `${getRequestBaseUrl(request)}/${userConfigId}/manifest.json`;
}

export function readUserConfigWithCredentials(userConfigId, options = {}) {
  return UserConfig.withScope('withCredentials').findByPk(
    userConfigId,
    options,
  );
}

export async function readMaskedUserConfig(request, userConfigId) {
  const userConfig = await readUserConfigWithCredentials(userConfigId);
  return userConfig && toMaskedUserConfig(request, userConfig);
}

export async function checkCredentials({
  subtitleSourceRegistry,
  userConfigId,
  credentials,
  log,
}) {
  const signal = AbortSignal.timeout(CREDENTIAL_CHECK_DEADLINE);
  await Promise.all(
    credentials.map(async credential => {
      const credentialCheck = await checkCredential({
        client: subtitleSourceRegistry.getSubtitleSourceClient(
          credential.subtitleSource,
        ),
        userConfigId,
        credential,
        signal,
        log,
      });
      if (credentialCheck) {
        await markCredentialStatus({
          credentialId: credential.id,
          credentialStatus: credentialCheck.credentialStatus,
          quotaRemainingCount: credentialCheck.quotaRemainingCount ?? null,
          quotaResetAt: credentialCheck.quotaResetAt ?? null,
        });
      }
    }),
  );
}

async function checkCredential({
  client,
  userConfigId,
  credential,
  signal,
  log,
}) {
  if (!client?.checkCredential) {
    return null;
  }
  const credentialSecret = openCredentialSecret({
    userConfigId,
    subtitleSource: credential.subtitleSource,
    sealedSecret: credential.credentialSecret,
  });
  if (credentialSecret === null) {
    return {credentialStatus: CredentialStatus.INVALID};
  }
  try {
    return await withTimeout(
      () =>
        client.checkCredential(
          {
            credentialId: credential.id,
            credentialKind: credential.credentialKind,
            ...credentialSecret,
          },
          {signal},
        ),
      CREDENTIAL_CHECK_DEADLINE,
    );
  } catch (err) {
    if (err instanceof SourceCredentialError) {
      return {credentialStatus: CredentialStatus.INVALID};
    }
    if (err instanceof SourceRateLimitError && err.credentialId !== null) {
      return {credentialStatus: CredentialStatus.LIMITED};
    }
    log.warn(
      {err, subtitleSource: credential.subtitleSource},
      'Credential check failed',
    );
    return null;
  }
}

function toMaskedUserConfig(request, userConfig) {
  return {
    userConfigId: userConfig.id,
    manifestUrl: toManifestUrl(request, userConfig.id),
    languageCodes: userConfig.languageCodes,
    subtitleLanguageLimit: userConfig.subtitleLanguageLimit,
    subtitleSourceSwitchStates: Object.fromEntries(
      SubtitleSource.values.map(subtitleSource => [
        subtitleSource,
        userConfig.subtitleSourceSwitchStates[subtitleSource] ?? true,
      ]),
    ),
    credentials: userConfig.credentials.map(credential => ({
      credentialId: credential.id,
      subtitleSource: credential.subtitleSource,
      credentialKind: credential.credentialKind,
      maskedSecret: toMaskedSecret(userConfig.id, credential),
      credentialStatus: credential.credentialStatus,
      credentialCheckedAt: toIsoString(credential.credentialCheckedAt),
      quotaRemainingCount: credential.quotaRemainingCount,
      quotaResetAt: toIsoString(credential.quotaResetAt),
    })),
  };
}

function toMaskedSecret(userConfigId, credential) {
  const credentialSecret = openCredentialSecret({
    userConfigId,
    subtitleSource: credential.subtitleSource,
    sealedSecret: credential.credentialSecret,
  });
  if (credentialSecret === null) {
    return MASK;
  }
  if (credential.credentialKind === CredentialKind.ACCOUNT) {
    return credentialSecret.username;
  }
  const [credentialSecretPart] = CredentialKind.item(
    credential.credentialKind,
  ).credentialSecretParts;
  return maskSecretPart(credentialSecret[credentialSecretPart]);
}

function maskSecretPart(secretPart = '') {
  return secretPart.length < MASK_REVEAL_LENGTH_MIN
    ? MASK
    : `${MASK}${secretPart.slice(-MASK_VISIBLE_LENGTH)}`;
}

function toIsoString(date) {
  return date?.toISOString() ?? null;
}
