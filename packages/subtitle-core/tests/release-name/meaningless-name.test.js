import {describe, expect, it} from 'vitest';
import {isMeaninglessName} from '../../src/release-name/meaningless-name.js';

describe('isMeaninglessName', () => {
  it.each([
    ['a UUID file', '3f2b8c1e-9a4d-4e7b-b1c2-5d6e7f8a9b0c.mkv'],
    ['a 32-hex hash', '9e107d9d372bb6826bd81d3542a419d6'],
    ['a 40-hex hash', '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'],
    [
      'a 64-hex hash',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.mp4',
    ],
    ['a generic video name', 'video.mkv'],
    ['a generic stream name', 'stream.mp4'],
    ['a query string', 'index.m3u8?token=abc'],
    ['a URL fragment', 'Show.S01E01#t=120'],
    ['a single token after the extension', 'Movie.mkv'],
    ['an empty name', ''],
    ['a full URL', 'https://cdn.example.com/files/abc123/movie.mp4'],
    ['a playlist URL', 'https://example.com/stream/master.m3u8'],
    ['a host and path', 'cdn.example.com/hls/index.m3u8'],
    ['a generic name with a copy counter', 'video (2).mkv'],
    ['another generic name with a copy counter', 'download (1).mp4'],
    [
      'a generic name with a hash',
      'video_9e107d9d372bb6826bd81d3542a419d6.mp4',
    ],
    [
      'a hash with a part counter',
      '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12.part1',
    ],
    ['a leading-slash path', '/hls/index.m3u8'],
    ['two hashes', '9e107d9d372bb682-6bd81d3542a419d6ab'],
  ])('calls %s meaningless', (nameCase, releaseName) => {
    expect(isMeaninglessName(releaseName)).toBe(true);
  });

  it.each([
    'Show.S01E01.mkv',
    'Movie.Name.2019.EXTENDED.1080p.BluRay.x264-SPARKS',
    'Dizi.Adı.S02E05.1080p.WEB-DL',
    'What.If...?.S01E01.1080p.WEB-DL',
    'Movie.#1.2010.1080p.WEB-DL',
    'video.2010.1080p.WEB-DL',
    'Movie.2010.mkv',
    'Up.2009.mkv',
    'Face/Off.1997.1080p.BluRay.x264-GRP',
    'Fahrenheit 9/11 2004',
    'https://cdn.example.com/files/Show.S01E01.1080p.WEB-DL.mkv',
  ])('calls %s meaningful', releaseName => {
    expect(isMeaninglessName(releaseName)).toBe(false);
  });
});
