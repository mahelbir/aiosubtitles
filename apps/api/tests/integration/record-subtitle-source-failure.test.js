import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {recordSubtitleSourceFailure} from '../../src/lib/record-subtitle-source-failure.js';
import {readSubtitleSourceBreaker} from '../../src/lib/subtitle-search/subtitle-source-breaker.js';
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
