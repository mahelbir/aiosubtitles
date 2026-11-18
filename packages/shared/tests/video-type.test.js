import {describe, expect, it} from 'vitest';
import {VideoType} from '../src/constants/video-type.js';

describe('VideoType', () => {
  it('stores the two catalog video types Stremio names', () => {
    expect(VideoType.MOVIE).toBe('movie');
    expect(VideoType.SERIES).toBe('series');
    expect(VideoType.values).toEqual(['movie', 'series']);
  });
});
