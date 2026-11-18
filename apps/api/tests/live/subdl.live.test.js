import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {subdlClient} from '../../src/lib/subtitle-sources/subdl/subdl-client.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {
  LiveStatus,
  listMissingSecretNames,
  recordLiveResult,
  runLiveCase,
} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.SUBDL);
const liveSecrets = loadLiveSecrets();

describe('SubDL live', () => {
  it('records what the account route answers for a key that does not exist', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Bad key check.'},
      testContext,
      async () => {
        const badKeyAnswer = await subdlClient
          .checkCredential(
            makeSubtitleSourceCredential({apiKey: 'aiosubtitles-bad-key'}),
          )
          .then(
            ({credentialStatus}) => credentialStatus,
            error => error.name,
          );
        await recordLiveResult({
          serviceName,
          liveStatus: LiveStatus.VERIFIED,
          liveNote: `Bad key check answered ${badKeyAnswer}.`,
        });
        expect(badKeyAnswer).toBe(CredentialStatus.INVALID);
      },
    );
  });

  it('checks the key, searches tt0133093 in English and downloads once under the key', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Key check, keyed search and one keyed download.',
        missingSecretNames: listMissingSecretNames(liveSecrets, [
          'SUBDL_API_KEY',
        ]),
      },
      testContext,
      async () => {
        const credential = makeSubtitleSourceCredential({
          apiKey: liveSecrets.SUBDL_API_KEY,
        });
        const credentialCheck = await subdlClient.checkCredential(credential);
        expect(credentialCheck.credentialStatus).toBe(CredentialStatus.VALID);
        const searchQuery = makeLiveSearchQuery('tt0133093', ['eng']);
        const hits = await subdlClient.searchSubtitles(searchQuery, credential);
        await recordLiveResult({
          serviceName,
          liveStatus: LiveStatus.VERIFIED,
          liveNote: `Search with releases=1 gave ${hits.length} hits of 30 asked.`,
        });
        expect(hits.length).toBeGreaterThan(0);
        const download = await subdlClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
