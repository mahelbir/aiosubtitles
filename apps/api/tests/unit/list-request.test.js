import {describe, expect, it} from 'vitest';
import {
  parseSubtitleListExtras,
  readRawExtraSegment,
} from '../../src/routes/(addon)/_subtitle-list/read-list-request.js';

const NO_EXTRAS = {videoHash: null, videoSizeBytes: null, videoFilename: null};

describe('parseSubtitleListExtras', () => {
  it('reads the hash, size and filename Stremio sends', () => {
    expect(
      parseSubtitleListExtras(
        'videoHash=8E245D9679D31E12&videoSize=12909756&filename=Show.S01E01.mkv',
      ),
    ).toEqual({
      videoHash: '8e245d9679d31e12',
      videoSizeBytes: 12909756,
      videoFilename: 'Show.S01E01.mkv',
    });
  });

  it('answers no extras for a request without the segment', () => {
    expect(parseSubtitleListExtras(undefined)).toEqual(NO_EXTRAS);
  });

  it('answers no extras for an empty segment', () => {
    expect(parseSubtitleListExtras('')).toEqual(NO_EXTRAS);
  });

  it('drops a size that is not a number and keeps the other fields', () => {
    expect(
      parseSubtitleListExtras(
        'videoHash=8e245d9679d31e12&videoSize=abc&filename=Show.S01E01.mkv',
      ),
    ).toEqual({
      videoHash: '8e245d9679d31e12',
      videoSizeBytes: null,
      videoFilename: 'Show.S01E01.mkv',
    });
  });

  it('drops a hash that is not hex and keeps the other fields', () => {
    expect(
      parseSubtitleListExtras(
        'videoHash=xyz&videoSize=12909756&filename=Show.S01E01.mkv',
      ),
    ).toEqual({
      videoHash: null,
      videoSizeBytes: 12909756,
      videoFilename: 'Show.S01E01.mkv',
    });
  });

  it.each([
    ['15 characters', '8e245d9679d31e1'],
    ['17 characters', '8e245d9679d31e12a'],
    ['a non-hex letter', '8e245d9679d31e1g'],
  ])('drops a hash of %s', (_, videoHash) => {
    expect(parseSubtitleListExtras(`videoHash=${videoHash}`)).toEqual(
      NO_EXTRAS,
    );
  });

  it.each([
    ['a negative size', '-1'],
    ['a fractional size', '1.5'],
    ['a size past the safe integer range', '9007199254740993'],
    ['an exponent', '1e6'],
    ['an empty size', ''],
  ])('drops %s', (_, videoSize) => {
    expect(parseSubtitleListExtras(`videoSize=${videoSize}`)).toEqual(
      NO_EXTRAS,
    );
  });

  it('keeps a zero size', () => {
    expect(parseSubtitleListExtras('videoSize=0')).toEqual({
      ...NO_EXTRAS,
      videoSizeBytes: 0,
    });
  });

  it('cuts a 600-character filename to 512 characters', () => {
    const videoFilename = 'a'.repeat(600);

    expect(parseSubtitleListExtras(`filename=${videoFilename}`)).toEqual({
      ...NO_EXTRAS,
      videoFilename: 'a'.repeat(512),
    });
  });

  it('decodes the filename once', () => {
    expect(
      parseSubtitleListExtras('filename=Show%20S01E01%2520Name.mkv'),
    ).toEqual({...NO_EXTRAS, videoFilename: 'Show S01E01%20Name.mkv'});
  });

  it('removes control characters from the filename', () => {
    expect(parseSubtitleListExtras('filename=Bad%00Name%0A.mkv')).toEqual({
      ...NO_EXTRAS,
      videoFilename: 'BadName.mkv',
    });
  });

  it('drops a filename made only of control characters', () => {
    expect(parseSubtitleListExtras('filename=%00%1F')).toEqual(NO_EXTRAS);
  });

  it('ignores keys it does not know', () => {
    expect(
      parseSubtitleListExtras('videoSize=42&unknown=value&filename=a.mkv'),
    ).toEqual({...NO_EXTRAS, videoSizeBytes: 42, videoFilename: 'a.mkv'});
  });
});

describe('readRawExtraSegment', () => {
  it('reads the last path segment still encoded and without its suffix', () => {
    expect(
      readRawExtraSegment(
        '/api/addon/abc/subtitles/movie/tt1/filename=Tom%20%26%20Jerry.mkv.json?x=1',
      ),
    ).toBe('filename=Tom%20%26%20Jerry.mkv');
  });

  it('ignores a trailing slash', () => {
    expect(
      readRawExtraSegment('/addon/abc/subtitles/movie/tt1/videoSize=1.json/'),
    ).toBe('videoSize=1');
  });
});
