import {describe, expect, it} from 'vitest';
import {HardRejectReason} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {findPackRejectReason} from '../../src/lib/subtitle-store/pack-binding.js';

const INNER_ENTRY_PATHS = ['S01E01.srt', 'S01E02.srt'];

describe('findPackRejectReason', () => {
  it('rejects a pack whose entries miss the episode', () => {
    expect(
      findPackRejectReason({
        innerEntryPaths: INNER_ENTRY_PATHS,
        catalogSeason: 1,
        catalogEpisode: 3,
      }),
    ).toBe(HardRejectReason.PACK_WITHOUT_EPISODE);
  });

  it('keeps a pack whose entries are not known yet', () => {
    expect(
      findPackRejectReason({
        innerEntryPaths: [],
        catalogSeason: 1,
        catalogEpisode: 3,
      }),
    ).toBeNull();
  });

  it('keeps a pack that holds the episode', () => {
    expect(
      findPackRejectReason({
        innerEntryPaths: INNER_ENTRY_PATHS,
        catalogSeason: 1,
        catalogEpisode: 2,
      }),
    ).toBeNull();
  });
});
