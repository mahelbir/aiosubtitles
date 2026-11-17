import {describe, expect, it} from 'vitest';
import {HardRejectReason} from '../../src/constants/subtitle-core-enums.js';
import {findHardRejectReason} from '../../src/scoring/find-hard-reject.js';
import {makeFileFacts} from '../helpers/deduplication-fixtures.js';
import {
  makeCandidate,
  makeReleaseInfo,
  makeVideo,
} from '../helpers/factories.js';

describe('findHardRejectReason', () => {
  it('keeps a season pack for an episode it contains', () => {
    const pack = makeReleaseInfo({
      seasonNumbers: [1],
      episodeNumbers: [],
      isSeasonPack: true,
    });
    const range = makeReleaseInfo({
      seasonNumbers: [1],
      episodeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      isSeasonPack: true,
    });
    const video = makeVideo({catalogSeason: 1, catalogEpisode: 4});
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [pack],
        video,
      }),
    ).toBeNull();
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [range],
        video,
      }),
    ).toBeNull();
  });

  it('rejects a pack whose episode range excludes the episode', () => {
    const range = makeReleaseInfo({
      seasonNumbers: [1],
      episodeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      isSeasonPack: true,
    });
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [range],
        video: makeVideo({catalogSeason: 1, catalogEpisode: 11}),
      }),
    ).toBe(HardRejectReason.WRONG_EPISODE);
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [
          makeReleaseInfo({seasonNumbers: [2], isSeasonPack: true}),
        ],
        video: makeVideo({catalogSeason: 1, catalogEpisode: 4}),
      }),
    ).toBe(HardRejectReason.WRONG_SEASON);
  });

  it('keeps a matching episode', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [
          makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [4]}),
        ],
        video: makeVideo({catalogSeason: 1, catalogEpisode: 4}),
      }),
    ).toBeNull();
  });

  it('rejects a single episode other than the catalog episode', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [
          makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [5]}),
        ],
        video: makeVideo({catalogSeason: 1, catalogEpisode: 4}),
      }),
    ).toBe(HardRejectReason.WRONG_EPISODE);
  });

  it('rejects a single episode from another season', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [
          makeReleaseInfo({seasonNumbers: [2], episodeNumbers: [4]}),
        ],
        video: makeVideo({catalogSeason: 1, catalogEpisode: 4}),
      }),
    ).toBe(HardRejectReason.WRONG_SEASON);
  });

  it('rejects a CD part', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({partNumber: 1})],
        video: makeVideo(),
      }),
    ).toBe(HardRejectReason.CD_PART);
  });

  it('rejects an invalid downloaded file', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate({
          fileFacts: makeFileFacts({isFileValid: false}),
        }),
        candidateReleases: [makeReleaseInfo()],
        video: makeVideo(),
      }),
    ).toBe(HardRejectReason.INVALID_FILE);
  });

  it('keeps a valid downloaded file', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate({fileFacts: makeFileFacts()}),
        candidateReleases: [makeReleaseInfo()],
        video: makeVideo(),
      }),
    ).toBeNull();
  });

  it('rejects a different title when both names carry one', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({releaseTitle: 'Another Movie'})],
        video: makeVideo({
          videoRelease: makeReleaseInfo({releaseTitle: 'The Movie'}),
        }),
      }),
    ).toBe(HardRejectReason.WRONG_TITLE);
  });

  it('keeps a candidate whose title the video name lacks', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({releaseTitle: 'Another Movie'})],
        video: makeVideo({videoRelease: makeReleaseInfo()}),
      }),
    ).toBeNull();
  });

  it('keeps the same title', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({releaseTitle: 'The Movie'})],
        video: makeVideo({
          videoRelease: makeReleaseInfo({releaseTitle: 'The Movie'}),
        }),
      }),
    ).toBeNull();
  });

  it('rejects a different year when both names carry one', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({releaseYear: 1999})],
        video: makeVideo({videoRelease: makeReleaseInfo({releaseYear: 2020})}),
      }),
    ).toBe(HardRejectReason.WRONG_YEAR);
  });

  it('keeps a candidate when no rule applies', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo()],
        video: makeVideo(),
      }),
    ).toBeNull();
  });

  it('judges the season by the video name when the catalog has none', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [
          makeReleaseInfo({seasonNumbers: [2], episodeNumbers: [4]}),
        ],
        video: makeVideo({
          videoRelease: makeReleaseInfo({
            seasonNumbers: [1],
            episodeNumbers: [4],
          }),
        }),
      }),
    ).toBe(HardRejectReason.WRONG_SEASON);
  });

  it('never rejects the episode of a name without a season, since anime names carry absolute episode numbers', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({episodeNumbers: [13]})],
        video: makeVideo({catalogSeason: 2, catalogEpisode: 1}),
      }),
    ).toBeNull();
  });

  describe('title spelling variants', () => {
    const findTitleRejectReason = (candidateTitle, videoTitle) =>
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [makeReleaseInfo({releaseTitle: candidateTitle})],
        video: makeVideo({
          videoRelease: makeReleaseInfo({releaseTitle: videoTitle}),
        }),
      });

    it.each([
      ['Pokemon', 'Pokémon'],
      ['Agents of SHIELD', 'Agents of S.H.I.E.L.D'],
      ['Law & Order', 'Law and Order'],
      ["Grey's Anatomy", 'Greys Anatomy'],
      ['Marvel’s Agents of S.H.I.E.L.D.', 'Marvels Agents of SHIELD'],
      ['Marvelʼs Agents of SHIELD', 'Marvels Agents of SHIELD'],
    ])('keeps %s for a video titled %s', (candidateTitle, videoTitle) => {
      expect(findTitleRejectReason(candidateTitle, videoTitle)).toBeNull();
    });

    it('still rejects a clearly different title', () => {
      expect(findTitleRejectReason('Pokemon Origins', 'Digimon')).toBe(
        HardRejectReason.WRONG_TITLE,
      );
    });
  });

  it('skips title and year when the video name is meaningless', () => {
    expect(
      findHardRejectReason({
        candidate: makeCandidate(),
        candidateReleases: [
          makeReleaseInfo({releaseTitle: 'Another Movie', releaseYear: 1999}),
        ],
        video: makeVideo({
          videoRelease: makeReleaseInfo({
            releaseTitle: 'The Movie',
            releaseYear: 2020,
            isMeaningless: true,
          }),
        }),
      }),
    ).toBeNull();
  });

  describe('several release names', () => {
    const video = makeVideo({catalogSeason: 1, catalogEpisode: 4});
    const fittingRelease = makeReleaseInfo({
      seasonNumbers: [1],
      episodeNumbers: [4],
    });

    it('keeps a candidate when one release name fits', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate(),
          candidateReleases: [
            makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [5]}),
            fittingRelease,
          ],
          video,
        }),
      ).toBeNull();
    });

    it('rejects with the first reason when every release name fails', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate(),
          candidateReleases: [
            makeReleaseInfo({seasonNumbers: [2], episodeNumbers: [4]}),
            makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [5]}),
          ],
          video,
        }),
      ).toBe(HardRejectReason.WRONG_SEASON);
    });

    it('rejects an invalid file whatever its release names say', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate({
            fileFacts: makeFileFacts({isFileValid: false}),
          }),
          candidateReleases: [fittingRelease],
          video,
        }),
      ).toBe(HardRejectReason.INVALID_FILE);
    });
  });

  describe('site pack flag', () => {
    const video = makeVideo({catalogSeason: 1, catalogEpisode: 4});

    it('keeps a site pack whose name carries a single other episode', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate({isSitePack: true}),
          candidateReleases: [
            makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [1]}),
          ],
          video,
        }),
      ).toBeNull();
    });

    it('rejects a site pack from another season', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate({isSitePack: true}),
          candidateReleases: [
            makeReleaseInfo({seasonNumbers: [2], episodeNumbers: [1]}),
          ],
          video,
        }),
      ).toBe(HardRejectReason.WRONG_SEASON);
    });

    it('rejects a site pack whose episode range excludes the episode', () => {
      expect(
        findHardRejectReason({
          candidate: makeCandidate({isSitePack: true}),
          candidateReleases: [
            makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [5, 6, 7]}),
          ],
          video,
        }),
      ).toBe(HardRejectReason.WRONG_EPISODE);
    });
  });
});
