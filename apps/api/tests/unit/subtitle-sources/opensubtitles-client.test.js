import {StatusCodes} from 'http-status-codes';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  createOpensubtitlesClient,
  opensubtitlesClient,
} from '../../../src/lib/subtitle-sources/opensubtitles/opensubtitles-client.js';
import {
  toOpensubtitlesAppKeyFingerprint,
  toOpensubtitlesSessionKey,
} from '../../../src/lib/subtitle-sources/opensubtitles/opensubtitles-session.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {readSubtitleSourceResponse} from '../../../src/lib/subtitle-sources/subtitle-source-request.js';
import {readFixture} from '../../helpers/read-fixture.js';
import {createTestSharedCredentialPool} from '../../helpers/shared-credentials.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const SERVER_API_KEY = 'fixture-server-opensubtitles-key';
const SECOND_SERVER_API_KEY = 'fixture-second-server-opensubtitles-key';
const USER_API_KEY = 'fixture-user-opensubtitles-key';
const ACCOUNT_PASSWORD = 'fixture-account-password';
const VIP_API_URL = 'https://vip-api.opensubtitles.com/api/v1';
const FILE_BYTES = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi\n');
const subtitleRef = {
  subtitleSource: SubtitleSource.OPENSUBTITLES,
  siteFileId: '7001',
  siteFileUrl: null,
  catalogSeason: null,
  catalogEpisode: null,
};

function readOpensubtitlesFixture(fileName) {
  return readFixture(`subtitle-sources/opensubtitles/${fileName}`);
}

function makeAccountCredential() {
  return makeSubtitleSourceCredential({
    credentialKind: CredentialKind.ACCOUNT,
    apiKey: undefined,
    username: 'fixture-user',
    password: ACCOUNT_PASSWORD,
  });
}

function createMemorySessionStore() {
  const sessions = new Map();
  const quotas = new Map();
  return {
    readOpensubtitlesSession: async credentialId =>
      sessions.get(credentialId) ?? null,
    storeOpensubtitlesSession: async (credentialId, session) => {
      sessions.set(credentialId, session);
    },
    dropOpensubtitlesSession: async credentialId => {
      sessions.delete(credentialId);
    },
    readOpensubtitlesQuota: async credentialId =>
      quotas.get(credentialId) ?? null,
    storeOpensubtitlesQuota: async (credentialId, quota) => {
      quotas.set(credentialId, {...quotas.get(credentialId), ...quota});
    },
  };
}

function toSitePath(siteRequest) {
  const {hostname, pathname} = new URL(siteRequest.url);
  return hostname === 'www.opensubtitles.com' ? 'file' : pathname;
}

function createFakeSite() {
  const answers = new Map();
  const sentRequests = [];
  let loginSequence = 0;
  let loginGate = null;
  const fakeSite = {
    sentRequests,
    answer(sitePath, ...siteAnswers) {
      answers.set(sitePath, siteAnswers);
    },
    holdLogin() {
      const {promise, resolve} = Promise.withResolvers();
      loginGate = promise;
      return resolve;
    },
    listSent: sitePath =>
      sentRequests.filter(siteRequest => toSitePath(siteRequest) === sitePath),
    async requestSubtitleSource(siteRequest) {
      sentRequests.push(siteRequest);
      await Promise.resolve();
      const sitePath = toSitePath(siteRequest);
      if (sitePath === '/api/v1/login' && loginGate) {
        await loginGate;
      }
      const queuedAnswers = answers.get(sitePath) ?? [];
      const {status, body} =
        queuedAnswers.length > 1 ? queuedAnswers.shift() : queuedAnswers[0];
      const answerBody =
        sitePath === '/api/v1/login' && status === StatusCodes.OK
          ? {...body, token: `token-${(loginSequence += 1)}`}
          : body;
      return readSubtitleSourceResponse(
        {
          status,
          headers: {'content-type': 'application/json'},
          data: Buffer.isBuffer(answerBody)
            ? answerBody
            : Buffer.from(JSON.stringify(answerBody ?? {})),
        },
        siteRequest,
      );
    },
  };
  return fakeSite;
}

function createFakeLogger() {
  return {warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn()};
}

