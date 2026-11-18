import {isNil, orderBy} from 'es-toolkit';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {detectArchiveKind} from '@repo/subtitle-core/archive/detect-archive-kind.js';
import {
  ARCHIVE_ENTRY_COUNT_MAX,
  ARCHIVE_INFLATED_BYTES_MAX,
  extractSubtitleEntries,
} from '@repo/subtitle-core/archive/extract-subtitle-entries.js';
import {pickArchiveEntryForVideo} from '@repo/subtitle-core/archive/pick-archive-entry.js';
import {SubtitleMessage} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {SubtitleAlias} from '../../db/models/subtitle-alias.js';
import {SubtitleFileOrigin} from '../../db/models/subtitle-file.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {createLogger} from '../logger.js';
import {recordSubtitleSourceFailure} from '../record-subtitle-source-failure.js';
import {readSubtitleSourceBreaker} from '../subtitle-search/subtitle-source-breaker.js';
import {
  spendSubtitleSourceBudget,
  toBudgetRecoveryWindowMs,
} from '../subtitle-search/subtitle-source-budget.js';
import {readDownloadCredentials} from '../subtitle-source-credentials.js';
import {SubtitleAliasSource} from '../subtitle-sources/subtitle-alias-source.js';
import {isPrivateSubtitleSourceUrl} from '../subtitle-sources/subtitle-source-request.js';
import {
  bindPackEntry,
  canDownloadPackEntry,
  expandArchive,
  storeExtractedEntry,
} from './pack-binding.js';
import {parseStoredSubtitleFile} from './read-subtitle-file.js';
import {
  isServableSubtitleFile,
  storeSubtitleFile,
} from './store-subtitle-file.js';

const DOWNLOAD_FAILED = Object.freeze({
  subtitleMessage: SubtitleMessage.SUBTITLE_DOWNLOAD_FAILED,
});

const USER_CONFIG_DELETED = Object.freeze({
  subtitleMessage: SubtitleMessage.USER_CONFIG_DELETED,
});

const PACK_STORED = Object.freeze({isPackStored: true});

const UNKNOWN_QUOTA_COUNT = -1;

const logger = createLogger('subtitle-download');
const pendingDownloads = new Map();

export async function readStoredSubtitleFile({subtitle, videoContext}) {
  const storedSubtitle = subtitle.isSitePack
    ? await bindPackEntry({
        packSubtitle: subtitle,
        videoId: videoContext.videoId,
        catalogSeason: videoContext.catalogSeason,
        catalogEpisode: videoContext.catalogEpisode,
      })
    : subtitle;
  const subtitleFile = storedSubtitle?.subtitleFile;
  if (!subtitleFile) {
    return null;
  }
  if (!isServableSubtitleFile(subtitleFile)) {
    return DOWNLOAD_FAILED;
  }
  return {
    parsedSubtitle: parseStoredSubtitleFile({
      subtitleFile,
      siteFps: storedSubtitle.siteFps,
    }),
  };
}

export async function downloadSubtitleFile(downloadOptions) {
  const {urlCode} = downloadOptions.subtitle;
  for (;;) {
    const pendingDownload = pendingDownloads.get(urlCode);
    if (!pendingDownload) {
      return finishDownload(
        downloadOptions,
        await leadDownload(downloadOptions),
      );
    }
    const joinedFile = await joinDownload(
      downloadOptions,
      await pendingDownload,
    );
    if (joinedFile) {
      return joinedFile;
    }
  }
}

function leadDownload(downloadOptions) {
  const {urlCode} = downloadOptions.subtitle;
  const pendingDownload = fetchSubtitleFile(downloadOptions).finally(() => {
    pendingDownloads.delete(urlCode);
  });
  pendingDownloads.set(urlCode, pendingDownload);
  return pendingDownload;
}

async function finishDownload(downloadOptions, fetchedFile) {
  if (!downloadOptions.subtitle.isSitePack || fetchedFile.subtitleMessage) {
    return fetchedFile;
  }
  return (await readStoredSubtitleFile(downloadOptions)) ?? DOWNLOAD_FAILED;
}

async function joinDownload(downloadOptions, leaderFile) {
  if (leaderFile.subtitleMessage) {
    return null;
  }
  return downloadOptions.subtitle.isSitePack
    ? readStoredSubtitleFile(downloadOptions)
    : leaderFile;
}

