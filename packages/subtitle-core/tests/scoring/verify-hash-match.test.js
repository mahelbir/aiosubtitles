import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '../../src/constants/subtitle-core-enums.js';
import {verifyHashMatch} from '../../src/scoring/verify-hash-match.js';
import {makeReleaseInfo, makeVideo} from '../helpers/factories.js';

describe('verifyHashMatch', () => {
  it('ignores a hash match whose source family conflicts with the video', () => {
    const video = makeVideo({
      videoHash: 'h1',
      videoRelease: makeReleaseInfo({
        releaseSourceFamily: ReleaseSourceFamily.WEB,
      }),
    });
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        }),
        video,
      }),
    ).toBe(false);
  });

  it('keeps a hash match whose source family agrees with the video', () => {
    const video = makeVideo({
      videoHash: 'h1',
      videoRelease: makeReleaseInfo({
        releaseSourceFamily: ReleaseSourceFamily.WEB,
      }),
    });
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          releaseSourceFamily: ReleaseSourceFamily.WEB,
        }),
        video,
      }),
    ).toBe(true);
  });

  it('ignores a hash match whose edition conflicts with the video', () => {
    const video = makeVideo({
      videoHash: 'h1',
      videoRelease: makeReleaseInfo({
        releaseEdition: ReleaseEdition.EXTENDED,
      }),
    });
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          releaseEdition: ReleaseEdition.DIRECTORS_CUT,
        }),
        video,
      }),
    ).toBe(false);
  });

  it('ignores a hash match whose season conflicts with the catalog', () => {
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          seasonNumbers: [2],
          episodeNumbers: [4],
        }),
        video: makeVideo({
          videoHash: 'h1',
          catalogSeason: 1,
          catalogEpisode: 4,
        }),
      }),
    ).toBe(false);
  });

  it('ignores a hash match whose episode conflicts with the catalog', () => {
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          seasonNumbers: [1],
          episodeNumbers: [5],
        }),
        video: makeVideo({
          videoHash: 'h1',
          catalogSeason: 1,
          catalogEpisode: 4,
        }),
      }),
    ).toBe(false);
  });

  it('checks only season and episode when the video name is meaningless', () => {
    const video = makeVideo({
      videoHash: 'h1',
      catalogSeason: 1,
      catalogEpisode: 4,
      videoRelease: makeReleaseInfo({
        releaseSourceFamily: ReleaseSourceFamily.WEB,
        isMeaningless: true,
      }),
    });
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          seasonNumbers: [1],
          episodeNumbers: [4],
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        }),
        video,
      }),
    ).toBe(true);
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          seasonNumbers: [1],
          episodeNumbers: [5],
        }),
        video,
      }),
    ).toBe(false);
  });

  it('keeps a hash match when the video has no name', () => {
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo({
          releaseSourceFamily: ReleaseSourceFamily.BLURAY,
        }),
        video: makeVideo({videoHash: 'h1'}),
      }),
    ).toBe(true);
  });

  it('keeps a hash match when only one name carries an edition', () => {
    expect(
      verifyHashMatch({
        candidateRelease: makeReleaseInfo(),
        video: makeVideo({
          videoHash: 'h1',
          videoRelease: makeReleaseInfo({
            releaseEdition: ReleaseEdition.EXTENDED,
          }),
        }),
      }),
    ).toBe(true);
  });

  it('agrees with the hard reject on a site-flagged pack', () => {
    const candidateRelease = makeReleaseInfo({
      seasonNumbers: [1],
      episodeNumbers: [1],
    });
    const video = makeVideo({
      videoHash: 'h1',
      catalogSeason: 1,
      catalogEpisode: 4,
    });
    expect(verifyHashMatch({candidateRelease, video, isSitePack: true})).toBe(
      true,
    );
    expect(verifyHashMatch({candidateRelease, video})).toBe(false);
  });

  it('keeps a hash match for a candidate without a release name', () => {
    expect(
      verifyHashMatch({
        candidateRelease: null,
        video: makeVideo({
          videoHash: 'h1',
          catalogSeason: 1,
          catalogEpisode: 4,
          videoRelease: makeReleaseInfo({
            releaseSourceFamily: ReleaseSourceFamily.WEB,
          }),
        }),
      }),
    ).toBe(true);
  });
});
