import path from 'node:path';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';
import {groupBy, isNil, uniq} from 'es-toolkit';
import {Op} from 'sequelize';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {pickArchiveEntryForVideo} from '@repo/subtitle-core/archive/pick-archive-entry.js';
import {normalizeCueText} from '@repo/subtitle-core/file-format/normalize-cue-text.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {readUsableVideoRelease} from '@repo/subtitle-core/scoring/release-comparison.js';
import {verifyHashMatch} from '@repo/subtitle-core/scoring/verify-hash-match.js';
import {SubtitleAlias} from '../../db/models/subtitle-alias.js';
import {SubtitleFile} from '../../db/models/subtitle-file.js';
import {SubtitleHashMatch} from '../../db/models/subtitle-hash-match.js';
import {SubtitleReferenceComparison} from '../../db/models/subtitle-reference-comparison.js';
import {SubtitleVideoBinding} from '../../db/models/subtitle-video-binding.js';
import {SubtitleVideoCandidate} from '../../db/models/subtitle-video-candidate.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {createLogger} from '../logger.js';
import {SubtitleAliasSource} from '../subtitle-sources/subtitle-alias-source.js';
import {listVideoVariants} from '../video-catalog/video-variants.js';
import {parseStoredSubtitleFile} from './read-subtitle-file.js';

const logger = createLogger('subtitle-store');

const SUBTITLE_SOURCE_ALIAS_SOURCES = SubtitleAliasSource.values.filter(
  aliasSource => SubtitleSource.has(aliasSource),
);

export async function readVideoCandidates({
  videoId,
  videoContext,
  scopedUrlCodes = [],
}) {
  const candidateRows = await SubtitleVideoCandidate.withScope('link').findAll({
    where: {videoId},
    raw: true,
  });
  if (candidateRows.length === 0 && scopedUrlCodes.length === 0) {
    return [];
  }
  const subtitles = await Subtitle.withScope('withFileFacts').findAll({
    where: {
      [Op.or]: [
        {id: candidateRows.map(({subtitleId}) => subtitleId)},
        {urlCode: scopedUrlCodes},
      ],
    },
  });
  const packSubtitles = subtitles.filter(({isSitePack}) => isSitePack);
  const [
    innerSubtitles,
    packBindings,
    subtitleAliases,
    hashMatches,
    videoVariants,
  ] = await Promise.all([
    readInnerSubtitles(packSubtitles),
    readPackBindings(packSubtitles, videoId),
    readSubtitleAliases(subtitles),
    readHashMatches(subtitles),
    hasVideoInformation(videoContext) ? [] : listVideoVariants(videoId),
  ]);
  const candidates = subtitles.flatMap(subtitle =>
    subtitle.isSitePack
      ? toPackCandidates({
          packSubtitle: subtitle,
          innerSubtitles,
          packBindings,
          videoContext,
        })
      : [toCandidate(subtitle)],
  );
  const linkedCandidates = linkAliasesAndHashes({
    candidates,
    subtitleAliases,
    hashMatches,
  });
  return attachReferenceSignals({
    candidates: linkedCandidates,
    videoContext,
    videoVariants,
  });
}

export async function readCandidateCues(candidates, {signal} = {}) {
  const cuesByFileSubtitleId = new Map();
  const fileSubtitleIds = uniq(
    candidates.map(({fileSubtitleId}) => fileSubtitleId).filter(Boolean),
  );
  if (fileSubtitleIds.length === 0) {
    return cuesByFileSubtitleId;
  }
  const subtitleFiles = await SubtitleFile.withScope('cueSource').findAll({
    where: {subtitleId: fileSubtitleIds},
  });
  const siteFpsBySubtitleId = new Map(
    candidates.map(({fileSubtitleId, siteFps}) => [fileSubtitleId, siteFps]),
  );
  for (const subtitleFile of subtitleFiles) {
    if (signal?.aborted) {
      break;
    }
    try {
      cuesByFileSubtitleId.set(
        subtitleFile.subtitleId,
        parseStoredSubtitleFile({
          subtitleFile,
          siteFps: siteFpsBySubtitleId.get(subtitleFile.subtitleId) ?? null,
        }).cues.map(({startMs, endMs, text}) => ({
          startMs,
          endMs,
          text: normalizeCueText(text),
        })),
      );
    } catch (error) {
      logger.warn({errorName: error.name}, 'Stored cues could not be read.');
    }
    await yieldToEventLoop();
  }
  return cuesByFileSubtitleId;
}

function readInnerSubtitles(packSubtitles) {
  if (packSubtitles.length === 0) {
    return [];
  }
  return Subtitle.withScope('withFileFacts').findAll({
    where: {
      [Op.or]: packSubtitles.map(({subtitleSource, siteFileId}) => ({
        subtitleSource,
        siteFileId,
      })),
      archiveEntryPath: {[Op.ne]: ''},
    },
  });
}

