import {describe, expect, it} from 'vitest';
import {
  CredentialKind,
  CredentialStatus,
} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {stremioCommunitySubtitlesClient} from '../../src/lib/subtitle-sources/stremio-community-subtitles/stremio-community-subtitles-client.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {listMissingSecretNames, runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(
  SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
);
const TOKEN_SECRET_NAME = 'STREMIO_COMMUNITY_SUBTITLES_TOKEN';
const UNKNOWN_ACCESS_TOKEN = 'aiosubtitles-live-unknown-token-0000';
const liveSecrets = loadLiveSecrets();
const missingSecretNames = listMissingSecretNames(liveSecrets, [
  TOKEN_SECRET_NAME,
]);

function makeTokenCredential(accessToken) {
  return makeSubtitleSourceCredential({
    credentialKind: CredentialKind.ACCESS_TOKEN,
    apiKey: undefined,
    accessToken,
  });
}

describe('Community Subtitles live', () => {
  it("checks the user's own token through the download route", async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Own token valid, unknown token invalid.',
        missingSecretNames,
      },
      testContext,
      async () => {
        const [ownCheck, unknownCheck] = await Promise.all([
          stremioCommunitySubtitlesClient.checkCredential(
            makeTokenCredential(liveSecrets[TOKEN_SECRET_NAME]),
          ),
          stremioCommunitySubtitlesClient.checkCredential(
            makeTokenCredential(UNKNOWN_ACCESS_TOKEN),
          ),
        ]);
        expect(ownCheck.credentialStatus).toBe(CredentialStatus.VALID);
        expect(unknownCheck.credentialStatus).toBe(CredentialStatus.INVALID);
      },
    );
  });

  it("searches tt0111161 in English with the user's own token and downloads once", async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Own-token search and one download.',
        missingSecretNames,
      },
      testContext,
      async ({skipLive}) => {
        const credential = makeTokenCredential(liveSecrets[TOKEN_SECRET_NAME]);
        const searchQuery = makeLiveSearchQuery('tt0111161', ['eng']);
        const hits = await stremioCommunitySubtitlesClient.searchSubtitles(
          searchQuery,
          credential,
        );
        if (hits.length === 0) {
          await skipLive('No search hit to download.');
          return;
        }
        expect(
          JSON.stringify(hits).includes(liveSecrets[TOKEN_SECRET_NAME]),
        ).toBe(false);
        const download = await stremioCommunitySubtitlesClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
