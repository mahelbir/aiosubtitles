import {describe, expect, it} from 'vitest';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {jimakuClient} from '../../src/lib/subtitle-sources/jimaku/jimaku-client.js';
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

const serviceName = SubtitleSource.label(SubtitleSource.JIMAKU);
const liveSecrets = loadLiveSecrets();
const missingSecretNames = listMissingSecretNames(liveSecrets, [
  'JIMAKU_API_KEY',
]);

describe('Jimaku live', () => {
  it('records what the search route answers for a key that does not exist', async testContext => {
    await runLiveCase(
      {serviceName, liveNote: 'Bad key check.', missingSecretNames},
      testContext,
      async () => {
        const badKeyAnswer = await jimakuClient
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
        expect(badKeyAnswer).toBe('SourceCredentialError');
      },
    );
  });

  it('checks the key, searches kitsu:46474:5 in Japanese and downloads one file', async testContext => {
    await runLiveCase(
      {
        serviceName,
        liveNote: 'Key check, AniList search, episode files and one download.',
        missingSecretNames,
      },
      testContext,
      async () => {
        const credential = makeSubtitleSourceCredential({
          apiKey: liveSecrets.JIMAKU_API_KEY,
        });
        const credentialCheck = await jimakuClient.checkCredential(credential);
        expect(credentialCheck.credentialStatus).toBe(CredentialStatus.VALID);
        const searchQuery = makeLiveSearchQuery('kitsu:46474:5', ['jpn']);
        const hits = await jimakuClient.searchSubtitles(
          searchQuery,
          credential,
        );
        await recordLiveResult({
          serviceName,
          liveStatus: LiveStatus.VERIFIED,
          liveNote: `Episode 5 gave ${hits.length} files, ${hits.filter(hit => hit.isSitePack).length} packs.`,
        });
        expect(hits.length).toBeGreaterThan(0);
        const download = await jimakuClient.downloadSubtitle(
          toSubtitleRef(hits[0], searchQuery),
          credential,
        );
        expect(download.fileBytes.length).toBeGreaterThan(0);
      },
    );
  });
});
