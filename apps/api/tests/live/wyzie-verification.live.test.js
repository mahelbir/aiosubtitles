import {randomUUID} from 'node:crypto';
import {delay, mapValues} from 'es-toolkit';
import {StatusCodes} from 'http-status-codes';
import {describe, expect, it} from 'vitest';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {decodeSubtitleBytes} from '@repo/subtitle-core/file-format/decode-text.js';
import {parseSubtitleText} from '@repo/subtitle-core/file-format/parse-subtitle.js';
import {loadLiveSecrets} from '../../scripts/lib/live-secrets.js';
import {createOpensubtitlesClient} from '../../src/lib/subtitle-sources/opensubtitles/opensubtitles-client.js';
import * as opensubtitlesSession from '../../src/lib/subtitle-sources/opensubtitles/opensubtitles-session.js';
import {opensubtitlesV3Client} from '../../src/lib/subtitle-sources/opensubtitles-v3/opensubtitles-v3-client.js';
import {SubtitleAliasSource} from '../../src/lib/subtitle-sources/subtitle-alias-source.js';
import {requestSubtitleSource} from '../../src/lib/subtitle-sources/subtitle-source-request.js';
import {
  listMissingSecretNames,
  runLiveCase,
  writeLiveReport,
} from './helpers/live-report.js';
import {
  makeLiveSearchQuery,
  toSubtitleRef,
} from './helpers/live-search-query.js';
import {
  WyzieRefusal,
  findCarriedSubtitle,
  summarizeWyzieVerification,
  toWyzieRefusal,
} from './helpers/wyzie-verification.js';

const serviceName = SubtitleSource.label(SubtitleSource.WYZIE);
const WYZIE_API_URL = 'https://sub.wyzie.io';
const VIDEO_ID = 'tt0133093';
const WYZIE_LANGUAGE = 'en';
const LANGUAGE_CODE = 'eng';
const FIRST_CUE_COUNT = 3;
const WYZIE_SETTLE_WAIT_MS = 20000;
const PROBE_TIMEOUT_MS = 120000;
const REPORT_NAME = 'wyzie-verification';
const secretNames = [
  'WYZIE_API_KEY',
  'OPENSUBTITLES_API_KEY',
  'OPENSUBTITLES_USERNAME',
  'OPENSUBTITLES_PASSWORD',
];
const liveSecrets = loadLiveSecrets();
const opensubtitlesClient = createOpensubtitlesClient({
  requestSubtitleSource,
  apiKey: liveSecrets.OPENSUBTITLES_API_KEY,
  sessionStore: {
    ...opensubtitlesSession,
    readOpensubtitlesQuota: async () => null,
  },
});
const searchQuery = makeLiveSearchQuery(VIDEO_ID, [LANGUAGE_CODE]);

function requestWyzie(pathName, searchParameters, requestOptions = {}) {
  const searchText = new URLSearchParams({
    ...searchParameters,
    key: liveSecrets.WYZIE_API_KEY,
  });
  return requestSubtitleSource({
    subtitleSource: SubtitleSource.WYZIE,
    url: `${WYZIE_API_URL}${pathName}?${searchText}`,
    ...requestOptions,
  });
}

async function readWyzieBalance() {
  const {body} = await requestWyzie('/usage', {});
  return body?.balance ?? null;
}

async function searchWyzieCodename(codename) {
  const {status, body} = await requestWyzie(
    '/search',
    {id: VIDEO_ID, language: WYZIE_LANGUAGE, source: codename},
    {acceptedStatuses: [StatusCodes.FORBIDDEN]},
  );
  if (status !== StatusCodes.FORBIDDEN) {
    return {rows: Array.isArray(body) ? body : [], wyzieRefusal: null};
  }
  const wyzieRefusal = toWyzieRefusal(body);
  if (wyzieRefusal === WyzieRefusal.INVALID_KEY) {
    throw new Error('Wyzie rejected the API key.');
  }
  return {rows: [], wyzieRefusal};
}

