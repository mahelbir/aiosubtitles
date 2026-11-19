import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {recordSubtitleSourceFailure} from '../../src/lib/record-subtitle-source-failure.js';
import {
  readSubtitleSourceBreaker,
  readSubtitleSourceBreakers,
} from '../../src/lib/subtitle-search/subtitle-source-breaker.js';
import {SourceRateLimitError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {toSubtitleSourceStatusError} from '../../src/lib/subtitle-sources/subtitle-source-request.js';
import {redis} from '../../src/redis/index.js';
import {createUserConfig} from '../helpers/factories.js';
import {readCredentialStatuses} from '../helpers/user-config-factories.js';

const NOW_MS = 1_800_000_000_000;
const client = {subtitleSource: SubtitleSource.SUBDL, downloadBudgets: []};

beforeEach(async () => {
  await redis.flushdb();
});

async function createKeyCredential() {
  const {userConfigCredentials} = await createUserConfig({
    credentials: [
      {
        subtitleSource: SubtitleSource.SUBDL,
        credentialKind: CredentialKind.API_KEY,
        credentialSecret: {apiKey: 'fixture-subdl-key'},
      },
    ],
  });
  return userConfigCredentials[0];
}

async function recordStatus(status, credentialId) {
  return recordSubtitleSourceFailure({
    client,
    error: toSubtitleSourceStatusError(
      {status, headers: {'retry-after': '600'}},
      {subtitleSource: SubtitleSource.SUBDL, credentialId},
    ),
    nowMs: NOW_MS,
  });
}

describe('recordSubtitleSourceFailure', () => {
  it('opens the breaker for a 503 with a wait header and leaves the key alone', async () => {
    const credential = await createKeyCredential();

    const isCredentialRejected = await recordStatus(
      StatusCodes.SERVICE_UNAVAILABLE,
      credential.id,
    );

    expect(isCredentialRejected).toBe(false);
    expect(await readCredentialStatuses([credential.id])).toEqual({
      [credential.id]: CredentialStatus.UNCHECKED,
    });
    expect(
      await readSubtitleSourceBreaker(SubtitleSource.SUBDL, NOW_MS + 1000),
    ).toMatchObject({isOpen: true});
  });

  it('marks the key limited for a 429 and keeps the breaker closed', async () => {
    const credential = await createKeyCredential();

    const isCredentialRejected = await recordStatus(
      StatusCodes.TOO_MANY_REQUESTS,
      credential.id,
    );

    expect(isCredentialRejected).toBe(true);
    expect(await readCredentialStatuses([credential.id])).toEqual({
      [credential.id]: CredentialStatus.LIMITED,
    });
    expect(
      await readSubtitleSourceBreaker(SubtitleSource.SUBDL, NOW_MS + 1000),
    ).toMatchObject({isOpen: false});
  });
});

describe('a rate limit on a source whose key leaves the keyless limit', () => {
  const separateClient = {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    downloadBudgets: [],
    isKeylessLimitSeparate: true,
  };

  async function recordLimit(error, recordedClient = separateClient) {
    await recordSubtitleSourceFailure({
      client: recordedClient,
      error,
      nowMs: NOW_MS,
    });
    return readSubtitleSourceBreakers(recordedClient, NOW_MS + 1000);
  }

  function toKeylessLimit(status) {
    return toSubtitleSourceStatusError(
      {status, headers: {'retry-after': '600'}},
      {subtitleSource: SubtitleSource.THESUBTITLEDB, isKeylessCall: true},
    );
  }

  it('pauses only keyless calls for a keyless 429', async () => {
    const breakers = await recordLimit(
      toKeylessLimit(StatusCodes.TOO_MANY_REQUESTS),
    );

    expect(breakers.keyedCall).toEqual({isOpen: false, budgetFactor: 1});
    expect(breakers.keylessCall).toEqual({isOpen: true, budgetFactor: 0.5});
    expect(
      await readSubtitleSourceBreaker(
        SubtitleSource.THESUBTITLEDB,
        NOW_MS + 1000,
      ),
    ).toMatchObject({isOpen: false});
  });

  it('pauses every call for a 503 with a wait header', async () => {
    const breakers = await recordLimit(
      toKeylessLimit(StatusCodes.SERVICE_UNAVAILABLE),
    );

    expect(breakers.keyedCall).toMatchObject({isOpen: true});
    expect(breakers.keylessCall).toMatchObject({isOpen: true});
  });

  it('pauses every call for a limit that names no call', async () => {
    const breakers = await recordLimit(
      new SourceRateLimitError({
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        retryAfterMs: 600000,
      }),
    );

    expect(breakers.keyedCall).toMatchObject({isOpen: true});
    expect(breakers.keylessCall).toMatchObject({isOpen: true});
  });

  it('pauses every call of a source whose key shares the keyless limit', async () => {
    const breakers = await recordLimit(
      toKeylessLimit(StatusCodes.TOO_MANY_REQUESTS),
      {...separateClient, isKeylessLimitSeparate: false},
    );

    expect(breakers.keyedCall).toMatchObject({isOpen: true});
    expect(breakers.keylessCall).toMatchObject({isOpen: true});
  });
});
