import {describe, expect, it} from 'vitest';
import {
  RELEASE_FILE_EXTENSIONS,
  measureNameOverlap,
  tokenizeReleaseName,
} from '../../src/release-name/name-tokens.js';

describe('tokenizeReleaseName', () => {
  it('lower-cases, drops the file extension and splits on every non letter or digit', () => {
    expect(
      tokenizeReleaseName('Show.S01E01.1080p.WEB-DL.DDP5.1-NTb.mkv'),
    ).toEqual(['show', 's01e01', '1080p', 'web', 'dl', 'ddp5', '1', 'ntb']);
  });

  it('drops a subtitle file extension', () => {
    expect(tokenizeReleaseName('Movie.2020.BluRay.srt')).toEqual([
      'movie',
      '2020',
      'bluray',
    ]);
  });

  it('knows the subtitle and video container extensions', () => {
    expect(RELEASE_FILE_EXTENSIONS).toEqual([
      'srt',
      'ass',
      'ssa',
      'vtt',
      'sub',
      'smi',
      'txt',
      'mkv',
      'mp4',
      'avi',
      'm4v',
      'webm',
      'mov',
    ]);
  });

  it.each(RELEASE_FILE_EXTENSIONS)('drops a trailing .%s', fileExtension => {
    expect(
      tokenizeReleaseName(`Movie.2020.${fileExtension.toUpperCase()}`),
    ).toEqual(['movie', '2020']);
  });

  it.each(['ts', 'x264', '2020', 'wmv', 'mpg', 'm2ts'])(
    'keeps a trailing .%s that is no known extension',
    lastPart => {
      expect(tokenizeReleaseName(`Movie.1080p.${lastPart}`)).toEqual([
        'movie',
        '1080p',
        lastPart,
      ]);
    },
  );

  it('keeps the last part of a name that has no file extension', () => {
    expect(tokenizeReleaseName('Show.S01E01.1080p.WEB-DL-NTb')).toEqual([
      'show',
      's01e01',
      '1080p',
      'web',
      'dl',
      'ntb',
    ]);
    expect(tokenizeReleaseName('Show.S01E01.720p.HDTV-KILLERS')).toEqual([
      'show',
      's01e01',
      '720p',
      'hdtv',
      'killers',
    ]);
  });

  it('drops empty tokens', () => {
    expect(tokenizeReleaseName('..Show -- Name__[2020]..')).toEqual([
      'show',
      'name',
      '2020',
    ]);
    expect(tokenizeReleaseName('')).toEqual([]);
  });

  it('composes the name to NFC before splitting', () => {
    const decomposedName = 'Café.Society'.normalize('NFD');
    expect(tokenizeReleaseName(decomposedName)).toEqual([
      'café'.normalize('NFC'),
      'society',
    ]);
  });

  it('lower-cases without the Turkish locale so I stays an ASCII i', () => {
    expect(tokenizeReleaseName('ILIK.Show')).toEqual(['ilik', 'show']);
  });

  it('drops the combining dot that lower-casing İ leaves behind', () => {
    expect(tokenizeReleaseName('İSTANBUL')).toEqual(['istanbul']);
  });

  it('keeps Turkish letters inside a token', () => {
    expect(tokenizeReleaseName('Çılgın.Şov.Öğle')).toEqual([
      'çılgın',
      'şov',
      'öğle',
    ]);
  });
});

describe('measureNameOverlap', () => {
  it('gives 1 for the same tokens', () => {
    expect(measureNameOverlap(['show', '1080p'], ['show', '1080p'])).toBe(1);
  });

  it('gives 0 for disjoint tokens', () => {
    expect(measureNameOverlap(['show', '1080p'], ['movie', '720p'])).toBe(0);
  });

  it('divides the shared tokens by all distinct tokens', () => {
    expect(measureNameOverlap(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(0.5);
  });

  it('counts a repeated token once', () => {
    expect(measureNameOverlap(['a', 'a', 'b'], ['a'])).toBe(0.5);
  });

  it('gives 0 for two empty token lists', () => {
    expect(measureNameOverlap([], [])).toBe(0);
  });

  it('is symmetric', () => {
    const tokensA = ['show', 's01e01', '1080p', 'web', 'dl', 'ntb'];
    const tokensB = ['show', 's01e01', '720p', 'hdtv', 'killers'];
    expect(measureNameOverlap(tokensA, tokensB)).toBe(
      measureNameOverlap(tokensB, tokensA),
    );
    expect(measureNameOverlap(tokensA, tokensB)).toBeCloseTo(2 / 9);
  });
});