async function searchWyzieRowsByCodename(codenames) {
  const searchResults = await Promise.all(codenames.map(searchWyzieCodename));
  const rowsByCodename = {};
  const refusalsByCodename = {};
  searchResults.forEach(({rows, wyzieRefusal}, codenameIndex) => {
    const codename = codenames[codenameIndex];
    if (wyzieRefusal !== null) {
      refusalsByCodename[codename] = wyzieRefusal;
      return;
    }
    rowsByCodename[codename] ??= [];
    rows.forEach(row => {
      const rowCodename = row.source ?? codename;
      rowsByCodename[rowCodename] ??= [];
      rowsByCodename[rowCodename].push(row);
    });
  });
  return {rowsByCodename, refusalsByCodename};
}

async function readOpensubtitlesRemaining(credential) {
  const {quotaRemainingCount} = await opensubtitlesClient.readQuota(credential);
  return quotaRemainingCount;
}

function toCues(fileBytes) {
  const {text} = decodeSubtitleBytes(fileBytes, {
    languageCodeHint: LANGUAGE_CODE,
  });
  return parseSubtitleText({text, fileNameHint: null}).cues;
}

async function downloadWyzieCues(wyzieRow) {
  const {headers, body} = await requestSubtitleSource({
    subtitleSource: SubtitleSource.WYZIE,
    url: wyzieRow.url,
    responseType: 'bytes',
  });
  return {
    wyzieCues: toCues(body),
    wyzieHeaderCost: Number(headers['x-wyzie-cost'] ?? Number.NaN),
  };
}

async function downloadV3Cues(v3Hit) {
  if (!v3Hit) {
    return null;
  }
  const {fileBytes} = await opensubtitlesV3Client.downloadSubtitle(
    toSubtitleRef(v3Hit, searchQuery),
    null,
  );
  return toCues(fileBytes);
}

async function downloadCarriedCopies({carriedSubtitle, wyzieRows, v3Hits}) {
  const wyzieRow = wyzieRows.find(
    ({id}) => String(id) === carriedSubtitle.siteFileId,
  );
  const v3Hit = v3Hits.find(
    ({siteFileId}) => siteFileId === carriedSubtitle.siteFileId,
  );
  const wyzieBalanceBefore = await readWyzieBalance();
  const [{wyzieCues, wyzieHeaderCost}, v3Cues] = await Promise.all([
    downloadWyzieCues(wyzieRow),
    downloadV3Cues(v3Hit),
  ]);
  await delay(WYZIE_SETTLE_WAIT_MS);
  return {
    wyzieBalanceBefore,
    wyzieBalanceAfter: await readWyzieBalance(),
    wyzieHeaderCost,
    wyzieCues,
    v3Cues,
  };
}

function toLegacyIds(opensubtitlesHits) {
  return opensubtitlesHits.flatMap(({subtitleAliases}) =>
    subtitleAliases
      .filter(
        ({aliasSource}) =>
          aliasSource === SubtitleAliasSource.OPENSUBTITLES_LEGACY,
      )
      .map(({aliasSiteFileId}) => aliasSiteFileId),
  );
}

function toReportValue(reportValue) {
  return reportValue === null || Number.isNaN(reportValue)
    ? 'n/a'
    : String(reportValue);
}

function renderSection(sectionTitle, reportValues) {
  return [
    `## ${sectionTitle}`,
    '',
    ...Object.entries(reportValues).map(
      ([valueName, reportValue]) =>
        `- ${valueName}: ${toReportValue(reportValue)}`,
    ),
    '',
  ];
}

function renderReport({
  summary,
  reportCounts,
  wyzieRowsByCodename,
  wyzieRefusalsByCodename,
}) {
  return [
    `# Wyzie verification ${VIDEO_ID} ${WYZIE_LANGUAGE}`,
    '',
    ...renderSection('Summary', summary),
    ...renderSection('Counts', reportCounts),
    ...renderSection(
      'Wyzie rows by codename',
      mapValues(wyzieRowsByCodename, rows => rows.length),
    ),
    ...renderSection('Wyzie codenames refused (403)', wyzieRefusalsByCodename),
  ].join('\n');
}

