import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {toSearchCacheParts} from '../../src/lib/subtitle-search/subtitle-search-cache.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';

const VIDEO_HASH = '0123456789abcdef';

describe('toSearchCacheParts', () => {
  it('leaves the video hash out for a hash-blind source', () => {
    expect(
      toSearchCacheParts({
        client: createFixtureSubtitleSourceClient(),
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        videoId: 'tt0944947:1:2',
        languageCode: 'tur',
        videoHash: VIDEO_HASH,
      }),
    ).toBe('thesubtitledb:tt0944947:1:2:tur');
  });

  it('adds the video hash for a hash-sensitive source', () => {
    expect(
      toSearchCacheParts({
        client: createFixtureSubtitleSourceClient({
          isSearchHashSensitive: true,
        }),
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        videoId: 'tt0944947:1:2',
        languageCode: 'tur',
        videoHash: VIDEO_HASH,
      }),
    ).toBe(`thesubtitledb:tt0944947:1:2:tur:${VIDEO_HASH}`);
  });

  it('leaves a missing video hash out for a hash-sensitive source', () => {
    expect(
      toSearchCacheParts({
        client: createFixtureSubtitleSourceClient({
          isSearchHashSensitive: true,
        }),
        subtitleSource: SubtitleSource.THESUBTITLEDB,
        videoId: 'tt0133093',
        languageCode: 'eng',
        videoHash: null,
      }),
    ).toBe('thesubtitledb:tt0133093:eng');
  });
});
