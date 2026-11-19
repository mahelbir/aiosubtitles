import {setImmediate as yieldToEventLoop} from 'node:timers/promises';
import {chunk, isNil, uniqBy} from 'es-toolkit';
import {Op} from 'sequelize';
import {
  ARCHIVE_ENTRY_COUNT_MAX,
  ARCHIVE_INFLATED_BYTES_MAX,
  extractSubtitleEntries,
} from '@repo/subtitle-core/archive/extract-subtitle-entries.js';
import {
  listArchiveEntriesForVideo,
  pickArchiveEntryForVideo,
} from '@repo/subtitle-core/archive/pick-archive-entry.js';
import {
  ASS_FILE_FORMATS,
  HardRejectReason,
  SUBTITLE_FORMAT_FILE_EXTENSIONS,
  SubtitleFileExtension,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {computeUrlCode} from '@repo/subtitle-core/stremio-row/url-code.js';
import {sequelize} from '../../db/index.js';
import {SubtitleVideoBinding} from '../../db/models/subtitle-video-binding.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {
  buildSubtitleFileRow,
  insertSubtitleFileRows,
} from './store-subtitle-file.js';

const EPISODE_CUT_ENTRY_PATH_PATTERN = /^S\d{2,}E\d{2,}$/;
const INNER_FILE_INSERT_BATCH_SIZE = 25;

export async function expandArchive({packSubtitle, fileBytes, fileOrigin}) {
  const archiveEntries = await extractSubtitleEntries(fileBytes, {
    inflatedBytesMax: ARCHIVE_INFLATED_BYTES_MAX,
    entryCountMax: ARCHIVE_ENTRY_COUNT_MAX,
  });
  return storeInnerEntries({
    packSubtitle,
    fileOrigin,
    innerEntries: archiveEntries.map(({entryPath, entryBytes}) => ({
      archiveEntryPath: entryPath,
      fileBytes: entryBytes,
      fileNameHint: entryPath,
    })),
  });
}

export async function storeExtractedEntry({
  packSubtitle,
  videoId,
  archiveEntryPath,
  fileBytes,
  fileNameHint,
  fileOrigin,
}) {
  const [innerSubtitle] = await storeInnerEntries({
    packSubtitle,
    fileOrigin,
    innerEntries: [{archiveEntryPath, fileBytes, fileNameHint}],
    boundVideoId: videoId,
  });
  return innerSubtitle;
}

export async function bindPackEntry({
  packSubtitle,
  videoId,
  catalogSeason,
  catalogEpisode,
  kitsuEpisode = null,
}) {
  if (isNil(catalogEpisode)) {
    return null;
  }
  const binding = await readBinding({packSubtitle, videoId});
  if (binding) {
    return findInnerSubtitle(packSubtitle, binding.boundArchiveEntryPath);
  }
  const innerEntryPaths = await findInnerEntryPaths(packSubtitle);
  const archiveEntryPath = pickArchiveEntryForVideo({
    entryPaths: innerEntryPaths,
    seasonNumber: catalogSeason,
    episodeNumber: catalogEpisode,
    alternateEpisodeNumber: kitsuEpisode,
  });
  if (archiveEntryPath === null) {
    return null;
  }
  await insertBinding({packSubtitle, videoId, archiveEntryPath});
  const winner = await readBinding({packSubtitle, videoId});
  return findInnerSubtitle(packSubtitle, winner.boundArchiveEntryPath);
}

export async function canDownloadPackEntry(packSubtitle) {
  const innerEntryPaths = await findInnerEntryPaths(packSubtitle);
  return innerEntryPaths.every(innerEntryPath =>
    EPISODE_CUT_ENTRY_PATH_PATTERN.test(innerEntryPath),
  );
}

export function findPackRejectReason({
  innerEntryPaths,
  catalogSeason,
  catalogEpisode,
  kitsuEpisode = null,
}) {
  if (innerEntryPaths.length === 0) {
    return null;
  }
  const videoEntryPaths = listArchiveEntriesForVideo({
    entryPaths: innerEntryPaths,
    seasonNumber: catalogSeason,
    episodeNumber: catalogEpisode,
    alternateEpisodeNumber: kitsuEpisode,
  });
  return videoEntryPaths.length === 0
    ? HardRejectReason.PACK_WITHOUT_EPISODE
    : null;
}

