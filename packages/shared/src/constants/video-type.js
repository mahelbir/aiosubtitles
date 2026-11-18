import {Enum} from 'enum-plus';

export const VideoType = Enum({
  MOVIE: {value: 'movie', label: 'Movie'},
  SERIES: {value: 'series', label: 'Series'},
});
