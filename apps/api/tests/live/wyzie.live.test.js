import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {decodeSubtitleBytes} from '@repo/subtitle-core/file-format/decode-text.js';
import {parseSubtitleText} from '@repo/subtitle-core/file-format/parse-subtitle.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {requestSubtitleSource} from '../../src/lib/subtitle-sources/subtitle-source-request.js';
import {wyzieClient} from '../../src/lib/subtitle-sources/wyzie/wyzie-client.js';
import {wyzieMapping} from '../../src/lib/subtitle-sources/wyzie/wyzie-mapping.js';
import {makeSubtitleSourceCredential} from '../helpers/subtitle-source-factories.js';
import {
  listMissingSecretNames,
  runLiveCase,
  writeLiveReport,
} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';

const serviceName = SubtitleSource.label(SubtitleSource.WYZIE);
const VIDEO_ID = 'tt0133093';
const LANGUAGE_CODE = 'eng';
const FIRST_CUE_COUNT = 3;
const CHARLIE_PREFIX = 'charlie:';
const REPORT_NAME = 'wyzie-first-cues';
const LIVE_TIMEOUT_MS = 60000;
const liveSecrets = loadLiveSecrets();

function toCues(fileBytes) {
  const {text} = decodeSubtitleBytes(fileBytes, {
    languageCodeHint: LANGUAGE_CODE,
  });
  return parseSubtitleText({text, fileNameHint: null}).cues;
}

async function downloadServedBytes(subtitleRef, credential) {
  const downloadUrl = wyzieMapping.findDownloadUrl(
    await requestSubtitleSource(
      wyzieMapping.buildDownloadSearchRequest(subtitleRef, credential),
    ),
    subtitleRef,
    {credential},
  );
  const {body} = await requestSubtitleSource(
    wyzieMapping.buildDownloadRequest(downloadUrl, credential),
  );
  return body;
}

function renderReport({siteFileId, servedCues, keptCueCount}) {
  return [
    `# Wyzie first cues ${VIDEO_ID} ${LANGUAGE_CODE}`,
    '',
    `- siteFileId: ${siteFileId}`,
    `- servedCueCount: ${servedCues.length}`,
    `- cueCountAfterUpsellDrop: ${keptCueCount}`,
    '',
    '## First served cues',
    '',
    ...servedCues
      .slice(0, FIRST_CUE_COUNT)
      .map(
        ({startMs, endMs, text}) =>
          `- ${startMs}-${endMs} ms: ${text.replaceAll('\n', ' / ')}`,
      ),
    '',
  ].join('\n');
}

describe('Wyzie live', () => {
  it(
    'searches tt0133093 in English with the key, downloads one charlie file and records its first cues',
    async testContext => {
      await runLiveCase(
        {
          serviceName,
          liveNote: 'Keyed search, one re-minted download, first cues.',
          missingSecretNames: listMissingSecretNames(liveSecrets, [
            'WYZIE_API_KEY',
          ]),
        },
        testContext,
        async () => {
          const credential = makeSubtitleSourceCredential({
            apiKey: liveSecrets.WYZIE_API_KEY,
          });
          const searchQuery = makeLiveSearchQuery(VIDEO_ID, [LANGUAGE_CODE]);
          const hits = await wyzieClient.searchSubtitles(
            searchQuery,
            credential,
          );
          const charlieHit = hits.find(hit =>
            hit.siteFileId.startsWith(CHARLIE_PREFIX),
          );
          expect(charlieHit).toBeDefined();
          expect(JSON.stringify(hits)).not.toContain('tok=');
          const subtitleRef = toSubtitleRef(charlieHit, searchQuery);
          const servedBytes = await downloadServedBytes(
            subtitleRef,
            credential,
          );
          const servedCues = toCues(servedBytes);
          await writeLiveReport(
            REPORT_NAME,
            renderReport({
              siteFileId: charlieHit.siteFileId,
              servedCues,
              keptCueCount: toCues(wyzieMapping.dropUpsellCues(servedBytes))
                .length,
            }),
          );
          const download = await wyzieClient.downloadSubtitle(
            subtitleRef,
            credential,
          );
          expect(toCues(download.fileBytes).length).toBeGreaterThan(0);
        },
      );
    },
    LIVE_TIMEOUT_MS,
  );
});
