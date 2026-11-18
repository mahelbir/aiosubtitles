import {beforeEach, describe, expect, it} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  SubtitleMessage,
  SubtitleNotice,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {buildMessageSrt} from '@repo/subtitle-core/file-format/message-srt.js';
import {uuidV4} from '../../src/lib/common.js';
import {RateLimitKey} from '../../src/lib/rate-limit.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {redis} from '../../src/redis/index.js';
import {setTestAppOptions} from '../helpers/app.js';
import {
  asClientIp,
  createStubVideoCatalog,
  requestAddonPath,
  toFilePath,
  toListPath,
  toManifestPath,
  toNoticePath,
} from '../helpers/addon-requests.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const MOVIE_ID = 'tt0133093';
const LIST_USER_CONFIG_MAX = 30;
const LIST_IP_MAX = 40;
const FILE_USER_CONFIG_MAX = 30;
const FILE_IP_MAX = 40;
const MANIFEST_USER_CONFIG_MAX = 10;
const MANIFEST_IP_MAX = 30;
const GLOBAL_IP_MAX = 50;
const RATE_LIMIT_NAMESPACE = 'rate:';
const MESSAGE_CACHE_CONTROL = 'no-store';
const RATE_LIMITED_TEXT = 'Too many requests, try again in a minute.';
const UNKNOWN_URL_CODE = 'a'.repeat(64);

const thesubtitledbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.THESUBTITLEDB,
});

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([thesubtitledbClient]),
  videoCatalog: createStubVideoCatalog(),
});

beforeEach(() => {
  thesubtitledbClient.searchSubtitles
    .mockReset()
    .mockResolvedValue([makeSubtitleSourceHit()]);
  thesubtitledbClient.downloadSubtitle.mockReset().mockRejectedValue(
    new SourceUnavailableError({
      subtitleSource: SubtitleSource.THESUBTITLEDB,
    }),
  );
});

async function createAddonUserConfig() {
  const {userConfig} = await createUserConfig({
    subtitleSourceSwitchStates: makeSwitchStatesOnly([
      SubtitleSource.THESUBTITLEDB,
    ]),
  });
  return userConfig;
}

async function requestTimes(times, toRequest) {
  const responses = [];
  for (let requestIndex = 0; requestIndex < times; requestIndex += 1) {
    const {addonPath, headers} = toRequest(requestIndex);
    responses.push(await requestAddonPath(addonPath, headers));
  }
  return responses;
}

function readSubtitleCount(response) {
  return response.json().subtitles.length;
}

function expectRateLimitedSrt(response) {
  expect(response.statusCode).toBe(StatusCodes.OK);
  expect(response.body).toBe(
    buildMessageSrt(SubtitleMessage.label(SubtitleMessage.RATE_LIMITED)),
  );
  expect(response.body).toContain(RATE_LIMITED_TEXT);
  expect(response.headers['cache-control']).toBe(MESSAGE_CACHE_CONTROL);
}

function toNotFoundSrt() {
  return buildMessageSrt(
    SubtitleMessage.label(SubtitleMessage.SUBTITLE_NOT_FOUND),
  );
}

async function listRateLimitKeys() {
  return redis.keys(`${RATE_LIMIT_NAMESPACE}*`);
}

describe('the subtitle list rate limits', () => {
  it('answers an empty list once one user config spends its window', async () => {
    const userConfig = await createAddonUserConfig();
    const addonPath = toListPath({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
    });

    const responses = await requestTimes(
      LIST_USER_CONFIG_MAX + 1,
      requestIndex => ({addonPath, headers: asClientIp(requestIndex)}),
    );
    const limited = responses.at(-1);

    expect(responses.slice(0, -1).map(response => response.statusCode)).toEqual(
      Array(LIST_USER_CONFIG_MAX).fill(StatusCodes.OK),
    );
    expect(responses.slice(0, -1).map(readSubtitleCount)).not.toContain(0);
    expect(limited.statusCode).toBe(StatusCodes.OK);
    expect(limited.json()).toEqual({subtitles: []});
    expect(limited.headers['cache-control']).toBe(MESSAGE_CACHE_CONTROL);
  });

  it('answers an empty list once one address spends its window', async () => {
    const userConfigs = await Promise.all([
      createAddonUserConfig(),
      createAddonUserConfig(),
    ]);

    const responses = await requestTimes(LIST_IP_MAX + 1, requestIndex => ({
      addonPath: toListPath({
        userConfigId: userConfigs[requestIndex % userConfigs.length].id,
        videoId: MOVIE_ID,
      }),
      headers: asClientIp(0),
    }));
    const limited = responses.at(-1);

    expect(responses.slice(0, -1).map(readSubtitleCount)).not.toContain(0);
    expect(limited.statusCode).toBe(StatusCodes.OK);
    expect(limited.json()).toEqual({subtitles: []});
  });

  it('counts the user config window apart from the address window and without the video', async () => {
    const userConfig = await createAddonUserConfig();

    await requestAddonPath(
      toListPath({userConfigId: userConfig.id, videoId: MOVIE_ID}),
      asClientIp(0),
    );
    const rateLimitKeys = await listRateLimitKeys();

    expect(
      rateLimitKeys.filter(
        rateLimitKey =>
          rateLimitKey.startsWith(
            `${RATE_LIMIT_NAMESPACE}${RateLimitKey.USER_CONFIG}:`,
          ) && rateLimitKey.includes(userConfig.id),
      ),
    ).toHaveLength(1);
    expect(
      rateLimitKeys.filter(rateLimitKey => rateLimitKey.includes(MOVIE_ID)),
    ).toEqual([]);
  });
});

