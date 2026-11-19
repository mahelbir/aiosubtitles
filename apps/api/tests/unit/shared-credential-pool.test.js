import {describe, expect, it, vi} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {toErrorText} from '../helpers/caught-error.js';
import {createTestSharedCredentialPool} from '../helpers/shared-credentials.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';

const JIMAKU = SubtitleSource.JIMAKU;
const BETASERIES = SubtitleSource.BETASERIES;
const ANISUB = SubtitleSource.ANISUB;
const OPENSUBTITLES = SubtitleSource.OPENSUBTITLES;
const REJECTION_REST_MS = 600000;
const KEY_A = 'shared-key-a-secret';
const KEY_B = 'shared-key-b-secret';
const KEY_C = 'shared-key-c-secret';
const TOKEN_A = 'shared-token-a-secret';
const userCredential = makeSubtitleSourceCredential({apiKey: 'user-own-key'});

function answerWithKey(credential) {
  return credential?.apiKey ?? credential?.accessToken ?? 'keyless';
}

function rejectKeys(rejectedKeys, toError) {
  return vi.fn(async credential => {
    if (credential && rejectedKeys.includes(answerWithKey(credential))) {
      throw toError(credential);
    }
    return answerWithKey(credential);
  });
}

function toRateLimitError(credential, retryAfterMs = 30000) {
  return new SourceRateLimitError({
    subtitleSource: JIMAKU,
    retryAfterMs,
    credentialId: credential.credentialId,
  });
}

function toCredentialError(credential) {
  return new SourceCredentialError({
    subtitleSource: JIMAKU,
    credentialId: credential.credentialId,
  });
}

function callShared(sharedCredentialPool, runCall, callOptions = {}) {
  return sharedCredentialPool.callWithCredential({
    subtitleSource: JIMAKU,
    credential: null,
    runCall,
    ...callOptions,
  });
}

async function collectCalls(sharedCredentialPool, runCall, callCount) {
  const answers = [];
  for (let callIndex = 0; callIndex < callCount; callIndex += 1) {
    answers.push(await callShared(sharedCredentialPool, runCall));
  }
  return answers;
}

describe('sharedCredentialPool.callWithCredential order', () => {
  it("runs a user's own credential as it is, never a shared key", async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    const runCall = vi.fn(async credential => credential);

    await expect(
      sharedCredentialPool.callWithCredential({
        subtitleSource: JIMAKU,
        credential: userCredential,
        runCall,
      }),
    ).resolves.toBe(userCredential);
    expect(runCall).toHaveBeenCalledOnce();
  });

  it('runs a user without a credential under a shared key, as that source credential kind', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
      [ANISUB]: [TOKEN_A],
    });
    const runCall = vi.fn(async credential => credential);

    const [jimakuCredential, anisubCredential] = await Promise.all([
      callShared(sharedCredentialPool, runCall),
      callShared(sharedCredentialPool, runCall, {subtitleSource: ANISUB}),
    ]);

    expect(jimakuCredential).toMatchObject({
      credentialKind: CredentialKind.API_KEY,
      apiKey: KEY_A,
    });
    expect(anisubCredential).toMatchObject({
      credentialKind: CredentialKind.ACCESS_TOKEN,
      accessToken: TOKEN_A,
    });
    expect(jimakuCredential.credentialId).not.toContain(KEY_A);
    expect(anisubCredential.credentialId).not.toContain(TOKEN_A);
  });

  it('runs an OpenSubtitles shared key as the app key its source declares, not its first credential kind', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [OPENSUBTITLES]: [KEY_A],
    });

    const sharedCredential = await callShared(
      sharedCredentialPool,
      async credential => credential,
      {subtitleSource: OPENSUBTITLES},
    );

    expect(sharedCredential).toMatchObject({
      credentialKind: CredentialKind.API_KEY,
      apiKey: KEY_A,
    });
    expect(sharedCredential).not.toHaveProperty('username');
  });

  it('runs the keyless path when the source has no shared key', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [BETASERIES]: [KEY_A],
    });
    const runCall = vi.fn(async credential => answerWithKey(credential));

    await expect(callShared(sharedCredentialPool, runCall)).resolves.toBe(
      'keyless',
    );
    await expect(
      callShared(sharedCredentialPool, runCall, {
        subtitleSource: ANISUB,
        isBreakerOnEveryLimit: true,
      }),
    ).resolves.toBe('keyless');
    expect(runCall).toHaveBeenCalledWith(null);
  });
});

