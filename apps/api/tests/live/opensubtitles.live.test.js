import {randomUUID} from 'node:crypto';
import {compact} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {createOpensubtitlesClient} from '../../src/lib/subtitle-sources/opensubtitles/opensubtitles-client.js';
import {requestSubtitleSource} from '../../src/lib/subtitle-sources/subtitle-source-request.js';
import {createTestSharedCredentialPool} from '../helpers/shared-credentials.js';
import {listMissingSecretNames, runLiveCase} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';
import {downloadWithApiKeyOnly} from './helpers/opensubtitles-anonymous-download.js';

const serviceName = SubtitleSource.label(SubtitleSource.OPENSUBTITLES);
const SAMPLE_VIDEO_HASH = '8e245d9679d31e12';
const QUOTA_REMAINING_MIN = 50;
const NO_SEARCH_HIT_NOTE = 'No search hit to download.';
const liveSecrets = loadLiveSecrets();
const apiKeyNames = ['OPENSUBTITLES_API_KEY'];
const accountNames = [
  'OPENSUBTITLES_API_KEY',
  'OPENSUBTITLES_USERNAME',
  'OPENSUBTITLES_PASSWORD',
];
const opensubtitlesClient = createOpensubtitlesClient({
  requestSubtitleSource,
  sharedCredentialPool: createTestSharedCredentialPool({
    [SubtitleSource.OPENSUBTITLES]: compact([
      liveSecrets.OPENSUBTITLES_API_KEY,
    ]),
  }).sharedCredentialPool,
});
const searchQuery = makeLiveSearchQuery('tt0133093', ['eng']);
let firstHit = null;

describe('OpenSubtitles live', () => {
  it('searches tt0133093 in English with the API key', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Search by IMDb id.',
        missingSecretNames: listMissingSecretNames(liveSecrets, apiKeyNames),
      },
      testContext,
      async () => {
        const hits = await opensubtitlesClient.searchSubtitles(
          searchQuery,
          null,
        );
        expect(hits.length).toBeGreaterThan(0);
        [firstHit] = hits;
      },
    );
  });

  it('searches with the documented sample moviehash', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Moviehash parameter accepted.',
        missingSecretNames: listMissingSecretNames(liveSecrets, apiKeyNames),
      },
      testContext,
      async () => {
        const hits = await opensubtitlesClient.searchSubtitles(
          {...searchQuery, videoHash: SAMPLE_VIDEO_HASH},
          null,
        );
        expect(Array.isArray(hits)).toBe(true);
      },
    );
  });

  it('downloads once with the API key alone', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Anonymous download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, apiKeyNames),
      },
      testContext,
      async ({skipLive}) => {
        if (firstHit === null) {
          await skipLive(NO_SEARCH_HIT_NOTE);
        }
        const download = await downloadWithApiKeyOnly({
          fileId: firstHit.siteFileId,
          apiKey: liveSecrets.OPENSUBTITLES_API_KEY,
        });
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });

  it('downloads once with the account above the quota floor', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Account download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, accountNames),
      },
      testContext,
      async ({skipLive}) => {
        if (firstHit === null) {
          await skipLive(NO_SEARCH_HIT_NOTE);
        }
        const credential = {
          credentialId: randomUUID(),
          credentialKind: CredentialKind.ACCOUNT,
          username: liveSecrets.OPENSUBTITLES_USERNAME,
          password: liveSecrets.OPENSUBTITLES_PASSWORD,
        };
        const {quotaRemainingCount} =
          await opensubtitlesClient.readQuota(credential);
        if (
          quotaRemainingCount === null ||
          quotaRemainingCount <= QUOTA_REMAINING_MIN
        ) {
          await skipLive('Quota at or under the floor.');
        }
        const download = await opensubtitlesClient.downloadSubtitle(
          toSubtitleRef(firstHit, searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
