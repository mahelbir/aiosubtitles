import {sortBy, uniqBy} from 'es-toolkit';
import {sequelize} from '../../db/index.js';
import {SubtitleAlias} from '../../db/models/subtitle-alias.js';
import {SubtitleHashMatch} from '../../db/models/subtitle-hash-match.js';
import {SubtitleVideoCandidate} from '../../db/models/subtitle-video-candidate.js';
import {Subtitle} from '../../db/models/subtitle.js';
import {toSubtitleRowValues} from '../subtitle-sources/subtitle-source-contract.js';

const SUBTITLE_SITE_METADATA_FIELDS = [
  'siteLanguageCode',
  'releaseNames',
  'isHearingImpaired',
  'isForced',
  'isMachineTranslated',
  'isUploaderTrusted',
  'isQuotaCostly',
  'isSitePack',
  'siteDownloadCount',
  'siteFps',
  'siteFileUrl',
  'siteCueCount',
  'siteDurationMs',
  'siteMetadataUpdatedAt',
];

const SUBTITLE_CONFLICT_FIELDS = [
  'subtitleSource',
  'siteFileId',
  'archiveEntryPath',
];

export async function persistSearchHits({
  videoId,
  searchHits,
  seenAt = new Date(),
  isCandidateLinked = true,
}) {
  const hitRows = sortBy(
    uniqBy(
      searchHits.map(searchHit => ({
        searchHit,
        subtitleRow: toSubtitleRowValues(searchHit),
      })),
      ({subtitleRow}) => subtitleRow.urlCode,
    ),
    [({subtitleRow}) => subtitleRow.urlCode],
  );
  if (hitRows.length === 0) {
    return;
  }
  await sequelize.transaction(async transaction => {
    await Subtitle.bulkCreate(
      hitRows.map(({subtitleRow}) => ({
        ...subtitleRow,
        firstSeenAt: seenAt,
        siteMetadataUpdatedAt: seenAt,
      })),
      {
        conflictAttributes: SUBTITLE_CONFLICT_FIELDS,
        updateOnDuplicate: SUBTITLE_SITE_METADATA_FIELDS,
        returning: false,
        validate: true,
        transaction,
      },
    );
    const storedSubtitles = await Subtitle.findAll({
      attributes: ['id', 'urlCode'],
      where: {urlCode: hitRows.map(({subtitleRow}) => subtitleRow.urlCode)},
      raw: true,
      transaction,
    });
    const subtitleIdByUrlCode = new Map(
      storedSubtitles.map(({id, urlCode}) => [urlCode, id]),
    );
    const storedHits = hitRows.map(({searchHit, subtitleRow}) => ({
      searchHit,
      subtitleId: subtitleIdByUrlCode.get(subtitleRow.urlCode),
    }));
    if (isCandidateLinked) {
      await SubtitleVideoCandidate.bulkCreate(
        sortBy(
          storedHits.map(({subtitleId}) => ({
            videoId,
            subtitleId,
            candidateFirstSeenAt: seenAt,
            candidateLastSeenAt: seenAt,
          })),
          ['subtitleId'],
        ),
        {
          updateOnDuplicate: ['candidateLastSeenAt'],
          returning: false,
          validate: true,
          transaction,
        },
      );
    }
    const hashMatchRows = sortBy(
      uniqBy(
        storedHits.flatMap(({searchHit, subtitleId}) =>
          searchHit.hashMatchVideoHashes.map(videoHash => ({
            subtitleId,
            videoHash: videoHash.toLowerCase(),
            matchSeenAt: seenAt,
          })),
        ),
        ({subtitleId, videoHash}) => `${subtitleId}:${videoHash}`,
      ),
      ['subtitleId', 'videoHash'],
    );
    const aliasRows = sortBy(
      uniqBy(
        storedHits.flatMap(({searchHit, subtitleId}) =>
          searchHit.subtitleAliases.map(({aliasSource, aliasSiteFileId}) => ({
            subtitleId,
            aliasSource,
            aliasSiteFileId,
          })),
        ),
        ({aliasSource, aliasSiteFileId}) => `${aliasSource}:${aliasSiteFileId}`,
      ),
      ['aliasSource', 'aliasSiteFileId'],
    );
    await insertIgnoringDuplicates(
      SubtitleHashMatch,
      hashMatchRows,
      transaction,
    );
    await insertIgnoringDuplicates(SubtitleAlias, aliasRows, transaction);
  });
}

async function insertIgnoringDuplicates(model, rows, transaction) {
  if (rows.length === 0) {
    return;
  }
  await model.bulkCreate(rows, {
    ignoreDuplicates: true,
    returning: false,
    validate: true,
    transaction,
  });
}