describe('sharedCredentialPool rotation', () => {
  it('takes the shared keys round robin, one per call', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B, KEY_C],
    });

    await expect(
      collectCalls(
        sharedCredentialPool,
        async answerWithKeyCall => answerWithKey(answerWithKeyCall),
        4,
      ),
    ).resolves.toEqual([KEY_A, KEY_B, KEY_C, KEY_A]);
  });

  it('keeps one rotation per source', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
      [BETASERIES]: [KEY_C, KEY_B],
    });
    const runCall = async credential => answerWithKey(credential);

    await callShared(sharedCredentialPool, runCall);

    await expect(
      callShared(sharedCredentialPool, runCall, {subtitleSource: BETASERIES}),
    ).resolves.toBe(KEY_C);
    await expect(callShared(sharedCredentialPool, runCall)).resolves.toBe(
      KEY_B,
    );
  });

  it('moves a rate-limited key aside within the same call and answers with the next', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    const runCall = rejectKeys([KEY_A], toRateLimitError);

    await expect(callShared(sharedCredentialPool, runCall)).resolves.toBe(
      KEY_B,
    );
    expect(runCall).toHaveBeenCalledTimes(2);
  });

  it('skips a limited key until its window passes, then takes it again', async () => {
    const {sharedCredentialPool, clock} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    const limitOnce = vi.fn(async credential => {
      if (
        answerWithKey(credential) === KEY_A &&
        limitOnce.mock.calls.length === 1
      ) {
        throw toRateLimitError(credential, 30000);
      }
      return answerWithKey(credential);
    });
    await callShared(sharedCredentialPool, limitOnce);
    const runCall = vi.fn(async credential => answerWithKey(credential));

    await expect(
      collectCalls(sharedCredentialPool, runCall, 3),
    ).resolves.toEqual([KEY_B, KEY_B, KEY_B]);
    clock.nowMs += 30000;

    await expect(
      collectCalls(sharedCredentialPool, runCall, 2),
    ).resolves.toEqual(expect.arrayContaining([KEY_A, KEY_B]));
  });

  it('holds a limited key for a default window when the limit names no wait', async () => {
    const {sharedCredentialPool, clock} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], credential => toRateLimitError(credential, 0)),
    );
    const runCall = vi.fn(async credential => answerWithKey(credential));
    clock.nowMs += 1000;

    await expect(
      collectCalls(sharedCredentialPool, runCall, 2),
    ).resolves.toEqual([KEY_B, KEY_B]);
  });

  it('skips a rejected key for ten minutes, then tries it again', async () => {
    const {sharedCredentialPool, clock} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    await expect(
      callShared(sharedCredentialPool, rejectKeys([KEY_A], toCredentialError)),
    ).resolves.toBe(KEY_B);
    const runCall = vi.fn(async credential => answerWithKey(credential));
    clock.nowMs += REJECTION_REST_MS - 1;

    const restingAnswers = await collectCalls(sharedCredentialPool, runCall, 3);
    clock.nowMs += 1;
    const restedAnswers = await collectCalls(sharedCredentialPool, runCall, 2);

    expect(restingAnswers).toEqual([KEY_B, KEY_B, KEY_B]);
    expect(restedAnswers).toEqual(expect.arrayContaining([KEY_A, KEY_B]));
  });

  it('warns again when a rested key is rejected again', async () => {
    const {sharedCredentialPool, clock, logger} =
      createTestSharedCredentialPool({[JIMAKU]: [KEY_A]});
    const runCall = rejectKeys([KEY_A], toCredentialError);
    await collectCalls(sharedCredentialPool, runCall, 3);
    const warningsWhileResting = logger.warn.mock.calls.length;
    clock.nowMs += REJECTION_REST_MS;

    await collectCalls(sharedCredentialPool, runCall, 3);

    expect(warningsWhileResting).toBe(1);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(
      runCall.mock.calls.filter(([credential]) => credential),
    ).toHaveLength(2);
  });

  it('clears a rejection at once when the settings change', async () => {
    const {sharedCredentialPool, writeSharedCredentials} =
      createTestSharedCredentialPool({[JIMAKU]: [KEY_A]});
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toCredentialError),
    );

    await writeSharedCredentials({[JIMAKU]: [KEY_A, KEY_C]});

    await expect(
      collectCalls(
        sharedCredentialPool,
        async credential => answerWithKey(credential),
        2,
      ),
    ).resolves.toEqual(expect.arrayContaining([KEY_A, KEY_C]));
  });

  it('takes the preferred key first on every call, leaving the rotation where it was', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B, KEY_C],
    });
    const runCall = async credential => answerWithKey(credential);
    const isPreferredCredential = credential => credential.apiKey === KEY_B;

    await expect(
      Promise.all(
        [1, 2].map(() =>
          callShared(sharedCredentialPool, runCall, {isPreferredCredential}),
        ),
      ),
    ).resolves.toEqual([KEY_B, KEY_B]);
    await expect(callShared(sharedCredentialPool, runCall)).resolves.toBe(
      KEY_A,
    );
  });

  it('moves on round robin once the preferred key is rejected', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    const isPreferredCredential = credential => credential.apiKey === KEY_B;

    await expect(
      callShared(sharedCredentialPool, rejectKeys([KEY_B], toCredentialError), {
        isPreferredCredential,
      }),
    ).resolves.toBe(KEY_A);
    await expect(
      callShared(
        sharedCredentialPool,
        async credential => answerWithKey(credential),
        {isPreferredCredential},
      ),
    ).resolves.toBe(KEY_A);
  });

  it('still takes a resting preferred key first, and rests it again on a new limit', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    const isPreferredCredential = credential => credential.apiKey === KEY_A;
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toRateLimitError),
    );
    const runCall = vi.fn(async credential => answerWithKey(credential));

    await expect(
      callShared(sharedCredentialPool, runCall, {isPreferredCredential}),
    ).resolves.toBe(KEY_A);
    await expect(
      callShared(sharedCredentialPool, rejectKeys([KEY_A], toRateLimitError), {
        isPreferredCredential,
      }),
    ).resolves.toBe(KEY_B);
    await expect(callShared(sharedCredentialPool, runCall)).resolves.toBe(
      KEY_B,
    );
  });

  it('takes a rejected key back once the settings change', async () => {
    const {sharedCredentialPool, writeSharedCredentials} =
      createTestSharedCredentialPool({[JIMAKU]: [KEY_A, KEY_B]});
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toCredentialError),
    );

    await writeSharedCredentials({[JIMAKU]: [KEY_A, KEY_B, KEY_C]});
    const runCall = vi.fn(async credential => answerWithKey(credential));

    await expect(
      collectCalls(sharedCredentialPool, runCall, 3),
    ).resolves.toEqual(expect.arrayContaining([KEY_A, KEY_B, KEY_C]));
  });

  it('warns once per rejected key, naming its position and never its value', async () => {
    const {sharedCredentialPool, logger} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    const runCall = rejectKeys([KEY_B], toCredentialError);

    await collectCalls(sharedCredentialPool, runCall, 4);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toMatchObject({
      subtitleSource: JIMAKU,
      sharedCredentialIndex: 1,
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(KEY_B);
  });

  it('warns once when two calls in flight see the same key rejected', async () => {
    const {sharedCredentialPool, logger} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    const runCall = rejectKeys([KEY_A], toCredentialError);

    await Promise.all([
      callShared(sharedCredentialPool, runCall),
      callShared(sharedCredentialPool, runCall),
    ]);

    expect(runCall).toHaveBeenCalledWith(
      expect.objectContaining({apiKey: KEY_A}),
    );
    expect(
      runCall.mock.calls.filter(([credential]) => credential?.apiKey === KEY_A),
    ).toHaveLength(2);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('passes on a failure that is not about the shared key, and keeps the key in the rotation', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    const unavailableError = new SourceUnavailableError({
      subtitleSource: JIMAKU,
      cause: new Error('Status 500.'),
    });
    const addressLimitError = new SourceRateLimitError({
      subtitleSource: JIMAKU,
      retryAfterMs: 30000,
    });

    await expect(
      callShared(sharedCredentialPool, async () => {
        throw unavailableError;
      }),
    ).rejects.toBe(unavailableError);
    await expect(
      callShared(sharedCredentialPool, async () => {
        throw addressLimitError;
      }),
    ).rejects.toBe(addressLimitError);
    await expect(
      callShared(sharedCredentialPool, async credential =>
        answerWithKey(credential),
      ),
    ).resolves.toBe(KEY_A);
  });
});

describe('sharedCredentialPool with every key limited', () => {
  it('raises the source rate limit without a credential id, for the soonest key to come back', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A, KEY_B],
    });
    const runCall = vi.fn(async credential => {
      throw toRateLimitError(
        credential,
        answerWithKey(credential) === KEY_A ? 50000 : 20000,
      );
    });

    const error = await callShared(sharedCredentialPool, runCall, {
      isBreakerOnEveryLimit: true,
    }).catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBeNull();
    expect(error.subtitleSource).toBe(JIMAKU);
    expect(error.retryAfterMs).toBe(20000);
    expect(runCall).toHaveBeenCalledTimes(2);
    expect(runCall).not.toHaveBeenCalledWith(null);
    expect(toErrorText(error)).not.toContain(KEY_A);
    expect(toErrorText(error)).not.toContain(KEY_B);
  });

  it('raises the rate limit at once while every key is still limited', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toRateLimitError),
      {
        isBreakerOnEveryLimit: true,
      },
    ).catch(() => null);
    const runCall = vi.fn();

    await expect(
      callShared(sharedCredentialPool, runCall, {isBreakerOnEveryLimit: true}),
    ).rejects.toBeInstanceOf(SourceRateLimitError);
    expect(runCall).not.toHaveBeenCalled();
  });

  it('skips the shared path as if the source had no shared key, without opening the breaker', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [BETASERIES]: [KEY_A, KEY_B],
    });
    const runCall = rejectKeys([KEY_A, KEY_B], toRateLimitError);

    await expect(
      callShared(sharedCredentialPool, runCall, {subtitleSource: BETASERIES}),
    ).resolves.toBe('keyless');
    expect(runCall).toHaveBeenLastCalledWith(null);
    runCall.mockClear();

    await expect(
      callShared(sharedCredentialPool, runCall, {subtitleSource: BETASERIES}),
    ).resolves.toBe('keyless');
    expect(runCall).toHaveBeenCalledOnce();
  });

  it('falls back to the keyless path where the source has one', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [ANISUB]: [TOKEN_A],
    });
    const runCall = rejectKeys([TOKEN_A], toRateLimitError);

    await expect(
      callShared(sharedCredentialPool, runCall, {subtitleSource: ANISUB}),
    ).resolves.toBe('keyless');
    expect(runCall).toHaveBeenLastCalledWith(null);
  });

  it('falls back to the keyless path once every shared key is rejected, even where a limit opens the breaker', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [ANISUB]: [TOKEN_A],
    });

    await expect(
      callShared(
        sharedCredentialPool,
        rejectKeys([TOKEN_A], toCredentialError),
        {subtitleSource: ANISUB, isBreakerOnEveryLimit: true},
      ),
    ).resolves.toBe('keyless');
  });
});

