import {VideoVariant} from '../../db/models/video-variant.js';

const VIDEO_VARIANT_READ_MAX = 50;

const EARLIEST_FIRST = [
  ['firstSeenAt', 'ASC'],
  ['id', 'ASC'],
];

export async function recordVideoVariant({
  videoId,
  videoHash,
  videoSizeBytes,
  videoFilename,
}) {
  await VideoVariant.bulkCreate(
    [
      {
        videoId,
        videoHash,
        videoSizeBytes,
        videoFilename,
        firstSeenAt: new Date(),
      },
    ],
    {ignoreDuplicates: true, returning: false, validate: true},
  );
}

export function findVideoVariantBySize({videoId, videoSizeBytes}) {
  return VideoVariant.withScope('play').findOne({
    where: {videoId, videoSizeBytes},
    order: EARLIEST_FIRST,
  });
}

export function listVideoVariants(videoId) {
  return VideoVariant.withScope('play').findAll({
    where: {videoId},
    order: EARLIEST_FIRST,
    limit: VIDEO_VARIANT_READ_MAX,
    raw: true,
  });
}