function readPackBindings(packSubtitles, videoId) {
  if (packSubtitles.length === 0) {
    return [];
  }
  return SubtitleVideoBinding.withScope('binding').findAll({
    where: {videoId, subtitleId: packSubtitles.map(({id}) => id)},
    raw: true,
  });
}

function readSubtitleAliases(subtitles) {
  return SubtitleAlias.withScope('link').findAll({
    where: {
      [Op.or]: [
        {subtitleId: subtitles.map(({id}) => id)},
        {
          aliasSource: SUBTITLE_SOURCE_ALIAS_SOURCES,
          aliasSiteFileId: uniq(subtitles.map(({siteFileId}) => siteFileId)),
        },
      ],
    },
    raw: true,
  });
}

function readHashMatches(subtitles) {
  return SubtitleHashMatch.withScope('link').findAll({
    where: {subtitleId: subtitles.map(({id}) => id)},
    raw: true,
  });
}

function toPackCandidates({
  packSubtitle,
  innerSubtitles,
  packBindings,
  videoContext,
}) {
  const packInnerSubtitles = innerSubtitles.filter(
    innerSubtitle =>
      innerSubtitle.subtitleSource === packSubtitle.subtitleSource &&
      innerSubtitle.siteFileId === packSubtitle.siteFileId,
  );
  const packInnerEntryPaths = packInnerSubtitles.map(
    ({archiveEntryPath}) => archiveEntryPath,
  );
  const boundArchiveEntryPath =
    packBindings.find(({subtitleId}) => subtitleId === packSubtitle.id)
      ?.boundArchiveEntryPath ??
    (isNil(videoContext.catalogEpisode)
      ? null
      : pickArchiveEntryForVideo({
          entryPaths: packInnerEntryPaths,
          seasonNumber: videoContext.catalogSeason,
          episodeNumber: videoContext.catalogEpisode,
          alternateEpisodeNumber: videoContext.kitsuEpisode ?? null,
        }));
  const boundSubtitle = packInnerSubtitles.find(
    ({archiveEntryPath}) => archiveEntryPath === boundArchiveEntryPath,
  );
  return [
    {
      ...toCandidate(packSubtitle, boundSubtitle),
      packInnerEntryPaths,
    },
    ...packInnerSubtitles.map(innerSubtitle => ({
      ...toCandidate(innerSubtitle),
      releaseNames: toInnerReleaseNames(innerSubtitle),
      isPackInner: true,
      isPackBound: innerSubtitle.archiveEntryPath === boundArchiveEntryPath,
    })),
  ];
}

function toInnerReleaseNames({releaseNames, archiveEntryPath}) {
  if (releaseNames.length > 0) {
    return releaseNames;
  }
  const {name, base} = path.posix.parse(archiveEntryPath);
  return [name || base];
}

function toCandidate(subtitle, fileSubtitle = subtitle) {
  const subtitleFile = fileSubtitle?.subtitleFile ?? null;
  return {
    subtitleId: subtitle.id,
    fileSubtitleId: subtitleFile ? fileSubtitle.id : null,
    urlCode: subtitle.urlCode,
    subtitleSource: subtitle.subtitleSource,
    siteFileId: subtitle.siteFileId,
    archiveEntryPath: subtitle.archiveEntryPath,
    siteFileUrl: subtitle.siteFileUrl,
    aliasOfUrlCode: null,
    hasOpensubtitlesV3Alias: false,
    languageCode: subtitle.siteLanguageCode,
    releaseNames: subtitle.releaseNames,
    isSitePack: subtitle.isSitePack,
    isHearingImpaired: subtitle.isHearingImpaired,
    isForced: subtitle.isForced,
    isMachineTranslated: subtitle.isMachineTranslated,
    isUploaderTrusted: subtitle.isUploaderTrusted,
    isQuotaCostly: subtitle.isQuotaCostly,
    siteDownloadCount: subtitle.siteDownloadCount,
    siteFps: fileSubtitle?.siteFps ?? subtitle.siteFps,
    firstSeenAt: subtitle.firstSeenAt.toISOString(),
    fileExtension: subtitle.fileExtension,
    fileFormat: subtitleFile?.fileFormat ?? null,
    hashMatchVideoHashes: [],
    fileFacts: subtitleFile && toFileFacts(subtitleFile),
    siteCueShape: toSiteCueShape(subtitle),
    referenceComparison: null,
    variantReferenceFamilyCount: 0,
    variantHashMatchCount: 0,
  };
}

function toFileFacts(subtitleFile) {
  return {
    contentKey: subtitleFile.contentKey,
    isFileValid: subtitleFile.isFileValid,
    fileInvalidReasons: subtitleFile.fileInvalidReasons,
    cueCount: subtitleFile.cueCount,
    lastCueEndMs: subtitleFile.lastCueEndMs,
    detectedLanguageCode: subtitleFile.detectedLanguageCode,
    normalizedCues: null,
  };
}

function toSiteCueShape({siteCueCount, siteDurationMs}) {
  return siteCueCount === null || siteDurationMs === null
    ? null
    : {cueCount: siteCueCount, lastCueEndMs: siteDurationMs};
}