async function createSiteClient({
  appKeys = [SERVER_API_KEY],
  storeOverrides = {},
} = {}) {
  const {
    sharedCredentialPool,
    writeSharedCredentials,
    logger: poolLogger,
  } = createTestSharedCredentialPool({
    [SubtitleSource.OPENSUBTITLES]: appKeys,
  });
  const fakeSite = createFakeSite();
  const [loginBody, downloadBody, userBody, subtitlesBody] = await Promise.all(
    ['login', 'download', 'infos-user', 'subtitles'].map(fileName =>
      readOpensubtitlesFixture(`${fileName}.json`),
    ),
  );
  fakeSite.answer('/api/v1/login', {status: StatusCodes.OK, body: loginBody});
  fakeSite.answer('/api/v1/download', {
    status: StatusCodes.OK,
    body: downloadBody,
  });
  fakeSite.answer('/api/v1/infos/user', {
    status: StatusCodes.OK,
    body: userBody,
  });
  fakeSite.answer('/api/v1/infos/formats', {
    status: StatusCodes.OK,
    body: {data: {output_formats: ['srt']}},
  });
  fakeSite.answer('/api/v1/subtitles', {
    status: StatusCodes.OK,
    body: subtitlesBody,
  });
  fakeSite.answer('file', {status: StatusCodes.OK, body: FILE_BYTES});
  const sessionStore = {...createMemorySessionStore(), ...storeOverrides};
  const logger = createFakeLogger();
  const client = createOpensubtitlesClient({
    requestSubtitleSource: fakeSite.requestSubtitleSource,
    sharedCredentialPool,
    sessionStore,
    logger,
  });
  return {
    client,
    fakeSite,
    sessionStore,
    logger,
    poolLogger,
    downloadBody,
    writeAppKeys: nextAppKeys =>
      writeSharedCredentials({[SubtitleSource.OPENSUBTITLES]: nextAppKeys}),
  };
}

function toPinnedSession(session, apiKey = SERVER_API_KEY) {
  return {
    ...session,
    appKeyFingerprint: toOpensubtitlesAppKeyFingerprint(apiKey),
  };
}

function toErrorText(error) {
  return `${error.message} ${error.cause?.message} ${JSON.stringify(error)}`;
}

function expectNoSecret(error) {
  const errorText = toErrorText(error);
  for (const secret of [
    ACCOUNT_PASSWORD,
    SERVER_API_KEY,
    'token-1',
    'token-2',
  ]) {
    expect(errorText).not.toContain(secret);
  }
}

function rejectStore() {
  return Promise.reject(new Error('Valkey is down.'));
}

describe('createOpensubtitlesClient search', () => {
  it('searches with the server key and maps the hits', async () => {
    const {client, fakeSite} = await createSiteClient();

    const hits = await client.searchSubtitles(
      makeSearchQuery({languageCodes: ['tur']}),
      null,
    );

    expect(hits.map(hit => hit.siteFileId)).toContain('7001');
    const [searchRequest] = fakeSite.listSent('/api/v1/subtitles');
    expect(searchRequest.headers).toMatchObject({'Api-Key': SERVER_API_KEY});
    expect(searchRequest.credentialId).toEqual(expect.any(String));
    expect(searchRequest.credentialId).not.toContain(SERVER_API_KEY);
  });

  it('takes the server app keys round robin, one per search', async () => {
    const {client, fakeSite} = await createSiteClient({
      appKeys: [SERVER_API_KEY, SECOND_SERVER_API_KEY],
    });

    for (const credential of [null, null, makeAccountCredential()]) {
      await client.searchSubtitles(makeSearchQuery(), credential);
    }

    expect(
      fakeSite
        .listSent('/api/v1/subtitles')
        .map(searchRequest => searchRequest.headers['Api-Key']),
    ).toEqual([SERVER_API_KEY, SECOND_SERVER_API_KEY, SERVER_API_KEY]);
  });

  it('moves a rejected app key aside and searches with the next one', async () => {
    const {client, fakeSite, poolLogger} = await createSiteClient({
      appKeys: [SERVER_API_KEY, SECOND_SERVER_API_KEY],
    });
    fakeSite.answer(
      '/api/v1/subtitles',
      {status: StatusCodes.FORBIDDEN, body: {}},
      {status: StatusCodes.OK, body: {data: []}},
    );

    await expect(
      client.searchSubtitles(makeSearchQuery(), null),
    ).resolves.toEqual([]);
    await client.searchSubtitles(makeSearchQuery(), null);

    expect(
      fakeSite
        .listSent('/api/v1/subtitles')
        .map(searchRequest => searchRequest.headers['Api-Key']),
    ).toEqual([SERVER_API_KEY, SECOND_SERVER_API_KEY, SECOND_SERVER_API_KEY]);
    expect(poolLogger.warn).toHaveBeenCalledOnce();
  });

  it('searches nothing without a server or user key', async () => {
    const {client, fakeSite} = await createSiteClient({appKeys: []});

    expect(await client.searchSubtitles(makeSearchQuery(), null)).toBeNull();
    expect(fakeSite.sentRequests).toHaveLength(0);
  });

  it('cannot search without a credential when it has no server key', async () => {
    const {client} = await createSiteClient({appKeys: []});
    await expect(client.canSearchWithoutCredential()).resolves.toBe(false);
  });

  it('searches with the user key when the server has none', async () => {
    const {client, fakeSite} = await createSiteClient({appKeys: []});
    const keyCredential = makeSubtitleSourceCredential({apiKey: USER_API_KEY});

    await client.searchSubtitles(makeSearchQuery(), keyCredential);

    const [searchRequest] = fakeSite.listSent('/api/v1/subtitles');
    expect(searchRequest.headers).toMatchObject({'Api-Key': USER_API_KEY});
    expect(searchRequest.credentialId).toBe(keyCredential.credentialId);
  });
});

