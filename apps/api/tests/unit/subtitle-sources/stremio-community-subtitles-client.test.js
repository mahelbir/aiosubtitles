import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {stremioCommunitySubtitlesClient} from '../../../src/lib/subtitle-sources/stremio-community-subtitles/stremio-community-subtitles-client.js';
import {listSubtitleSourceClients} from '../../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {SubtitleSourceBudgetScope} from '../../../src/lib/subtitle-sources/subtitle-source-contract.js';
import {SubtitleSourceError} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {
  makeSearchQuery,
  makeSubtitleSourceCredential,
} from '../../helpers/subtitle-source-factories.js';

const ACCESS_TOKEN = 'scs-fixture_token-0001-abcdEFGH';
const ENG_PAYLOAD =
  'eyJjb250ZW50X3R5cGUiOiJtb3ZpZSIsImNvbnRlbnRfaWQiOiJ0dDAxMTExNjEiLCJsYW5nIjoiZW5nIiwidl9oYXNoIjpudWxsLCJ2X3NpemUiOm51bGwsInZfZm5hbWUiOm51bGx9';
const tokenCredential = makeSubtitleSourceCredential({
  credentialKind: CredentialKind.ACCESS_TOKEN,
  apiKey: undefined,
  accessToken: ACCESS_TOKEN,
});

function toSubtitleRef(siteFileId) {
  return {
    subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    siteFileId,
    siteFileUrl: null,
    catalogSeason: null,
    catalogEpisode: null,
  };
}

describe('stremioCommunitySubtitlesClient', () => {
  it("names its subtitle source and takes only the user's own token", () => {
    expect(stremioCommunitySubtitlesClient.subtitleSource).toBe(
      SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    );
    expect(stremioCommunitySubtitlesClient.credentialKinds).toEqual([
      CredentialKind.ACCESS_TOKEN,
    ]);
  });

  it('never searches or downloads without a token', () => {
    expect(stremioCommunitySubtitlesClient.canSearchWithoutCredential()).toBe(
      false,
    );
    expect(stremioCommunitySubtitlesClient.canDownloadWithoutCredential()).toBe(
      false,
    );
  });

  it('searches by video hash', () => {
    expect(stremioCommunitySubtitlesClient.isSearchHashSensitive).toBe(true);
  });

  it('keeps its search out of the shared search cache', () => {
    expect(stremioCommunitySubtitlesClient.isSearchCredentialScoped).toBe(true);
  });

  it("carries its download limit on the user's own token", () => {
    expect(stremioCommunitySubtitlesClient.downloadBudgets).toEqual([
      {
        budgetScope: SubtitleSourceBudgetScope.CREDENTIAL,
        windowMs: 60000,
        requestMax: 10,
      },
    ]);
  });

  it('implements search, download and the credential check, with no quota call', () => {
    expect(stremioCommunitySubtitlesClient.searchSubtitles).toBeTypeOf(
      'function',
    );
    expect(stremioCommunitySubtitlesClient.downloadSubtitle).toBeTypeOf(
      'function',
    );
    expect(stremioCommunitySubtitlesClient.checkCredential).toBeTypeOf(
      'function',
    );
    expect(stremioCommunitySubtitlesClient).not.toHaveProperty('readQuota');
  });

  it('is registered with the subtitle source clients', () => {
    expect(listSubtitleSourceClients()).toContain(
      stremioCommunitySubtitlesClient,
    );
  });

  it('resolves no hits without a token, without a request', async () => {
    await expect(
      stremioCommunitySubtitlesClient.searchSubtitles(makeSearchQuery(), null),
    ).resolves.toEqual([]);
  });

  it('resolves no hits for a credential with a blank token, without a request', async () => {
    await expect(
      stremioCommunitySubtitlesClient.searchSubtitles(makeSearchQuery(), {
        ...tokenCredential,
        accessToken: '',
      }),
    ).resolves.toEqual([]);
  });

  it('refuses a download without a token, without a request', async () => {
    await expect(
      stremioCommunitySubtitlesClient.downloadSubtitle(
        toSubtitleRef(`${ENG_PAYLOAD}.vtt`),
        null,
      ),
    ).rejects.toBeInstanceOf(SubtitleSourceError);
  });

  it('refuses a malformed site file id before any request, without the token', async () => {
    const error = await stremioCommunitySubtitlesClient
      .downloadSubtitle(toSubtitleRef('../manifest.json'), tokenCredential)
      .catch(caughtError => caughtError);
    expect(error).toBeInstanceOf(SubtitleSourceError);
    expect(
      `${error.message} ${error.cause?.message} ${JSON.stringify(error)}`,
    ).not.toContain(ACCESS_TOKEN);
  });
});
