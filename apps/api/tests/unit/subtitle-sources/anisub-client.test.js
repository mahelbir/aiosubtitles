import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {anisubClient} from '../../../src/lib/subtitle-sources/anisub/anisub-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SourceUnavailableError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const ACCESS_TOKEN = '7|anisubfixturetoken';

describe('anisubClient', () => {
  it('names its subtitle source and takes an optional access token', () => {
    expect(anisubClient.subtitleSource).toBe(SubtitleSource.ANISUB);
    expect(anisubClient.credentialKinds).toEqual([CredentialKind.ACCESS_TOKEN]);
    expect(anisubClient.canSearchWithoutCredential()).toBe(true);
    expect(anisubClient.canDownloadWithoutCredential()).toBe(true);
  });

  it('searches by id, not by video hash', () => {
    expect(anisubClient.isSearchHashSensitive).toBe(false);
  });

  it('declares the documented download limits', () => {
    expect(anisubClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.SUBTITLE_SOURCE,
        windowMs: 60000,
        requestMax: 60,
      },
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 86400000,
        requestMax: 1000,
      },
    ]);
  });

  it('implements the search, download, credential check and quota calls', () => {
    expect(anisubClient.searchSubtitles).toBeTypeOf('function');
    expect(anisubClient.downloadSubtitle).toBeTypeOf('function');
    expect(anisubClient.checkCredential).toBeTypeOf('function');
    expect(anisubClient.readQuota).toBeTypeOf('function');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(anisubClient);
  });

  it('resolves no hits for a kitsu id that has no imdb id, without a request', async () => {
    await expect(
      anisubClient.searchSubtitles(
        makeSearchQuery({
          videoId: 'kitsu:7442:5',
          videoType: 'series',
          imdbId: null,
          kitsuId: '7442',
          catalogSeason: 1,
          catalogEpisode: 5,
        }),
        null,
      ),
    ).resolves.toEqual([]);
  });

  it('rejects a download without a file url as an unavailable source, without the token', async () => {
    const error = await anisubClient
      .downloadSubtitle(
        {
          subtitleSource: SubtitleSource.ANISUB,
          siteFileId: 'sub-71001',
          siteFileUrl: null,
          catalogSeason: null,
          catalogEpisode: null,
        },
        makeSubtitleSourceCredential({
          credentialKind: CredentialKind.ACCESS_TOKEN,
          apiKey: undefined,
          accessToken: ACCESS_TOKEN,
        }),
      )
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(`${error.message} ${error.cause?.message}`).not.toContain(
      ACCESS_TOKEN,
    );
  });

  it('fails a token download whose file link it cannot read, before any request', async () => {
    const error = await anisubClient
      .downloadSubtitle(
        {
          subtitleSource: SubtitleSource.ANISUB,
          siteFileId: 'sub-71001',
          siteFileUrl: 'https://anisub.co/stremio/file/sub-71001.srt',
          catalogSeason: 1,
          catalogEpisode: 1,
        },
        makeSubtitleSourceCredential({
          credentialKind: CredentialKind.ACCESS_TOKEN,
          apiKey: undefined,
          accessToken: ACCESS_TOKEN,
        }),
      )
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SourceUnavailableError);
    expect(error.cause.message).toBe(
      'AniSub token download needs a recognised file link.',
    );
    expect(`${error.message} ${error.cause.message}`).not.toContain(
      ACCESS_TOKEN,
    );
  });
});