function linkAliasesAndHashes({candidates, subtitleAliases, hashMatches}) {
  const urlCodeBySubtitleId = new Map(
    candidates.map(({subtitleId, urlCode}) => [subtitleId, urlCode]),
  );
  const hashesBySubtitleId = groupBy(hashMatches, ({subtitleId}) => subtitleId);
  return candidates.map(candidate => {
    const aliasTarget =
      candidate.archiveEntryPath === ''
        ? subtitleAliases.find(
            ({aliasSource, aliasSiteFileId, subtitleId}) =>
              aliasSource === candidate.subtitleSource &&
              aliasSiteFileId === candidate.siteFileId &&
              urlCodeBySubtitleId.has(subtitleId),
          )
        : undefined;
    return {
      ...candidate,
      aliasOfUrlCode: aliasTarget
        ? urlCodeBySubtitleId.get(aliasTarget.subtitleId)
        : null,
      hasOpensubtitlesV3Alias: subtitleAliases.some(
        ({subtitleId, aliasSource}) =>
          subtitleId === candidate.subtitleId &&
          aliasSource === SubtitleAliasSource.OPENSUBTITLES_V3,
      ),
      hashMatchVideoHashes: (
        hashesBySubtitleId[candidate.subtitleId] ?? []
      ).map(({videoHash}) => videoHash),
    };
  });
}

async function attachReferenceSignals({
  candidates,
  videoContext,
  videoVariants,
}) {
  const requestReferenceIds = listReferenceIds(candidates, videoContext);
  const variantReferenceIds = videoVariants.map(({videoHash, videoFilename}) =>
    listReferenceIds(candidates, {
      ...videoContext,
      videoHash,
      videoRelease: videoFilename ? parseReleaseName(videoFilename) : null,
    }),
  );
  const referenceComparisons = await readReferenceComparisons({
    candidates,
    referenceIds: uniq([...requestReferenceIds, ...variantReferenceIds.flat()]),
  });
  const variantHashes = videoVariants.map(({videoHash}) => videoHash);
  return candidates.map(candidate => {
    const candidateComparisons = referenceComparisons.filter(
      ({candidateSubtitleId}) =>
        candidateSubtitleId === candidate.fileSubtitleId,
    );
    const requestComparisons = candidateComparisons.filter(
      ({referenceSubtitleId}) =>
        requestReferenceIds.includes(referenceSubtitleId),
    );
    return {
      ...candidate,
      referenceComparison:
        requestComparisons.length === 0
          ? null
          : {
              isSameTimeFamily: requestComparisons.some(
                ({isSameTimeFamily}) => isSameTimeFamily,
              ),
            },
      variantReferenceFamilyCount: variantReferenceIds.filter(referenceIds =>
        candidateComparisons.some(
          ({referenceSubtitleId, isSameTimeFamily}) =>
            isSameTimeFamily && referenceIds.includes(referenceSubtitleId),
        ),
      ).length,
      variantHashMatchCount: variantHashes.filter(videoHash =>
        candidate.hashMatchVideoHashes.includes(videoHash),
      ).length,
    };
  });
}

function listReferenceIds(candidates, video) {
  if (!video.videoHash) {
    return [];
  }
  return uniq(
    candidates
      .filter(
        candidate =>
          candidate.fileFacts?.isFileValid === true &&
          hasVerifiedHashMatch(candidate, video),
      )
      .map(({fileSubtitleId}) => fileSubtitleId),
  );
}

export function hasVerifiedHashMatch(candidate, video) {
  return (
    Boolean(video.videoHash) &&
    candidate.hashMatchVideoHashes.includes(video.videoHash) &&
    isHashMatchVerified(candidate, video)
  );
}

export function hasFreeDownloadPath({fileFacts, hasOpensubtitlesV3Alias}) {
  return fileFacts !== null || hasOpensubtitlesV3Alias;
}

export function isHashMatchVerified({releaseNames, isSitePack}, video) {
  const candidateReleases =
    releaseNames.length === 0
      ? [null]
      : releaseNames.map(releaseName =>
          parseReleaseName(releaseName, {isSitePack}),
        );
  return candidateReleases.some(candidateRelease =>
    verifyHashMatch({candidateRelease, video, isSitePack}),
  );
}

function readReferenceComparisons({candidates, referenceIds}) {
  const fileSubtitleIds = uniq(
    candidates.map(({fileSubtitleId}) => fileSubtitleId).filter(Boolean),
  );
  if (referenceIds.length === 0 || fileSubtitleIds.length === 0) {
    return [];
  }
  return SubtitleReferenceComparison.withScope('timeFamily').findAll({
    where: {
      candidateSubtitleId: fileSubtitleIds,
      referenceSubtitleId: referenceIds,
    },
    raw: true,
  });
}

function hasVideoInformation(videoContext) {
  return (
    videoContext.videoHash !== null ||
    readUsableVideoRelease(videoContext) !== null
  );
}