async function fetchSubtitleFile(downloadOptions) {
  const {subtitle, videoContext} = downloadOptions;
  try {
    const storedFile = await readStoredSubtitleFile({
      subtitle: subtitle.isSitePack
        ? subtitle
        : await Subtitle.withScope('withStoredFile').findByPk(subtitle.id),
      videoContext,
    });
    if (storedFile) {
      return storedFile.subtitleMessage || !subtitle.isSitePack
        ? storedFile
        : PACK_STORED;
    }
    if (subtitle.isSitePack && !(await canDownloadPack(downloadOptions))) {
      return DOWNLOAD_FAILED;
    }
    const fileDownload = await downloadFromSources(downloadOptions);
    if (fileDownload.subtitleMessage) {
      return fileDownload;
    }
    return await storeDownload({...downloadOptions, ...fileDownload});
  } catch (error) {
    logDownloadFailure(subtitle.subtitleSource, error);
    return DOWNLOAD_FAILED;
  }
}

async function canDownloadPack({subtitle, videoContext}) {
  return !isNil(videoContext.catalogEpisode) && canDownloadPackEntry(subtitle);
}

async function downloadFromSources({
  subtitle,
  videoContext,
  cachedUserConfig,
  isBackground,
  subtitleSourceRegistry,
}) {
  const {subtitleSource} = subtitle;
  if (subtitleSource === SubtitleSource.OPENSUBTITLES) {
    const aliasDownload = await downloadThroughV3({
      subtitle,
      videoContext,
      cachedUserConfig,
      isBackground,
      subtitleSourceRegistry,
    });
    if (aliasDownload) {
      return {
        ...aliasDownload,
        fileOrigin: SubtitleFileOrigin.OPENSUBTITLES_V3,
      };
    }
  }
  const client = subtitleSourceRegistry.getSubtitleSourceClient(subtitleSource);
  const subtitleRef = toSubtitleRef(subtitle, videoContext);
  if (!client || !subtitleRef) {
    return DOWNLOAD_FAILED;
  }
  const candidateCredentials = readDownloadCredentials({
    client,
    cachedUserConfig,
  });
  if (candidateCredentials.length === 0) {
    return cachedUserConfig ? DOWNLOAD_FAILED : USER_CONFIG_DELETED;
  }
  if (await isBreakerOpen(client)) {
    return DOWNLOAD_FAILED;
  }
  const sourceDownload = await downloadWithCredentials({
    client,
    subtitleRef,
    candidateCredentials: await orderByQuota(client, candidateCredentials),
    isBackground,
  });
  return sourceDownload ?? DOWNLOAD_FAILED;
}

async function downloadThroughV3({
  subtitle,
  videoContext,
  cachedUserConfig,
  isBackground,
  subtitleSourceRegistry,
}) {
  const client = subtitleSourceRegistry.getSubtitleSourceClient(
    SubtitleSource.OPENSUBTITLES_V3,
  );
  const aliasSubtitle = client && (await findV3Subtitle(subtitle.id));
  const subtitleRef =
    aliasSubtitle && toSubtitleRef(aliasSubtitle, videoContext);
  if (!subtitleRef) {
    return null;
  }
  return downloadWithCredentials({
    client,
    subtitleRef,
    candidateCredentials: readDownloadCredentials({client, cachedUserConfig}),
    isBackground,
  });
}

async function findV3Subtitle(subtitleId) {
  const subtitleAlias = await SubtitleAlias.findOne({
    attributes: ['aliasSiteFileId'],
    where: {subtitleId, aliasSource: SubtitleAliasSource.OPENSUBTITLES_V3},
  });
  if (!subtitleAlias) {
    return null;
  }
  return Subtitle.findOne({
    attributes: Subtitle.downloadAttributes,
    where: {
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      siteFileId: subtitleAlias.aliasSiteFileId,
      archiveEntryPath: '',
    },
  });
}

async function isBreakerOpen(client, nowMs = Date.now()) {
  const {isOpen} = await readSubtitleSourceBreaker(
    client.subtitleSource,
    nowMs,
    toBudgetRecoveryWindowMs(client.downloadBudgets),
  );
  return isOpen;
}

async function orderByQuota(client, candidateCredentials) {
  if (!client.readQuota || candidateCredentials.length < 2) {
    return candidateCredentials;
  }
  const quotaCounts = await Promise.all(
    candidateCredentials.map(credential => readQuotaCount(client, credential)),
  );
  return orderBy(
    candidateCredentials
      .map((credential, credentialIndex) => ({
        credential,
        quotaCount: quotaCounts[credentialIndex],
      }))
      .filter(({quotaCount}) => quotaCount !== null),
    ['quotaCount'],
    ['desc'],
  ).map(({credential}) => credential);
}

async function readQuotaCount(client, credential) {
  if (!credential) {
    return UNKNOWN_QUOTA_COUNT;
  }
  try {
    const {quotaRemainingCount} = await client.readQuota(credential);
    return quotaRemainingCount ?? UNKNOWN_QUOTA_COUNT;
  } catch (error) {
    logDownloadFailure(client.subtitleSource, error);
    const isCredentialRejected = await recordSubtitleSourceFailure({
      client,
      error,
      nowMs: Date.now(),
    });
    return isCredentialRejected ? null : UNKNOWN_QUOTA_COUNT;
  }
}