describe('sharedCredentialPool.hasConfiguredCredential', () => {
  it('answers false while the settings list no key for the source', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [],
    });

    await expect(
      sharedCredentialPool.hasConfiguredCredential(JIMAKU),
    ).resolves.toBe(false);
  });

  it('answers true while a key is listed, even once every key is rejected', async () => {
    const {sharedCredentialPool, writeSharedCredentials} =
      createTestSharedCredentialPool({[JIMAKU]: [KEY_A]});
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toCredentialError),
    );

    await expect(
      sharedCredentialPool.hasConfiguredCredential(JIMAKU),
    ).resolves.toBe(true);
    await writeSharedCredentials({});
    await expect(
      sharedCredentialPool.hasConfiguredCredential(JIMAKU),
    ).resolves.toBe(false);
  });
});

describe('sharedCredentialPool.hasUsableCredential', () => {
  it('answers false for a source without shared keys', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({});

    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(false);
  });

  it('answers true for a source with a shared key, even a limited one', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toRateLimitError),
    ).catch(() => null);

    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(true);
  });

  it('answers false once every shared key is rejected', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    await callShared(
      sharedCredentialPool,
      rejectKeys([KEY_A], toCredentialError),
    );

    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(false);
  });

  it('follows a settings reload without a restart', async () => {
    const {sharedCredentialPool, writeSharedCredentials} =
      createTestSharedCredentialPool({});
    const runCall = vi.fn(async credential => answerWithKey(credential));

    await writeSharedCredentials({[JIMAKU]: [` ${KEY_A} `, KEY_A, '']});

    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(true);
    await expect(
      collectCalls(sharedCredentialPool, runCall, 2),
    ).resolves.toEqual([KEY_A, KEY_A]);

    await writeSharedCredentials({});

    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(false);
  });

  it('passes on any other failure that names the shared key, and keeps the key', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [KEY_A],
    });
    const namedError = Object.assign(new Error('Socket closed.'), {
      credentialId: null,
    });
    const runCall = vi.fn(async credential => {
      namedError.credentialId = credential.credentialId;
      throw namedError;
    });

    await expect(callShared(sharedCredentialPool, runCall)).rejects.toBe(
      namedError,
    );
    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(true);
  });

  it('reads a settings file that never loaded as no shared key, so a search still runs', async () => {
    const {sharedCredentialPool} = createTestSharedCredentialPool({
      [JIMAKU]: [42],
    });
    const runCall = vi.fn(async credential => answerWithKey(credential));

    await expect(
      sharedCredentialPool.hasUsableCredential(JIMAKU),
    ).resolves.toBe(false);
    await expect(callShared(sharedCredentialPool, runCall)).resolves.toBe(
      'keyless',
    );
  });

  it('warns once while the same settings failure repeats, never with its message', async () => {
    const {sharedCredentialPool, logger} = createTestSharedCredentialPool({
      [JIMAKU]: [42],
    });

    await Promise.all([
      sharedCredentialPool.hasUsableCredential(JIMAKU),
      sharedCredentialPool.hasUsableCredential(BETASERIES),
    ]);
    await sharedCredentialPool.hasUsableCredential(JIMAKU);

    expect(logger.warn).toHaveBeenCalledOnce();
    expect(logger.warn.mock.calls[0][0]).toEqual({
      errorName: 'SettingsValidationError',
    });
  });
});