describe('Wyzie verification live', () => {
  it(
    'settles the OpenSubtitles codename, billing, upsell and Jimaku codename',
    async testContext => {
      await runLiveCase(
        {
          serviceName,
          liveNote: 'Wyzie verification probe.',
          missingSecretNames: listMissingSecretNames(liveSecrets, secretNames),
        },
        testContext,
        async () => {
          const credential = {
            credentialId: randomUUID(),
            credentialKind: CredentialKind.ACCOUNT,
            username: liveSecrets.OPENSUBTITLES_USERNAME,
            password: liveSecrets.OPENSUBTITLES_PASSWORD,
          };
          const [
            {body: wyzieSources},
            opensubtitlesHits,
            v3Hits,
            opensubtitlesRemainingBefore,
          ] = await Promise.all([
            requestWyzie('/sources', {}),
            opensubtitlesClient.searchSubtitles(searchQuery, null),
            opensubtitlesV3Client.searchSubtitles(searchQuery, null),
            readOpensubtitlesRemaining(credential),
          ]);
          expect(wyzieSources?.key?.valid).toBe(true);
          const freeCodenames = wyzieSources.free.filter(codename =>
            (wyzieSources.available ?? wyzieSources.free).includes(codename),
          );
          const {
            rowsByCodename: wyzieRowsByCodename,
            refusalsByCodename: wyzieRefusalsByCodename,
          } = await searchWyzieRowsByCodename(freeCodenames);
          const opensubtitlesLegacyIds = toLegacyIds(opensubtitlesHits);
          const v3Ids = v3Hits.map(({siteFileId}) => siteFileId);
          const carriedSubtitle = findCarriedSubtitle({
            wyzieRowsByCodename,
            opensubtitlesLegacyIds,
            v3Ids,
          });
          const carriedCopies = carriedSubtitle
            ? await downloadCarriedCopies({
                carriedSubtitle,
                wyzieRows: wyzieRowsByCodename[carriedSubtitle.codename],
                v3Hits,
              })
            : {
                wyzieBalanceBefore: null,
                wyzieBalanceAfter: null,
                wyzieHeaderCost: null,
                wyzieCues: null,
                v3Cues: null,
              };
          const opensubtitlesRemainingAfter =
            await readOpensubtitlesRemaining(credential);
          const summary = summarizeWyzieVerification({
            wyzieSources,
            wyzieRowsByCodename,
            opensubtitlesLegacyIds,
            v3Ids,
            wyzieBalanceBefore: carriedCopies.wyzieBalanceBefore,
            wyzieBalanceAfter: carriedCopies.wyzieBalanceAfter,
            opensubtitlesRemainingBefore,
            opensubtitlesRemainingAfter,
            firstCues: (carriedCopies.wyzieCues ?? []).slice(
              0,
              FIRST_CUE_COUNT,
            ),
            wyzieCues: carriedCopies.wyzieCues,
            v3Cues: carriedCopies.v3Cues,
          });
          await writeLiveReport(
            REPORT_NAME,
            renderReport({
              summary,
              wyzieRowsByCodename,
              wyzieRefusalsByCodename,
              reportCounts: {
                wyzieKeyType: wyzieSources.key.type ?? null,
                opensubtitlesHitCount: opensubtitlesHits.length,
                opensubtitlesLegacyIdCount: opensubtitlesLegacyIds.length,
                v3IdCount: v3Ids.length,
                isCarriedIdInV3: carriedSubtitle
                  ? v3Ids.includes(carriedSubtitle.siteFileId)
                  : null,
                wyzieHeaderCost: carriedCopies.wyzieHeaderCost,
                wyzieCueCount: carriedCopies.wyzieCues?.length ?? null,
                v3CueCount: carriedCopies.v3Cues?.length ?? null,
                opensubtitlesRemainingBefore,
                opensubtitlesRemainingAfter,
              },
            }),
          );
          expect(typeof summary.isLegacyIdCarried).toBe('boolean');
        },
      );
    },
    PROBE_TIMEOUT_MS,
  );
});