describe('createOpensubtitlesClient availability', () => {
  it('is available while the server has an app key, and follows the settings', async () => {
    const {client, writeAppKeys} = await createSiteClient({appKeys: []});
    await expect(client.isAvailable()).resolves.toBe(false);

    await writeAppKeys([SERVER_API_KEY]);
    await expect(client.isAvailable()).resolves.toBe(true);

    await writeAppKeys([]);
    await expect(client.isAvailable()).resolves.toBe(false);
  });

  it('stays available once its one configured key is rejected, and then searches nothing', async () => {
    const {client, fakeSite, poolLogger} = await createSiteClient();
    fakeSite.answer('/api/v1/subtitles', {
      status: StatusCodes.FORBIDDEN,
      body: {},
    });

    await expect(
      client.searchSubtitles(makeSearchQuery(), null),
    ).resolves.toBeNull();
    await expect(
      client.searchSubtitles(makeSearchQuery(), null),
    ).resolves.toBeNull();

    await expect(client.isAvailable()).resolves.toBe(true);
    await expect(client.canSearchWithoutCredential()).resolves.toBe(false);
    expect(fakeSite.listSent('/api/v1/subtitles')).toHaveLength(1);
    expect(poolLogger.warn).toHaveBeenCalledOnce();
  });
});