describe('the subtitle file rate limits', () => {
  it('answers the rate limited subtitle once one address spends its window', async () => {
    const addonPath = toFilePath({
      userConfigId: uuidV4(),
      videoId: MOVIE_ID,
      urlCode: UNKNOWN_URL_CODE,
    });

    const responses = await requestTimes(FILE_IP_MAX + 1, () => ({
      addonPath,
      headers: asClientIp(0),
    }));

    expect(responses.slice(0, -1).map(response => response.body)).toEqual(
      Array(FILE_IP_MAX).fill(toNotFoundSrt()),
    );
    expectRateLimitedSrt(responses.at(-1));
  });

  it('counts an unknown user config by address only', async () => {
    const addonPath = toFilePath({
      userConfigId: uuidV4(),
      videoId: MOVIE_ID,
      urlCode: UNKNOWN_URL_CODE,
    });

    const responses = await requestTimes(
      FILE_USER_CONFIG_MAX + 1,
      requestIndex => ({addonPath, headers: asClientIp(requestIndex)}),
    );

    expect(responses.map(response => response.body)).toEqual(
      Array(FILE_USER_CONFIG_MAX + 1).fill(toNotFoundSrt()),
    );
  });

  it('answers the rate limited subtitle once a stored user config spends its window', async () => {
    const userConfig = await createAddonUserConfig();
    const addonPath = toFilePath({
      userConfigId: userConfig.id,
      videoId: MOVIE_ID,
      urlCode: UNKNOWN_URL_CODE,
    });

    const responses = await requestTimes(
      FILE_USER_CONFIG_MAX + 1,
      requestIndex => ({addonPath, headers: asClientIp(requestIndex)}),
    );

    expect(responses.slice(0, -1).map(response => response.body)).toEqual(
      Array(FILE_USER_CONFIG_MAX).fill(toNotFoundSrt()),
    );
    expectRateLimitedSrt(responses.at(-1));
  });
});

describe('the subtitle notice rate limits', () => {
  it('answers the rate limited subtitle once one address spends its window', async () => {
    const addonPath = toNoticePath({
      userConfigId: uuidV4(),
      noticeName: SubtitleNotice.OPENSUBTITLES_ACCOUNT,
    });

    const responses = await requestTimes(FILE_IP_MAX + 1, () => ({
      addonPath,
      headers: asClientIp(0),
    }));

    expect(responses.slice(0, -1).map(response => response.body)).toEqual(
      Array(FILE_IP_MAX).fill(
        buildMessageSrt(
          SubtitleNotice.item(SubtitleNotice.OPENSUBTITLES_ACCOUNT)
            .noticeFileText,
        ),
      ),
    );
    expectRateLimitedSrt(responses.at(-1));
  });
});

describe('the global rate limit on addon routes', () => {
  it('answers the rate limited subtitle once one address spends the global window', async () => {
    const userConfigId = uuidV4();
    const filePath = toFilePath({
      userConfigId,
      videoId: MOVIE_ID,
      urlCode: UNKNOWN_URL_CODE,
    });
    const noticePath = toNoticePath({
      userConfigId,
      noticeName: SubtitleNotice.OPENSUBTITLES_ACCOUNT,
    });

    const responses = await requestTimes(GLOBAL_IP_MAX + 1, requestIndex => ({
      addonPath:
        requestIndex < GLOBAL_IP_MAX / 2 || requestIndex === GLOBAL_IP_MAX
          ? filePath
          : noticePath,
      headers: asClientIp(0),
    }));

    expect(responses.at(-2).body).toBe(
      buildMessageSrt(
        SubtitleNotice.item(SubtitleNotice.OPENSUBTITLES_ACCOUNT)
          .noticeFileText,
      ),
    );
    expectRateLimitedSrt(responses.at(-1));
  });
});

describe('the manifest rate limits', () => {
  it('refuses with too many requests once one user config spends its window', async () => {
    const userConfig = await createAddonUserConfig();
    const addonPath = toManifestPath(userConfig.id);

    const responses = await requestTimes(MANIFEST_USER_CONFIG_MAX + 1, () => ({
      addonPath,
      headers: asClientIp(0),
    }));

    expect(responses.map(response => response.statusCode)).toEqual([
      ...Array(MANIFEST_USER_CONFIG_MAX).fill(StatusCodes.OK),
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
  });

  it('refuses with too many requests once one address spends its window', async () => {
    const responses = await requestTimes(MANIFEST_IP_MAX + 1, () => ({
      addonPath: toManifestPath(uuidV4()),
      headers: asClientIp(0),
    }));

    expect(responses.map(response => response.statusCode)).toEqual([
      ...Array(MANIFEST_IP_MAX).fill(StatusCodes.OK),
      StatusCodes.TOO_MANY_REQUESTS,
    ]);
  });
});