async function downloadWithCredentials({
  client,
  subtitleRef,
  candidateCredentials,
  isBackground,
}) {
  for (const credential of candidateCredentials) {
    const nowMs = Date.now();
    if (await isBreakerOpen(client, nowMs)) {
      return null;
    }
    const isSpent = await spendSubtitleSourceBudget({
      client,
      credentialId: credential?.credentialId ?? null,
      isBackground,
      nowMs,
    });
    if (!isSpent) {
      continue;
    }
    try {
      return {
        sourceDownload: await client.downloadSubtitle(subtitleRef, credential),
        fileOrigin: credential
          ? SubtitleFileOrigin.USER_CREDENTIAL
          : SubtitleFileOrigin.DIRECT,
      };
    } catch (error) {
      logDownloadFailure(client.subtitleSource, error);
      await recordSubtitleSourceFailure({client, error, nowMs: Date.now()});
    }
  }
  return null;
}

function toSubtitleRef(subtitle, {catalogSeason, catalogEpisode}) {
  if (subtitle.siteFileUrl && isUnsafeSiteFileUrl(subtitle.siteFileUrl)) {
    return null;
  }
  return {
    subtitleSource: subtitle.subtitleSource,
    siteFileId: subtitle.siteFileId,
    siteFileUrl: subtitle.siteFileUrl,
    catalogSeason,
    catalogEpisode,
    isSitePack: subtitle.isSitePack,
  };
}

function isUnsafeSiteFileUrl(siteFileUrl) {
  try {
    return isPrivateSubtitleSourceUrl(siteFileUrl);
  } catch {
    return true;
  }
}

async function storeDownload({
  subtitle,
  videoContext,
  sourceDownload,
  fileOrigin,
}) {
  if (subtitle.isSitePack) {
    return storePackDownload({
      subtitle,
      videoContext,
      sourceDownload,
      fileOrigin,
    });
  }
  const {fileBytes, fileNameHint, extractedEntryPath} = sourceDownload;
  const subtitleEntry = await readSubtitleEntry({
    fileBytes,
    fileNameHint: fileNameHint ?? extractedEntryPath,
    videoContext,
  });
  if (!subtitleEntry) {
    return DOWNLOAD_FAILED;
  }
  const storedFile = await storeSubtitleFile({
    subtitleId: subtitle.id,
    fileBytes: subtitleEntry.fileBytes,
    fileNameHint: subtitleEntry.fileNameHint,
    fileOrigin,
    expectedLanguageCode: subtitle.siteLanguageCode,
    fallbackFrameRate: subtitle.siteFps,
  });
  return isServableSubtitleFile(storedFile.fileFacts)
    ? storedFile
    : DOWNLOAD_FAILED;
}

async function storePackDownload({
  subtitle,
  videoContext,
  sourceDownload,
  fileOrigin,
}) {
  const {fileBytes, fileNameHint, extractedEntryPath} = sourceDownload;
  if (extractedEntryPath) {
    await storeExtractedEntry({
      packSubtitle: subtitle,
      videoId: videoContext.videoId,
      archiveEntryPath: extractedEntryPath,
      fileBytes,
      fileNameHint,
      fileOrigin,
    });
    return PACK_STORED;
  }
  if (detectArchiveKind(fileBytes) === null) {
    return DOWNLOAD_FAILED;
  }
  const innerSubtitles = await expandArchive({
    packSubtitle: subtitle,
    fileBytes,
    fileOrigin,
  });
  return innerSubtitles.length > 0 ? PACK_STORED : DOWNLOAD_FAILED;
}

async function readSubtitleEntry({fileBytes, fileNameHint, videoContext}) {
  if (detectArchiveKind(fileBytes) === null) {
    return {fileBytes, fileNameHint};
  }
  const archiveEntries = await extractSubtitleEntries(fileBytes, {
    inflatedBytesMax: ARCHIVE_INFLATED_BYTES_MAX,
    entryCountMax: ARCHIVE_ENTRY_COUNT_MAX,
  });
  if (videoContext.isEpisodeResolved === false && archiveEntries.length > 1) {
    return null;
  }
  const entryPath = pickArchiveEntryForVideo({
    entryPaths: archiveEntries.map(({entryPath}) => entryPath),
    seasonNumber: videoContext.catalogSeason,
    episodeNumber: videoContext.catalogEpisode,
  });
  const archiveEntry = archiveEntries.find(
    entry => entry.entryPath === entryPath,
  );
  return archiveEntry
    ? {fileBytes: archiveEntry.entryBytes, fileNameHint: archiveEntry.entryPath}
    : null;
}

function logDownloadFailure(subtitleSource, error) {
  logger.warn(
    {subtitleSource, errorName: error?.name},
    'Subtitle download failed.',
  );
}