describe('createOpensubtitlesClient download', () => {
  let siteClient;
  let accountCredential;

  beforeEach(async () => {
    siteClient = await createSiteClient();
    accountCredential = makeAccountCredential();
  });

  it('downloads through the base url the login returned', async () => {
    const {client, fakeSite, downloadBody} = siteClient;

    const download = await client.downloadSubtitle(
      subtitleRef,
      accountCredential,
    );

    expect(download).toEqual({
      fileBytes: FILE_BYTES,
      fileNameHint: downloadBody.file_name,
      extractedEntryPath: null,
    });
    const [downloadRequest] = fakeSite.listSent('/api/v1/download');
    expect(downloadRequest.url).toBe(`${VIP_API_URL}/download`);
    expect(downloadRequest.headers).toMatchObject({
      'Api-Key': SERVER_API_KEY,
      Authorization: 'Bearer token-1',
    });
    expect(fakeSite.listSent('file')[0].url).toBe(downloadBody.link);
  });

  it('logs in once for two concurrent downloads of one account', async () => {
    const {client, fakeSite} = siteClient;

    await Promise.all([
      client.downloadSubtitle(subtitleRef, accountCredential),
      client.downloadSubtitle(subtitleRef, accountCredential),
    ]);

    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(2);
  });

  it('refreshes the token once after a 401 and retries once', async () => {
    const {client, fakeSite, downloadBody} = siteClient;
    fakeSite.answer(
      '/api/v1/download',
      {status: StatusCodes.UNAUTHORIZED, body: {message: 'Unauthorized'}},
      {status: StatusCodes.OK, body: downloadBody},
    );

    await client.downloadSubtitle(subtitleRef, accountCredential);

    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    const downloadRequests = fakeSite.listSent('/api/v1/download');
    expect(
      downloadRequests.map(request => request.headers.Authorization),
    ).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('refreshes one token for two downloads rejected together', async () => {
    const {client, fakeSite, downloadBody} = siteClient;
    const rejection = {
      status: StatusCodes.UNAUTHORIZED,
      body: {message: 'Unauthorized'},
    };
    fakeSite.answer('/api/v1/download', rejection, rejection, {
      status: StatusCodes.OK,
      body: downloadBody,
    });

    await Promise.all([
      client.downloadSubtitle(subtitleRef, accountCredential),
      client.downloadSubtitle(subtitleRef, accountCredential),
    ]);

    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(4);
  });

  it('takes a token another caller refreshed under the same app key, without logging in', async () => {
    const storedSessions = [
      toPinnedSession({token: 'token-old', baseUrl: VIP_API_URL}),
      toPinnedSession({token: 'token-new', baseUrl: VIP_API_URL}),
    ];
    const {client, fakeSite, downloadBody} = await createSiteClient({
      storeOverrides: {
        readOpensubtitlesSession: async () => storedSessions.shift() ?? null,
      },
    });
    fakeSite.answer(
      '/api/v1/download',
      {status: StatusCodes.UNAUTHORIZED, body: {message: 'Unauthorized'}},
      {status: StatusCodes.OK, body: downloadBody},
    );

    await client.downloadSubtitle(subtitleRef, accountCredential);

    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(0);
    expect(
      fakeSite
        .listSent('/api/v1/download')
        .map(request => request.headers.Authorization),
    ).toEqual(['Bearer token-old', 'Bearer token-new']);
  });

  it('stores the refreshed token for the next call', async () => {
    const {client, fakeSite, sessionStore, downloadBody} = siteClient;
    fakeSite.answer(
      '/api/v1/download',
      {status: StatusCodes.UNAUTHORIZED, body: {message: 'Unauthorized'}},
      {status: StatusCodes.OK, body: downloadBody},
    );
    await client.downloadSubtitle(subtitleRef, accountCredential);

    await client.downloadSubtitle(subtitleRef, accountCredential);

    expect(
      await sessionStore.readOpensubtitlesSession(
        toOpensubtitlesSessionKey(accountCredential),
      ),
    ).toEqual(toPinnedSession({token: 'token-2', baseUrl: VIP_API_URL}));
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    expect(
      fakeSite.listSent('/api/v1/download').at(-1).headers.Authorization,
    ).toBe('Bearer token-2');
  });

  it('refreshes the token after a 406 invalid token answer', async () => {
    const {client, fakeSite, downloadBody} = siteClient;
    fakeSite.answer(
      '/api/v1/download',
      {status: StatusCodes.NOT_ACCEPTABLE, body: {message: 'invalid token'}},
      {status: StatusCodes.OK, body: downloadBody},
    );

    await client.downloadSubtitle(subtitleRef, accountCredential);

    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(2);
  });

  it('refreshes the token after a 500 invalid answer', async () => {
    const {client, fakeSite, downloadBody} = siteClient;
    fakeSite.answer(
      '/api/v1/download',
      {status: StatusCodes.INTERNAL_SERVER_ERROR, body: {message: 'invalid'}},
      {status: StatusCodes.OK, body: downloadBody},
    );

    await client.downloadSubtitle(subtitleRef, accountCredential);

    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(2);
  });

  it('gives up after a second rejection without blaming the account', async () => {
    const {client, fakeSite} = siteClient;
    fakeSite.answer('/api/v1/download', {
      status: StatusCodes.UNAUTHORIZED,
      body: {message: 'Unauthorized'},
    });

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
    expectNoSecret(error);
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(2);
  });

  it('passes on a quota answer that follows a refresh', async () => {
    const {client, fakeSite} = siteClient;
    fakeSite.answer(
      '/api/v1/download',
      {status: StatusCodes.UNAUTHORIZED, body: {message: 'Unauthorized'}},
      {
        status: StatusCodes.NOT_ACCEPTABLE,
        body: {
          remaining: -1,
          reset_time_utc: new Date(Date.now() + 3600000).toISOString(),
        },
      },
    );

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
  });

  it('stops at once for a signal already aborted', async () => {
    const {client} = siteClient;

    await expect(
      client.downloadSubtitle(subtitleRef, accountCredential, {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it('blames no one for a login refused for the server key', async () => {
    const {client, fakeSite} = siteClient;
    fakeSite.answer('/api/v1/login', {
      status: StatusCodes.FORBIDDEN,
      body: {message: 'You cannot consume this service'},
    });

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(0);
  });

  it('keeps a good token when a download is refused for the server key', async () => {
    const {client, fakeSite, sessionStore} = siteClient;
    const cachedSession = toPinnedSession({
      token: 'token-cached',
      baseUrl: VIP_API_URL,
    });
    await sessionStore.storeOpensubtitlesSession(
      toOpensubtitlesSessionKey(accountCredential),
      cachedSession,
    );
    fakeSite.answer('/api/v1/download', {
      status: StatusCodes.FORBIDDEN,
      body: {message: 'You cannot consume this service'},
    });

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(0);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(1);
    expect(
      await sessionStore.readOpensubtitlesSession(
        toOpensubtitlesSessionKey(accountCredential),
      ),
    ).toEqual(cachedSession);
  });

  it('never logs in without a server key', async () => {
    const {client, fakeSite} = await createSiteClient({appKeys: []});

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
    expect(fakeSite.sentRequests).toHaveLength(0);
  });

  describe('with an account session pinned to its app key', () => {
    function createTwoKeyClient() {
      return createSiteClient({
        appKeys: [SERVER_API_KEY, SECOND_SERVER_API_KEY],
      });
    }

    function listAppKeys(fakeSite, sitePath) {
      return fakeSite
        .listSent(sitePath)
        .map(siteRequest => siteRequest.headers['Api-Key']);
    }

    it('keeps the app key that logged it in while the rotation moves on', async () => {
      const {client, fakeSite} = await createTwoKeyClient();

      for (let downloadIndex = 0; downloadIndex < 3; downloadIndex += 1) {
        await client.downloadSubtitle(subtitleRef, accountCredential);
        await client.searchSubtitles(makeSearchQuery(), null);
      }

      expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([SERVER_API_KEY]);
      expect(listAppKeys(fakeSite, '/api/v1/download')).toEqual([
        SERVER_API_KEY,
        SERVER_API_KEY,
        SERVER_API_KEY,
      ]);
    });

    it('stores a fingerprint of its app key and never the key itself', async () => {
      const {client, sessionStore} = await createTwoKeyClient();

      await client.downloadSubtitle(subtitleRef, accountCredential);

      const storedSession = await sessionStore.readOpensubtitlesSession(
        toOpensubtitlesSessionKey(accountCredential),
      );
      expect(storedSession).toEqual(
        toPinnedSession({token: 'token-1', baseUrl: VIP_API_URL}),
      );
      expect(JSON.stringify(storedSession)).not.toContain(SERVER_API_KEY);
    });

    it('keeps its app key while that key rests after a search limit, without a new login', async () => {
      const {client, fakeSite} = await createTwoKeyClient();
      await client.downloadSubtitle(subtitleRef, accountCredential);
      fakeSite.answer('/api/v1/subtitles', {
        status: StatusCodes.TOO_MANY_REQUESTS,
        body: {},
      });
      await expect(
        client.searchSubtitles(makeSearchQuery(), null),
      ).rejects.toBeInstanceOf(SourceRateLimitError);

      await client.downloadSubtitle(subtitleRef, accountCredential);

      expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([SERVER_API_KEY]);
      expect(listAppKeys(fakeSite, '/api/v1/download')).toEqual([
        SERVER_API_KEY,
        SERVER_API_KEY,
      ]);
    });

    it('logs in again with another key once its key leaves the settings', async () => {
      const {client, fakeSite, writeAppKeys} = await createTwoKeyClient();
      await client.downloadSubtitle(subtitleRef, accountCredential);

      await writeAppKeys([SECOND_SERVER_API_KEY]);
      await client.downloadSubtitle(subtitleRef, accountCredential);

      expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([
        SERVER_API_KEY,
        SECOND_SERVER_API_KEY,
      ]);
      expect(
        fakeSite
          .listSent('/api/v1/download')
          .map(({headers}) => [headers['Api-Key'], headers.Authorization]),
      ).toEqual([
        [SERVER_API_KEY, 'Bearer token-1'],
        [SECOND_SERVER_API_KEY, 'Bearer token-2'],
      ]);
    });

    it.each([
      ['the login', '/api/v1/login', 'downloadSubtitle'],
      ['the download link', '/api/v1/download', 'downloadSubtitle'],
      ['the quota read', '/api/v1/infos/user', 'readQuota'],
    ])(
      'fails a 403 on %s as unavailable, with one key tried and every key left usable',
      async (_, sitePath, clientCall) => {
        const {client, fakeSite, poolLogger} = await createTwoKeyClient();
        fakeSite.answer(sitePath, {
          status: StatusCodes.FORBIDDEN,
          body: {message: 'You cannot consume this service'},
        });

        const error = await client[clientCall](
          ...(clientCall === 'downloadSubtitle'
            ? [subtitleRef, accountCredential]
            : [accountCredential]),
        ).catch(caughtError => caughtError);
        await client.searchSubtitles(makeSearchQuery(), null);
        await client.searchSubtitles(makeSearchQuery(), null);

        expect(error).toBeInstanceOf(SourceUnavailableError);
        expect(error.credentialId).toBeUndefined();
        expect(listAppKeys(fakeSite, sitePath)).toEqual([SERVER_API_KEY]);
        expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([
          SERVER_API_KEY,
        ]);
        expect(poolLogger.warn).not.toHaveBeenCalled();
        await expect(client.canSearchWithoutCredential()).resolves.toBe(true);
        expect(listAppKeys(fakeSite, '/api/v1/subtitles')).toEqual([
          SECOND_SERVER_API_KEY,
          SERVER_API_KEY,
        ]);
      },
    );

    it('logs in again with another key once a keyless search rests its key', async () => {
      const {client, fakeSite, poolLogger} = await createTwoKeyClient();
      await client.downloadSubtitle(subtitleRef, accountCredential);
      fakeSite.answer(
        '/api/v1/subtitles',
        {status: StatusCodes.OK, body: {data: []}},
        {status: StatusCodes.FORBIDDEN, body: {}},
        {status: StatusCodes.OK, body: {data: []}},
      );

      await client.searchSubtitles(makeSearchQuery(), null);
      await client.searchSubtitles(makeSearchQuery(), null);
      await client.downloadSubtitle(subtitleRef, accountCredential);

      expect(listAppKeys(fakeSite, '/api/v1/subtitles')).toEqual([
        SECOND_SERVER_API_KEY,
        SERVER_API_KEY,
        SECOND_SERVER_API_KEY,
      ]);
      expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([
        SERVER_API_KEY,
        SECOND_SERVER_API_KEY,
      ]);
      expect(
        fakeSite
          .listSent('/api/v1/download')
          .map(({headers}) => [headers['Api-Key'], headers.Authorization]),
      ).toEqual([
        [SERVER_API_KEY, 'Bearer token-1'],
        [SECOND_SERVER_API_KEY, 'Bearer token-2'],
      ]);
      expect(poolLogger.warn).toHaveBeenCalledOnce();
    });

    it('never calls the account invalid for a 403 on the login', async () => {
      const {client, fakeSite} = await createTwoKeyClient();
      fakeSite.answer('/api/v1/login', {
        status: StatusCodes.FORBIDDEN,
        body: {message: 'You cannot consume this service'},
      });

      const error = await client
        .checkCredential(accountCredential)
        .catch(caughtError => caughtError);

      expect(error).toBeInstanceOf(SourceUnavailableError);
      expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([SERVER_API_KEY]);
    });

    it('still rests a key a keyless search gets a 403 for, after an account call 403', async () => {
      const {client, fakeSite, poolLogger} = await createTwoKeyClient();
      fakeSite.answer('/api/v1/download', {
        status: StatusCodes.FORBIDDEN,
        body: {message: 'You cannot consume this service'},
      });
      await client
        .downloadSubtitle(subtitleRef, accountCredential)
        .catch(caughtError => caughtError);
      fakeSite.answer(
        '/api/v1/subtitles',
        {status: StatusCodes.FORBIDDEN, body: {}},
        {status: StatusCodes.OK, body: {data: []}},
      );

      await client.searchSubtitles(makeSearchQuery(), null);
      await client.searchSubtitles(makeSearchQuery(), null);

      expect(listAppKeys(fakeSite, '/api/v1/subtitles')).toEqual([
        SECOND_SERVER_API_KEY,
        SERVER_API_KEY,
        SERVER_API_KEY,
      ]);
      expect(poolLogger.warn).toHaveBeenCalledOnce();
    });

    it('blames only the account for a wrong password, never the app key', async () => {
      const {client, fakeSite, poolLogger} = await createTwoKeyClient();
      fakeSite.answer('/api/v1/login', {
        status: StatusCodes.UNAUTHORIZED,
        body: {message: 'Error, invalid username/password', status: 401},
      });

      const error = await client
        .downloadSubtitle(subtitleRef, accountCredential)
        .catch(caughtError => caughtError);
      const credentialCheck = await client.checkCredential(accountCredential);

      expect(error).toBeInstanceOf(SourceCredentialError);
      expect(error.credentialId).toBe(accountCredential.credentialId);
      expect(credentialCheck.credentialStatus).toBe(CredentialStatus.INVALID);
      expect(poolLogger.warn).not.toHaveBeenCalled();
      await expect(client.isAvailable()).resolves.toBe(true);
      expect(listAppKeys(fakeSite, '/api/v1/login')).toEqual([
        SERVER_API_KEY,
        SECOND_SERVER_API_KEY,
      ]);
    });

    it('never sends a token with an app key that did not mint it', async () => {
      const {client, fakeSite} = await createTwoKeyClient();
      const releaseLogin = fakeSite.holdLogin();

      const downloads = Promise.all([
        client.downloadSubtitle(subtitleRef, accountCredential),
        client.downloadSubtitle(subtitleRef, accountCredential),
      ]);
      await vi.waitFor(() =>
        expect(fakeSite.listSent('/api/v1/login').length).toBeGreaterThan(0),
      );
      releaseLogin();
      await downloads;
      await client.downloadSubtitle(subtitleRef, accountCredential);

      const loginKeys = listAppKeys(fakeSite, '/api/v1/login');
      for (const {headers} of fakeSite.listSent('/api/v1/download')) {
        const loginIndex = Number(headers.Authorization.split('-').at(-1)) - 1;
        expect(headers['Api-Key']).toBe(loginKeys[loginIndex]);
      }
    });
  });

  it('keeps the bytes when the quota cache cannot be written', async () => {
    const {client, logger} = await createSiteClient({
      storeOverrides: {storeOpensubtitlesQuota: rejectStore},
    });

    const download = await client.downloadSubtitle(
      subtitleRef,
      accountCredential,
    );

    expect(download.fileBytes).toEqual(FILE_BYTES);
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalled());
    const loggedText = JSON.stringify(logger.warn.mock.calls);
    for (const secret of [ACCOUNT_PASSWORD, SERVER_API_KEY, 'token-1']) {
      expect(loggedText).not.toContain(secret);
    }
  });

  it('writes the quota only after the bytes are in hand', async () => {
    let fileFetchCountAtWrite = null;
    const siteClientWithProbe = await createSiteClient({
      storeOverrides: {
        storeOpensubtitlesQuota: async () => {
          fileFetchCountAtWrite =
            siteClientWithProbe.fakeSite.listSent('file').length;
        },
      },
    });

    await siteClientWithProbe.client.downloadSubtitle(
      subtitleRef,
      accountCredential,
    );

    await vi.waitFor(() => expect(fileFetchCountAtWrite).toBe(1));
  });

  it('keeps the quota error when the quota cache cannot be written', async () => {
    const {client, fakeSite} = await createSiteClient({
      storeOverrides: {storeOpensubtitlesQuota: rejectStore},
    });
    fakeSite.answer('/api/v1/download', {
      status: StatusCodes.NOT_ACCEPTABLE,
      body: {
        remaining: -1,
        reset_time_utc: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
  });

  it('downloads while the session store is down', async () => {
    const {client, fakeSite} = await createSiteClient({
      storeOverrides: {
        readOpensubtitlesSession: rejectStore,
        storeOpensubtitlesSession: rejectStore,
      },
    });

    const download = await client.downloadSubtitle(
      subtitleRef,
      accountCredential,
    );

    expect(download.fileBytes).toEqual(FILE_BYTES);
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
  });

  it('runs a shared login on no caller signal and lets each waiter abort', async () => {
    const {client, fakeSite} = siteClient;
    const releaseLogin = fakeSite.holdLogin();
    const abortController = new AbortController();

    const abortedDownload = client
      .downloadSubtitle(subtitleRef, accountCredential, {
        signal: abortController.signal,
      })
      .catch(caughtError => caughtError);
    const waitingDownload = client.downloadSubtitle(
      subtitleRef,
      accountCredential,
    );
    await vi.waitFor(() =>
      expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1),
    );
    abortController.abort();

    expect(await abortedDownload).toBeInstanceOf(SourceUnavailableError);
    releaseLogin();
    expect((await waitingDownload).fileBytes).toEqual(FILE_BYTES);
    const [loginRequest] = fakeSite.listSent('/api/v1/login');
    expect(loginRequest.signal).toBeUndefined();
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
  });

  it('never logs in again after a login 401', async () => {
    const {client, fakeSite} = siteClient;
    fakeSite.answer('/api/v1/login', {
      status: StatusCodes.UNAUTHORIZED,
      body: {message: 'Error, invalid username/password', status: 401},
    });

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
    expectNoSecret(error);
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
    expect(fakeSite.listSent('/api/v1/download')).toHaveLength(0);
  });

  it('turns a 406 quota answer into a rate-limit error and a spent quota', async () => {
    const {client, fakeSite, sessionStore} = siteClient;
    fakeSite.answer('/api/v1/download', {
      status: StatusCodes.NOT_ACCEPTABLE,
      body: {
        remaining: -1,
        reset_time_utc: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    const error = await client
      .downloadSubtitle(subtitleRef, accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
    expect(
      await sessionStore.readOpensubtitlesQuota(
        toOpensubtitlesSessionKey(accountCredential),
      ),
    ).toMatchObject({quotaRemainingCount: 0});
  });

  it('stores the quota a download reports', async () => {
    const {client, sessionStore, downloadBody} = siteClient;

    await client.downloadSubtitle(subtitleRef, accountCredential);

    expect(
      await sessionStore.readOpensubtitlesQuota(
        toOpensubtitlesSessionKey(accountCredential),
      ),
    ).toEqual({
      quotaRemainingCount: 17,
      quotaResetAt: downloadBody.reset_time_utc,
    });
  });

  it('never fetches a link to a private host', async () => {
    const {client, fakeSite, downloadBody} = siteClient;
    fakeSite.answer('/api/v1/download', {
      status: StatusCodes.OK,
      body: {...downloadBody, link: 'https://169.254.169.254/latest'},
    });

    await expect(
      client.downloadSubtitle(subtitleRef, accountCredential),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(fakeSite.listSent('file')).toHaveLength(0);
  });

  it('downloads nothing with an api key alone and blames no key', async () => {
    const {client, fakeSite} = siteClient;

    const error = await client
      .downloadSubtitle(
        subtitleRef,
        makeSubtitleSourceCredential({apiKey: USER_API_KEY}),
      )
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceCredentialError);
    expect(error.credentialId).toBeNull();
    expect(fakeSite.sentRequests).toHaveLength(0);
  });
});

describe('an OpenSubtitles account replaced on the same credential', () => {
  it('logs in again and never uses the old token', async () => {
    const {client, fakeSite} = await createSiteClient();
    const oldAccount = makeAccountCredential();
    const newAccount = {...oldAccount, password: 'fixture-new-password'};

    await client.downloadSubtitle(subtitleRef, oldAccount);
    await client.downloadSubtitle(subtitleRef, newAccount);

    const downloadTokens = fakeSite
      .listSent('/api/v1/download')
      .map(({headers}) => headers.Authorization);
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(2);
    expect(downloadTokens).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('keys the session by the credential id and a keyed account fingerprint', () => {
    const account = makeAccountCredential();
    const sessionKey = toOpensubtitlesSessionKey(account);

    expect(sessionKey.startsWith(`${account.credentialId}:`)).toBe(true);
    expect(sessionKey).not.toContain(account.username);
    expect(sessionKey).not.toContain(ACCOUNT_PASSWORD);
    expect(toOpensubtitlesSessionKey({...account})).toBe(sessionKey);
  });

  it('reads the new account quota, not the old cached one', async () => {
    const {client, fakeSite} = await createSiteClient();
    const oldAccount = makeAccountCredential();
    const newAccount = {...oldAccount, username: 'fixture-other-user'};

    await client.readQuota(oldAccount);
    await client.readQuota(newAccount);

    expect(fakeSite.listSent('/api/v1/infos/user')).toHaveLength(2);
  });
});

describe('createOpensubtitlesClient quota and checks', () => {
  it('reads the quota once and serves it from the cache after', async () => {
    const {client, fakeSite, sessionStore} = await createSiteClient();
    const accountCredential = makeAccountCredential();
    await sessionStore.storeOpensubtitlesQuota(
      toOpensubtitlesSessionKey(accountCredential),
      {
        quotaRemainingCount: 18,
        quotaResetAt: '2026-11-19T00:00:00.000Z',
      },
    );

    const quota = await client.readQuota(accountCredential);
    const cachedQuota = await client.readQuota(accountCredential);

    expect(quota).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: '2026-11-19T00:00:00.000Z',
    });
    expect(cachedQuota).toEqual(quota);
    expect(fakeSite.listSent('/api/v1/infos/user')).toHaveLength(1);
  });

  it('reads an api key quota as a key check with no counts', async () => {
    const {client, fakeSite} = await createSiteClient();

    expect(
      await client.readQuota(
        makeSubtitleSourceCredential({apiKey: USER_API_KEY}),
      ),
    ).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: null,
      quotaAllowedCount: null,
      quotaResetAt: null,
    });
    expect(fakeSite.listSent('/api/v1/infos/formats')).toHaveLength(1);
  });

  it('passes a throttled login on rather than calling the account invalid', async () => {
    const {client, fakeSite} = await createSiteClient();
    fakeSite.answer('/api/v1/login', {
      status: StatusCodes.TOO_MANY_REQUESTS,
      body: {message: 'Throttle limit reached. Retry later.'},
    });
    const accountCredential = makeAccountCredential();

    const error = await client
      .checkCredential(accountCredential)
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceRateLimitError);
    expect(error.credentialId).toBe(accountCredential.credentialId);
  });

  it('checks an account by logging in and reading its quota', async () => {
    const {client, fakeSite} = await createSiteClient();

    expect(await client.checkCredential(makeAccountCredential())).toEqual({
      credentialStatus: CredentialStatus.VALID,
      quotaRemainingCount: 17,
      quotaAllowedCount: 20,
      quotaResetAt: null,
    });
    expect(fakeSite.listSent('/api/v1/login')).toHaveLength(1);
  });

  it('never calls an account invalid for a server key refusal', async () => {
    const {client, fakeSite} = await createSiteClient();
    fakeSite.answer('/api/v1/login', {
      status: StatusCodes.FORBIDDEN,
      body: {message: 'You cannot consume this service'},
    });

    const error = await client
      .checkCredential(makeAccountCredential())
      .catch(caughtError => caughtError);

    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.credentialId).toBeUndefined();
  });

  it.each(['checkCredential', 'readQuota'])(
    'asks nothing in %s for an account without a server key',
    async clientCall => {
      const {client, fakeSite} = await createSiteClient({appKeys: []});

      await expect(
        client[clientCall](makeAccountCredential()),
      ).rejects.toBeInstanceOf(SourceUnavailableError);
      expect(fakeSite.sentRequests).toHaveLength(0);
    },
  );

  it('reads an account whose login is refused as invalid', async () => {
    const {client, fakeSite} = await createSiteClient();
    fakeSite.answer('/api/v1/login', {
      status: StatusCodes.UNAUTHORIZED,
      body: {message: 'Error, invalid username/password', status: 401},
    });

    expect(
      (await client.checkCredential(makeAccountCredential())).credentialStatus,
    ).toBe(CredentialStatus.INVALID);
  });

  it.each([
    [StatusCodes.OK, CredentialStatus.VALID],
    [StatusCodes.UNAUTHORIZED, CredentialStatus.INVALID],
  ])(
    'reads an api key answered with %i as %s',
    async (status, credentialStatus) => {
      const {client, fakeSite} = await createSiteClient();
      fakeSite.answer('/api/v1/infos/formats', {status, body: {}});

      expect(
        (
          await client.checkCredential(
            makeSubtitleSourceCredential({apiKey: USER_API_KEY}),
          )
        ).credentialStatus,
      ).toBe(credentialStatus);
      expect(fakeSite.listSent('/api/v1/login')).toHaveLength(0);
    },
  );
});

describe('opensubtitlesClient', () => {
  it('names its subtitle source and takes an account or an api key', () => {
    expect(opensubtitlesClient.subtitleSource).toBe(
      SubtitleSource.OPENSUBTITLES,
    );
    expect(opensubtitlesClient.credentialKinds).toEqual([
      CredentialKind.ACCOUNT,
      CredentialKind.API_KEY,
    ]);
  });

  it('searches with a server app key but downloads only with an account', async () => {
    const {client} = await createSiteClient();

    await expect(client.canSearchWithoutCredential()).resolves.toBe(true);
    expect(client.canDownloadWithoutCredential()).toBe(false);
  });

  it('ranks by video hash', () => {
    expect(opensubtitlesClient.isSearchHashSensitive).toBe(true);
  });

  it('declares one download per five seconds per account and a server budget for the app key', () => {
    expect(opensubtitlesClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 5000,
        requestMax: 1,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements the search, download, credential check and quota calls', () => {
    expect(opensubtitlesClient.searchSubtitles).toBeTypeOf('function');
    expect(opensubtitlesClient.downloadSubtitle).toBeTypeOf('function');
    expect(opensubtitlesClient.checkCredential).toBeTypeOf('function');
    expect(opensubtitlesClient.readQuota).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(opensubtitlesClient);
  });
});
