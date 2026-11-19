import {LogController} from 'fastify';
import {strToU8} from 'fflate';
import pino from 'pino';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StatusCodes} from 'http-status-codes';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loggerOptions} from '../../src/lib/logger.js';
import {SubtitleNotice} from '../../src/lib/stremio-row/stremio-row-enums.js';
import {computeUrlCode} from '../../src/lib/stremio-row/url-code.js';
import {drainPendingSearches} from '../../src/lib/subtitle-search/search-subtitle-source.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SourceUnavailableError} from '../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {persistSearchHits} from '../../src/lib/subtitle-store/persist-search-hits.js';
import {userConfigCache} from '../../src/lib/user-config-cache.js';
import {setTestAppOptions} from '../helpers/app.js';
import {
  asClientIp,
  createStubVideoCatalog,
  requestAddonPath,
  toFilePath,
  toListPath,
  toNoticePath,
} from '../helpers/addon-requests.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const MOVIE_ID = 'tt0133093';
const USER_CONFIG_PLACEHOLDER = ':userConfigId';
const ERROR_LOG_LEVEL = 50;
const MOVIE_SRT = '1\n00:00:01,000 --> 00:00:03,000\nMerhaba dünya.\n';

const thesubtitledbClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  downloadSubtitle: vi.fn(),
});

const opensubtitlesV3Client = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
  downloadSubtitle: vi.fn(),
});

const logLines = [];

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([
    thesubtitledbClient,
    opensubtitlesV3Client,
  ]),
  videoCatalog: createStubVideoCatalog(),
  loggerInstance: pino(
    {...loggerOptions, level: 'debug'},
    {write: logLine => logLines.push(logLine)},
  ),
  logController: new LogController({disableRequestLogging: false}),
});

beforeEach(() => {
  logLines.length = 0;
  thesubtitledbClient.searchSubtitles.mockReset().mockResolvedValue([]);
  opensubtitlesV3Client.searchSubtitles.mockReset().mockRejectedValue(
    new SourceUnavailableError({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    }),
  );
  thesubtitledbClient.downloadSubtitle.mockReset().mockResolvedValue({
    fileBytes: strToU8(MOVIE_SRT),
    fileNameHint: null,
    extractedEntryPath: null,
  });
  opensubtitlesV3Client.downloadSubtitle.mockReset().mockRejectedValue(
    new SourceUnavailableError({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
    }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await drainPendingSearches();
});

async function createAddonUserConfig() {
  const {userConfig} = await createUserConfig({
    subtitleSourceSwitchStates: makeSwitchStatesOnly([
      SubtitleSource.THESUBTITLEDB,
      SubtitleSource.OPENSUBTITLES_V3,
    ]),
  });
  return userConfig;
}

async function storeHit(hitOverrides) {
  const searchHit = makeSubtitleSourceHit(hitOverrides);
  await persistSearchHits({videoId: MOVIE_ID, searchHits: [searchHit]});
  return computeUrlCode({...searchHit, archiveEntryPath: ''});
}

async function runAddonRequests(userConfigId) {
  const [servedUrlCode, failingUrlCode] = await Promise.all([
    storeHit({subtitleSource: SubtitleSource.THESUBTITLEDB}),
    storeHit({subtitleSource: SubtitleSource.OPENSUBTITLES_V3}),
  ]);
  thesubtitledbClient.searchSubtitles.mockResolvedValue([
    makeSubtitleSourceHit(),
  ]);
  const addonPaths = [
    toListPath({userConfigId, videoId: MOVIE_ID}),
    toFilePath({userConfigId, videoId: MOVIE_ID, urlCode: servedUrlCode}),
    toFilePath({userConfigId, videoId: MOVIE_ID, urlCode: failingUrlCode}),
    toNoticePath({
      userConfigId,
      noticeName: SubtitleNotice.OPENSUBTITLES_ACCOUNT,
    }),
  ];
  const responses = [];
  for (const addonPath of addonPaths) {
    responses.push(await requestAddonPath(addonPath, asClientIp(0)));
  }
  return responses;
}

async function failSubtitleList(userConfigId) {
  vi.spyOn(userConfigCache, 'get').mockRejectedValue(
    new Error('The configuration store is down.'),
  );
  return requestAddonPath(
    toListPath({userConfigId, videoId: MOVIE_ID}),
    asClientIp(0),
  );
}

function readErrorLines() {
  return logLines.filter(
    logLine => JSON.parse(logLine).level >= ERROR_LOG_LEVEL,
  );
}

describe('the addon route logs', () => {
  it('never write the user config id', async () => {
    const userConfig = await createAddonUserConfig();

    const responses = await runAddonRequests(userConfig.id);
    responses.push(await failSubtitleList(userConfig.id));
    await drainPendingSearches();

    expect(responses.map(response => response.statusCode)).toEqual(
      Array(responses.length).fill(StatusCodes.OK),
    );
    expect(logLines.length).toBeGreaterThan(0);
    expect(logLines.filter(logLine => logLine.includes(userConfig.id))).toEqual(
      [],
    );
    expect(
      logLines.some(
        logLine =>
          logLine.includes(userConfig.id) && logLine.includes(MOVIE_ID),
      ),
    ).toBe(false);
  });

  it('write the request url with the user config placeholder', async () => {
    const userConfig = await createAddonUserConfig();

    await runAddonRequests(userConfig.id);

    expect(
      logLines.filter(logLine =>
        logLine.includes(`/${USER_CONFIG_PLACEHOLDER}/subtitle-files/`),
      ),
    ).not.toEqual([]);
  });

  it('write a failed list with the user config placeholder and without the video', async () => {
    const userConfig = await createAddonUserConfig();

    const response = await failSubtitleList(userConfig.id);
    const errorLines = readErrorLines();

    expect(response.statusCode).toBe(StatusCodes.OK);
    expect(response.json()).toEqual({subtitles: []});
    expect(errorLines).not.toEqual([]);
    expect(
      errorLines.filter(errorLine =>
        errorLine.includes(`/${USER_CONFIG_PLACEHOLDER}/subtitles/`),
      ),
    ).not.toEqual([]);
    expect(
      errorLines.filter(
        errorLine =>
          errorLine.includes(userConfig.id) || errorLine.includes(MOVIE_ID),
      ),
    ).toEqual([]);
  });
});
