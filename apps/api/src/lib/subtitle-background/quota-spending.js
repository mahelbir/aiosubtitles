import {delay, groupBy, isNil, sumBy} from 'es-toolkit';
import {CredentialStatus} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {config} from '../../config/index.js';
import {createLogger} from '../logger.js';
import {
  hasFreeDownloadPath,
  hasVerifiedHashMatch,
} from '../subtitle-store/read-video-candidates.js';
import {
  downloadCandidate,
  isDownloadStored,
  orderByNameScore,
} from './background-downloads.js';

const SHORT_BUDGET_WINDOW_MAX_MS = 10000;

const SHORT_WINDOW_ATTEMPT_MAX = 3;

const STOPPED_DOWNLOAD = Object.freeze({isStored: false, isStopped: true});

const OPENSUBTITLES_REFERENCE_SOURCES = [
  SubtitleSource.OPENSUBTITLES,
  SubtitleSource.OPENSUBTITLES_V3,
];

const logger = createLogger('subtitle-background');

export function isQuotaSpendAllowed({quotaChecks, viewerShare}) {
  return (
    sumBy(quotaChecks, ({quotaRemainingCount}) => quotaRemainingCount) >
    viewerShare * sumBy(quotaChecks, ({quotaAllowedCount}) => quotaAllowedCount)
  );
}

export function listVideoReferences({candidates, videoContext}) {
  return candidates.filter(
    candidate =>
      candidate.archiveEntryPath === '' &&
      hasVerifiedHashMatch(candidate, videoContext),
  );
}

export async function spendOpensubtitlesQuota({
  candidates,
  videoContext,
  accounts,
  cachedUserConfig,
  subtitleSourceRegistry,
  signal,
}) {
  const client = subtitleSourceRegistry.getSubtitleSourceClient(
    SubtitleSource.OPENSUBTITLES,
  );
  const references = listVideoReferences({candidates, videoContext});
  if (!client?.readQuota || accounts.length === 0 || references.length === 0) {
    return [];
  }
  const downloadOptions = {
    videoContext,
    cachedUserConfig,
    subtitleSourceRegistry,
    signal,
    canSpendCredential: async () =>
      !signal?.aborted &&
      isQuotaSpendAllowed({
        quotaChecks: await readQuotaChecks(client, accounts),
        viewerShare: config.opensubtitlesQuotaViewerShare,
      }),
  };
  const downloadedIds = [];
  if (!references.some(hasStoredFile)) {
    const [reference] = orderByNameScore({
      candidates: references.filter(({subtitleSource}) =>
        OPENSUBTITLES_REFERENCE_SOURCES.includes(subtitleSource),
      ),
      videoContext,
    });
    if (!reference) {
      return downloadedIds;
    }
    const {isStored} = await downloadWithinWindows({
      candidate: reference,
      ...downloadOptions,
    });
    if (!isStored) {
      return downloadedIds;
    }
    downloadedIds.push(reference.subtitleId);
  }
  const referenceIds = new Set(references.map(({subtitleId}) => subtitleId));
  const languageCandidates = groupBy(
    candidates.filter(
      candidate =>
        candidate.subtitleSource === SubtitleSource.OPENSUBTITLES &&
        candidate.archiveEntryPath === '' &&
        !referenceIds.has(candidate.subtitleId),
    ),
    ({languageCode}) => languageCode,
  );
  const quotaCandidates = Object.values(languageCandidates)
    .flatMap(sameLanguageCandidates =>
      orderByNameScore({
        candidates: sameLanguageCandidates,
        videoContext,
      }).slice(0, config.opensubtitlesQuotaCandidateMax),
    )
    .filter(candidate => !hasFreeDownloadPath(candidate));
  for (const candidate of quotaCandidates) {
    const {isStored, isStopped} = await downloadWithinWindows({
      candidate,
      ...downloadOptions,
    });
    if (isStopped) {
      break;
    }
    if (isStored) {
      downloadedIds.push(candidate.subtitleId);
    }
  }
  return downloadedIds;
}

function hasStoredFile({fileFacts}) {
  return fileFacts?.isFileValid === true;
}

async function downloadWithinWindows({signal, ...downloadOptions}) {
  for (
    let attemptNumber = 1;
    attemptNumber <= SHORT_WINDOW_ATTEMPT_MAX;
    attemptNumber += 1
  ) {
    if (signal?.aborted) {
      return STOPPED_DOWNLOAD;
    }
    const subtitleDownload = await downloadCandidate(downloadOptions);
    if (!subtitleDownload.isBudgetRefused) {
      return {isStored: isDownloadStored(subtitleDownload), isStopped: false};
    }
    if (
      subtitleDownload.refusedWindowMs > SHORT_BUDGET_WINDOW_MAX_MS ||
      attemptNumber === SHORT_WINDOW_ATTEMPT_MAX
    ) {
      return STOPPED_DOWNLOAD;
    }
    try {
      await delay(Math.max(0, subtitleDownload.retryAtMs - Date.now()), {
        signal,
      });
    } catch {
      return STOPPED_DOWNLOAD;
    }
  }
  return STOPPED_DOWNLOAD;
}

async function readQuotaChecks(client, accounts) {
  const quotaChecks = await Promise.all(
    accounts.map(account =>
      client.readQuota(account).catch(error => {
        logger.warn(
          {subtitleSource: client.subtitleSource, errorName: error?.name},
          'Quota could not be read.',
        );
        return null;
      }),
    ),
  );
  return quotaChecks.filter(
    quotaCheck =>
      quotaCheck !== null &&
      quotaCheck.credentialStatus !== CredentialStatus.INVALID &&
      !isNil(quotaCheck.quotaRemainingCount) &&
      !isNil(quotaCheck.quotaAllowedCount),
  );
}
