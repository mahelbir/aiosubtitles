import {orderBy} from 'es-toolkit';
import {
  ScoringSignal,
  SignalState,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {extractCandidateSignals} from '@repo/subtitle-core/scoring/extract-signals.js';
import {downloadSubtitleFile} from '../subtitle-store/download-subtitle-file.js';
import {scoreVideoCandidate} from '../subtitle-store/score-video-candidate.js';

export function orderByNameScore({candidates, videoContext}) {
  const scoredCandidates = candidates.flatMap(candidate => {
    const {totalScore, hardRejectReason} = scoreVideoCandidate({
      candidate,
      videoContext,
    });
    return hardRejectReason === null
      ? [
          {
            candidate,
            totalScore,
            hasCueShapeMatch:
              extractCandidateSignals({candidate, video: videoContext})[
                ScoringSignal.CUE_SHAPE
              ].signalState === SignalState.MATCH,
          },
        ]
      : [];
  });
  return orderBy(
    scoredCandidates,
    ['totalScore', 'hasCueShapeMatch'],
    ['desc', 'desc'],
  ).map(({candidate}) => candidate);
}

export function downloadCandidate({
  candidate,
  videoContext,
  cachedUserConfig,
  subtitleSourceRegistry,
  canSpendCredential,
}) {
  return downloadSubtitleFile({
    subtitle: toDownloadSubtitle(candidate),
    videoContext,
    cachedUserConfig,
    isBackground: true,
    subtitleSourceRegistry,
    canSpendCredential,
  });
}

export function isDownloadStored(subtitleDownload) {
  return !subtitleDownload.subtitleMessage && !subtitleDownload.isBudgetRefused;
}

function toDownloadSubtitle(candidate) {
  return {
    id: candidate.subtitleId,
    urlCode: candidate.urlCode,
    subtitleSource: candidate.subtitleSource,
    siteFileId: candidate.siteFileId,
    archiveEntryPath: candidate.archiveEntryPath,
    fileExtension: candidate.fileExtension,
    siteLanguageCode: candidate.languageCode,
    siteFps: candidate.siteFps,
    siteFileUrl: candidate.siteFileUrl,
    isSitePack: candidate.isSitePack,
  };
}
