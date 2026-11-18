import {z} from 'zod';
import {VIDEO_HASH_PATTERN} from '../../../lib/subtitle-sources/subtitle-source-contract.js';

export const VIDEO_FILENAME_LENGTH_MAX = 512;

const VIDEO_SIZE_PATTERN = /^\d+$/;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/gu;
const EXTRA_SEGMENT_SUFFIX = '.json';

const subtitleListExtrasSchema = z.object({
  videoHash: z
    .string()
    .regex(VIDEO_HASH_PATTERN)
    .transform(videoHash => videoHash.toLowerCase())
    .catch(null),
  videoSize: z
    .string()
    .regex(VIDEO_SIZE_PATTERN)
    .transform(Number)
    .pipe(z.number().int())
    .catch(null),
  filename: z
    .string()
    .transform(videoFilename =>
      videoFilename.replace(CONTROL_CHARACTER_PATTERN, ''),
    )
    .pipe(z.string().min(1))
    .transform(videoFilename =>
      [...videoFilename].slice(0, VIDEO_FILENAME_LENGTH_MAX).join(''),
    )
    .catch(null),
});

export function parseSubtitleListExtras(extraSegment) {
  const {videoHash, videoSize, filename} = subtitleListExtrasSchema.parse(
    Object.fromEntries(new URLSearchParams(extraSegment ?? '')),
  );
  return {videoHash, videoSizeBytes: videoSize, videoFilename: filename};
}

export function readRawExtraSegment(rawUrl) {
  const [rawPath] = rawUrl.split('?');
  const trimmedPath = rawPath.replace(/\/+$/, '');
  const extraSegment = trimmedPath.slice(trimmedPath.lastIndexOf('/') + 1);
  return extraSegment.endsWith(EXTRA_SEGMENT_SUFFIX)
    ? extraSegment.slice(0, -EXTRA_SEGMENT_SUFFIX.length)
    : extraSegment;
}
