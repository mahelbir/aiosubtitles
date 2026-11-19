import {StatusCodes} from 'http-status-codes';
import {afterEach, describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  drainPendingSearches,
  searchSubtitleSource,
} from '../../../src/lib/subtitle-search/search-subtitle-source.js';
import {readSubtitleSourceBreaker} from '../../../src/lib/subtitle-search/subtitle-source-breaker.js';
import {readUsableCredentials} from '../../../src/lib/subtitle-source-credentials.js';
import {thesubtitledbClient} from '../../../src/lib/subtitle-sources/thesubtitledb/thesubtitledb-client.js';
import {userConfigCache} from '../../../src/lib/user-config-cache.js';
import {redis} from '../../../src/redis/index.js';
import {createUserConfig} from '../../helpers/factories.js';
import {networkDispatcher} from '../../helpers/network.js';
import {makeSearchQuery} from '../../helpers/subtitle-source-factories.js';
import {readCredentialStatuses} from '../../helpers/user-config-factories.js';

const SUBTITLE_SOURCE = SubtitleSource.THESUBTITLEDB;
const THESUBTITLEDB_ORIGIN = 'https://api.thesubtitledb.org';
const NOW_MS = Date.UTC(2026, 10, 18, 12, 0, 0);
const searchQuery = makeSearchQuery({
  languageCodes: [
    'spa',
    'por',
    'zho',
    'tur',
    'eng',
    'fre',
    'ger',
    'ita',
    'jpn',
    'kor',
    'rus',
    'ara',
    'pol',
    'nld',
    'swe',
    'fin',
    'dan',
  ],
});

afterEach(async () => {
  await drainPendingSearches();
});

function isLookupFor(siteLanguageCode) {
  return lookupPath => {
    const {pathname, searchParams} = new URL(lookupPath, THESUBTITLEDB_ORIGIN);
    return (
      pathname === `/v1/by-imdb/${searchQuery.imdbId}` &&
      (searchParams.get('lang') ?? '').split(',').includes(siteLanguageCode)
    );
  };
}

function answerLookup(siteLanguageCode, siteFileId) {
  networkDispatcher
    .get(THESUBTITLEDB_ORIGIN)
    .intercept({path: isLookupFor(siteLanguageCode)})
    .reply(
      StatusCodes.OK,
      {
        subtitles: {
          items: [
            {
              id: siteFileId,
              language: siteLanguageCode,
              format: 'srt',
              release_name: '',
            },
          ],
        },
      },
      {headers: {'content-type': 'application/json'}},
    );
}

function failLookup(siteLanguageCode) {
  networkDispatcher
    .get(THESUBTITLEDB_ORIGIN)
    .intercept({path: isLookupFor(siteLanguageCode)})
    .reply(StatusCodes.INTERNAL_SERVER_ERROR, 'Internal Server Error');
}

async function readUserCredentials() {
  const {userConfig, userConfigCredentials} = await createUserConfig({
    credentials: [
      {
        subtitleSource: SUBTITLE_SOURCE,
        credentialKind: CredentialKind.API_KEY,
        credentialSecret: {apiKey: 'sdb_fixturekey'},
      },
    ],
  });
  return {
    credentialIds: userConfigCredentials.map(({id}) => id),
    credentials: readUsableCredentials({
      cachedUserConfig: await userConfigCache.get(userConfig.id),
      subtitleSource: SUBTITLE_SOURCE,
      credentialKinds: [CredentialKind.API_KEY],
    }),
  };
}

describe('a TheSubtitleDB search split over several lookups', () => {
  it('caches nothing when one lookup fails, so the next search asks the site again', async () => {
    const {credentialIds, credentials} = await readUserCredentials();
    const searchOptions = {
      client: thesubtitledbClient,
      searchQuery,
      credentials,
      hasConfiguredCredential: true,
    };
    answerLookup('es', 1);
    failLookup('da');

    const failedHits = await searchSubtitleSource({
      ...searchOptions,
      nowMs: NOW_MS,
    });
    await drainPendingSearches();

    await expect(
      redis.keys(`subtitle-search-cache:v1:${SUBTITLE_SOURCE}:*`),
    ).resolves.toEqual([]);
    expect(failedHits).toEqual([]);
    await expect(readCredentialStatuses(credentialIds)).resolves.toEqual({
      [credentialIds[0]]: CredentialStatus.UNCHECKED,
    });
    await expect(
      readSubtitleSourceBreaker(SUBTITLE_SOURCE, NOW_MS + 1000),
    ).resolves.toMatchObject({isOpen: false});

    answerLookup('es', 1);
    answerLookup('da', 2);
    const retriedHits = await searchSubtitleSource({
      ...searchOptions,
      nowMs: NOW_MS + 1000,
    });

    expect(
      retriedHits.map(({siteFileId, languageCode}) => [
        siteFileId,
        languageCode,
      ]),
    ).toEqual([
      ['1', 'spa'],
      ['2', 'dan'],
    ]);
  });
});