async function storeInnerEntries({
  packSubtitle,
  fileOrigin,
  innerEntries,
  boundVideoId = null,
}) {
  const uniqueEntries = uniqBy(
    innerEntries,
    ({archiveEntryPath}) => archiveEntryPath,
  );
  if (uniqueEntries.length === 0) {
    return [];
  }
  const builtFiles = await buildInnerFiles({
    packSubtitle,
    fileOrigin,
    uniqueEntries,
  });
  return sequelize.transaction(async transaction => {
    await Subtitle.bulkCreate(
      uniqueEntries.map(({archiveEntryPath, fileNameHint}) =>
        toInnerSubtitleRow({packSubtitle, archiveEntryPath, fileNameHint}),
      ),
      {ignoreDuplicates: true, returning: false, validate: true, transaction},
    );
    const innerSubtitles = await findInnerSubtitles(
      packSubtitle,
      uniqueEntries.map(({archiveEntryPath}) => archiveEntryPath),
      transaction,
    );
    const subtitleIdByEntryPath = new Map(
      innerSubtitles.map(({id, archiveEntryPath}) => [archiveEntryPath, id]),
    );
    for (const fileBatch of chunk(builtFiles, INNER_FILE_INSERT_BATCH_SIZE)) {
      await insertSubtitleFileRows(
        fileBatch.map(({archiveEntryPath, subtitleFileRow}) => ({
          ...subtitleFileRow,
          subtitleId: subtitleIdByEntryPath.get(archiveEntryPath),
        })),
        transaction,
      );
    }
    if (boundVideoId !== null) {
      await insertBinding({
        packSubtitle,
        videoId: boundVideoId,
        archiveEntryPath: uniqueEntries[0].archiveEntryPath,
        transaction,
      });
    }
    return innerSubtitles;
  });
}

async function buildInnerFiles({packSubtitle, fileOrigin, uniqueEntries}) {
  const builtFiles = [];
  for (const {archiveEntryPath, fileBytes, fileNameHint} of uniqueEntries) {
    const {subtitleFileRow} = await buildSubtitleFileRow({
      subtitleId: null,
      fileBytes,
      fileNameHint,
      fileOrigin,
      expectedLanguageCode: packSubtitle.siteLanguageCode,
      fallbackFrameRate: packSubtitle.siteFps ?? null,
    });
    builtFiles.push({archiveEntryPath, subtitleFileRow});
    await yieldToEventLoop();
  }
  return builtFiles;
}

function toInnerSubtitleRow({packSubtitle, archiveEntryPath, fileNameHint}) {
  const {subtitleSource, siteFileId} = packSubtitle;
  const seenAt = new Date();
  return {
    urlCode: computeUrlCode({subtitleSource, siteFileId, archiveEntryPath}),
    subtitleSource,
    siteFileId,
    archiveEntryPath,
    fileExtension: toEntryFileExtension(
      fileNameHint ?? archiveEntryPath,
      packSubtitle.fileExtension,
    ),
    siteLanguageCode: packSubtitle.siteLanguageCode,
    siteFps: packSubtitle.siteFps ?? null,
    siteMetadataUpdatedAt: seenAt,
    firstSeenAt: seenAt,
  };
}

function toEntryFileExtension(fileName, fallbackFileExtension) {
  const extensionStart = fileName.lastIndexOf('.');
  const entryExtension =
    extensionStart > 0 ? fileName.slice(extensionStart + 1).toLowerCase() : '';
  if (ASS_FILE_FORMATS.has(entryExtension)) {
    return SubtitleFileExtension.ASS;
  }
  return SUBTITLE_FORMAT_FILE_EXTENSIONS.has(entryExtension)
    ? SubtitleFileExtension.SRT
    : fallbackFileExtension;
}

function toPackWhere(packSubtitle) {
  return {
    subtitleSource: packSubtitle.subtitleSource,
    siteFileId: packSubtitle.siteFileId,
  };
}

async function findInnerEntryPaths(packSubtitle) {
  const innerSubtitles = await Subtitle.findAll({
    attributes: ['id', 'archiveEntryPath'],
    where: {...toPackWhere(packSubtitle), archiveEntryPath: {[Op.ne]: ''}},
    raw: true,
  });
  return innerSubtitles.map(({archiveEntryPath}) => archiveEntryPath);
}

function findInnerSubtitles(packSubtitle, archiveEntryPaths, transaction) {
  return Subtitle.findAll({
    attributes: Subtitle.downloadAttributes,
    where: {...toPackWhere(packSubtitle), archiveEntryPath: archiveEntryPaths},
    order: [['archiveEntryPath', 'ASC']],
    transaction,
  });
}

function findInnerSubtitle(packSubtitle, archiveEntryPath) {
  return Subtitle.withScope('withStoredFile').findOne({
    where: {...toPackWhere(packSubtitle), archiveEntryPath},
  });
}

function readBinding({packSubtitle, videoId}) {
  return SubtitleVideoBinding.findOne({
    attributes: ['subtitleId', 'videoId', 'boundArchiveEntryPath'],
    where: {subtitleId: packSubtitle.id, videoId},
  });
}

async function insertBinding({
  packSubtitle,
  videoId,
  archiveEntryPath,
  transaction,
}) {
  await SubtitleVideoBinding.bulkCreate(
    [
      {
        subtitleId: packSubtitle.id,
        videoId,
        boundArchiveEntryPath: archiveEntryPath,
        boundAt: new Date(),
      },
    ],
    {ignoreDuplicates: true, returning: false, validate: true, transaction},
  );
}
