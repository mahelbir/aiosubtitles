import {z} from 'zod';
import {VIDEO_ID_LENGTH_MAX} from '../../lib/stremio-row/build-subtitle-url.js';

const STREMIO_VIDEO_ID_PATTERN = /^(tt\d+(:\d+){0,2}|kitsu:\d+(:\d+)?)$/;

export const stremioVideoIdField = z
  .string()
  .max(VIDEO_ID_LENGTH_MAX)
  .regex(STREMIO_VIDEO_ID_PATTERN);
