import {Enum} from 'enum-plus';
import {VideoType} from '@repo/shared/constants/video-type.js';

export const AddonVideoType = Enum({
  MOVIE: {value: VideoType.MOVIE},
  SERIES: {value: VideoType.SERIES},
  ANIME: {value: 'anime'},
});
