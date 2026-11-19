import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ConfidenceWord,
  HardRejectReason,
  ReleaseEdition,
  ReleaseSourceFamily,
  ScoreTableMode,
  ScoringSignal,
} from '../../src/constants/subtitle-core-enums.js';
import {AIOSUBTITLES_SCORE_TABLE} from '../../src/scoring/aiosubtitles-score-table.js';
import {
  compareScoreBreakdowns,
  scoreSubtitleCandidate,
} from '../../src/scoring/score-candidate.js';
import {makeFileFacts} from '../helpers/deduplication-fixtures.js';
import {
  makeCandidate,
  makeReleaseInfo,
  makeScoreTable,
  makeVideo,
} from '../helpers/factories.js';

const FIXTURE_POINTS = {
  [ScoringSignal.RELEASE_GROUP]: {matchPoints: 7, conflictPoints: -3},
  [ScoringSignal.RELEASE_EDITION]: {
    matchPoints: 1,
    conflictPoints: -2,
    strongConflictPoints: -9,
  },
  [ScoringSignal.DOWNLOAD_COUNT]: {
    matchPoints: 2,
    conflictPoints: 0,
    maxPoints: 5,
  },
  [ScoringSignal.INDEPENDENT_COPIES]: {matchPoints: 1, conflictPoints: 0},
};
const ADDITIVE_TABLE = makeScoreTable({signalPoints: FIXTURE_POINTS});
const STRICT_TABLE = makeScoreTable({
  tableMode: ScoreTableMode.STRICT_PRIORITY,
  signalPoints: {
    [ScoringSignal.RELEASE_GROUP]: {matchPoints: 1, conflictPoints: -1},
    [ScoringSignal.DOWNLOAD_COUNT]: {matchPoints: 1, conflictPoints: 0},
  },
  priorityOrder: [ScoringSignal.RELEASE_GROUP, ScoringSignal.DOWNLOAD_COUNT],
});

const NAMED_VIDEO = makeVideo({
  videoRelease: makeReleaseInfo({releaseGroup: 'NTb'}),
});

const score = ({
  candidate = makeCandidate(),
  candidateReleases = [makeReleaseInfo()],
  video = NAMED_VIDEO,
  scoreTable = ADDITIVE_TABLE,
} = {}) =>
  scoreSubtitleCandidate({candidate, candidateReleases, video, scoreTable});

describe('scoreSubtitleCandidate', () => {
  describe('additive tables', () => {
    it('sums points times magnitude', () => {
      expect(
        score({
          candidate: makeCandidate({siteDownloadCount: 100}),
          candidateReleases: [makeReleaseInfo({releaseGroup: 'NTb'})],
        }),
      ).toMatchObject({
        totalScore: expect.closeTo(11),
        hardRejectReason: null,
        priorityVector: null,
        signalPoints: {
          [ScoringSignal.RELEASE_GROUP]: 7,
          [ScoringSignal.DOWNLOAD_COUNT]: expect.closeTo(4),
        },
      });
    });

    it('caps a signal at its maximum points', () => {
      expect(
        score({candidate: makeCandidate({siteDownloadCount: 1_000_000})}),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.DOWNLOAD_COUNT]: 5},
      });
    });

    it('takes the conflict points on a conflict', () => {
      expect(
        score({candidateReleases: [makeReleaseInfo({releaseGroup: 'FLUX'})]}),
      ).toMatchObject({
        totalScore: -3,
        signalPoints: {[ScoringSignal.RELEASE_GROUP]: -3},
      });
    });

    it('takes the strong conflict points on a strong conflict', () => {
      expect(
        score({
          candidateReleases: [
            makeReleaseInfo({releaseEdition: ReleaseEdition.DIRECTORS_CUT}),
          ],
          video: makeVideo({
            videoRelease: makeReleaseInfo({
              releaseEdition: ReleaseEdition.EXTENDED,
            }),
          }),
        }),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.RELEASE_EDITION]: -9},
      });
    });

    it('falls back to the conflict points without strong conflict points', () => {
      expect(
        score({
          candidateReleases: [
            makeReleaseInfo({releaseEdition: ReleaseEdition.DIRECTORS_CUT}),
          ],
          video: makeVideo({
            videoRelease: makeReleaseInfo({
              releaseEdition: ReleaseEdition.EXTENDED,
            }),
          }),
          scoreTable: makeScoreTable({
            signalPoints: {
              [ScoringSignal.RELEASE_EDITION]: {
                matchPoints: 1,
                conflictPoints: -2,
              },
            },
          }),
        }),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.RELEASE_EDITION]: -2},
      });
    });

    it('scores nothing for a signal the table lacks', () => {
      expect(
        score({
          candidate: makeCandidate({isHearingImpaired: true, isForced: true}),
          candidateReleases: [makeReleaseInfo({releaseGroup: 'NTb'})],
        }),
      ).toMatchObject({totalScore: 7});
    });

    it('scores zero downloads as zero points', () => {
      expect(
        score({candidate: makeCandidate({siteDownloadCount: 0})}),
      ).toMatchObject({totalScore: 0});
    });

    it('scores a row without a copy count as zero points', () => {
      expect(score()).toMatchObject({totalScore: 0});
    });
  });

  describe('release names', () => {
    const worseRelease = makeReleaseInfo({releaseGroup: 'FLUX'});
    const betterRelease = makeReleaseInfo({releaseGroup: 'NTb'});
    const candidate = makeCandidate({siteDownloadCount: 100});

    it('two release names take the better subtotal', () => {
      expect(
        score({candidate, candidateReleases: [worseRelease, betterRelease]}),
      ).toMatchObject({bestReleaseIndex: 1, totalScore: expect.closeTo(11)});
      expect(
        score({candidate, candidateReleases: [betterRelease, worseRelease]}),
      ).toMatchObject({bestReleaseIndex: 0, totalScore: expect.closeTo(11)});
    });

    it('never takes the subtotal of a release name that a hard reject rules out', () => {
      expect(
        score({
          candidateReleases: [
            makeReleaseInfo({
              seasonNumbers: [1],
              episodeNumbers: [5],
              releaseGroup: 'NTb',
            }),
            makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [4]}),
          ],
          video: makeVideo({
            catalogSeason: 1,
            catalogEpisode: 4,
            videoRelease: makeReleaseInfo({releaseGroup: 'NTb'}),
          }),
        }),
      ).toMatchObject({
        hardRejectReason: null,
        bestReleaseIndex: 1,
        totalScore: 0,
      });
    });

    it('scores a match by the anime episode the same as a release without numbers', () => {
      const video = makeVideo({
        catalogSeason: 1,
        catalogEpisode: 17,
        kitsuEpisode: 5,
      });
      const animeMatch = score({
        candidateReleases: [
          makeReleaseInfo({seasonNumbers: [2], episodeNumbers: [5]}),
        ],
        video,
      });
      const numberless = score({candidateReleases: [makeReleaseInfo()], video});
      expect(animeMatch.hardRejectReason).toBeNull();
      expect(animeMatch.totalScore).toBe(numberless.totalScore);
    });
  });

  describe('hard rejects', () => {
    it('reports the hard reject reason', () => {
      expect(
        score({
          candidate: makeCandidate({
            fileFacts: makeFileFacts({isFileValid: false}),
          }),
        }),
      ).toMatchObject({hardRejectReason: HardRejectReason.INVALID_FILE});
    });

    it.each(
      [AIOSUBTITLES_SCORE_TABLE].map(scoreTable => [
        scoreTable.tableName,
        scoreTable,
      ]),
    )(
      'scores a localized title like the video title under %s',
      (_tableName, scoreTable) => {
        const video = makeVideo({
          videoRelease: makeReleaseInfo({
            releaseTitle: 'Scarlet Buds',
            releaseYear: 2023,
          }),
        });
        const scoreTitle = releaseTitle =>
          scoreSubtitleCandidate({
            candidate: makeCandidate(),
            candidateReleases: [
              makeReleaseInfo({releaseTitle, releaseYear: 2023}),
            ],
            video,
            scoreTable,
          });
        const localizedBreakdown = scoreTitle('Kızıl Goncalar');
        expect(localizedBreakdown.hardRejectReason).toBeNull();
        expect(localizedBreakdown).toEqual(scoreTitle('Scarlet Buds'));
      },
    );
  });

  describe('hash match and confidence', () => {
    const hashVideo = makeVideo({
      videoHash: 'h1',
      videoRelease: makeReleaseInfo({
        releaseSourceFamily: ReleaseSourceFamily.WEB,
      }),
    });
    const hashCandidate = makeCandidate({hashMatchVideoHashes: ['h1']});

    it('scores a verified hash match and says Exact', () => {
      expect(
        score({
          candidate: hashCandidate,
          candidateReleases: [
            makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.WEB}),
          ],
          video: hashVideo,
          scoreTable: AIOSUBTITLES_SCORE_TABLE,
        }),
      ).toMatchObject({
        confidenceWord: ConfidenceWord.EXACT,
        signalPoints: {[ScoringSignal.HASH_MATCH]: 1000},
      });
    });

    it('credits the hash match to the release name that verifies it', () => {
      expect(
        score({
          candidate: hashCandidate,
          candidateReleases: [
            makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.BLURAY}),
            makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.WEB}),
          ],
          video: hashVideo,
          scoreTable: AIOSUBTITLES_SCORE_TABLE,
        }),
      ).toMatchObject({
        bestReleaseIndex: 1,
        confidenceWord: ConfidenceWord.EXACT,
        signalPoints: {[ScoringSignal.HASH_MATCH]: 1000},
      });
    });

    it('scores the hash match of a candidate without release names', () => {
      expect(
        score({
          candidate: hashCandidate,
          candidateReleases: [],
          video: hashVideo,
          scoreTable: AIOSUBTITLES_SCORE_TABLE,
        }),
      ).toMatchObject({
        bestReleaseIndex: null,
        confidenceWord: ConfidenceWord.EXACT,
        totalScore: 1000,
      });
    });

    it('neither scores nor trusts a hash match that fails verification', () => {
      const breakdown = score({
        candidate: hashCandidate,
        candidateReleases: [
          makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.BLURAY}),
        ],
        video: hashVideo,
        scoreTable: AIOSUBTITLES_SCORE_TABLE,
      });
      expect(breakdown).toMatchObject({confidenceWord: null});
      expect(breakdown.signalPoints[ScoringSignal.HASH_MATCH] ?? 0).toBe(0);
    });
  });

  describe('strict-priority tables', () => {
    const groupFirst = makeCandidate({siteDownloadCount: 10});
    const downloadsFirst = makeCandidate({siteDownloadCount: 1_000_000});
    const groupRelease = makeReleaseInfo({releaseGroup: 'NTb'});

    it('puts zero in the vector for a priority signal without points', () => {
      expect(
        score({
          candidate: groupFirst,
          candidateReleases: [groupRelease],
          scoreTable: makeScoreTable({
            tableMode: ScoreTableMode.STRICT_PRIORITY,
            signalPoints: {
              [ScoringSignal.RELEASE_GROUP]: {
                matchPoints: 1,
                conflictPoints: -1,
              },
            },
            priorityOrder: [
              ScoringSignal.HASH_MATCH,
              ScoringSignal.RELEASE_GROUP,
            ],
          }),
        }),
      ).toMatchObject({priorityVector: [0, 1]});
    });

    it('picks the release name with the better vector', () => {
      expect(
        score({
          candidate: groupFirst,
          candidateReleases: [
            makeReleaseInfo({releaseGroup: 'FLUX'}),
            groupRelease,
          ],
          scoreTable: STRICT_TABLE,
        }),
      ).toMatchObject({
        bestReleaseIndex: 1,
        priorityVector: [1, expect.closeTo(1)],
      });
    });

    it('returns the priority vector in priority order', () => {
      expect(
        score({
          candidate: groupFirst,
          candidateReleases: [groupRelease],
          scoreTable: STRICT_TABLE,
        }),
      ).toMatchObject({
        priorityVector: [expect.closeTo(1), expect.closeTo(1)],
      });
      expect(
        score({candidate: downloadsFirst, scoreTable: STRICT_TABLE}),
      ).toMatchObject({
        priorityVector: [expect.closeTo(0), expect.closeTo(6)],
      });
    });

    it('strict-priority table ranks by vector', () => {
      const groupBreakdown = score({
        candidate: groupFirst,
        candidateReleases: [groupRelease],
        scoreTable: STRICT_TABLE,
      });
      const downloadsBreakdown = score({
        candidate: downloadsFirst,
        scoreTable: STRICT_TABLE,
      });
      expect(groupBreakdown).toMatchObject({priorityVector: expect.any(Array)});
      expect(
        [downloadsBreakdown, groupBreakdown].sort(compareScoreBreakdowns),
      ).toEqual([groupBreakdown, downloadsBreakdown]);
    });
  });

  describe('paid subtitles', () => {
    const scorePaidAndFree = scoreTable =>
      [false, true].map(isQuotaCostly =>
        scoreSubtitleCandidate({
          candidate: makeCandidate({isQuotaCostly}),
          candidateReleases: [makeReleaseInfo()],
          video: makeVideo(),
          scoreTable,
        }),
      );

    it('scores the quota signal through a table that weighs it', () => {
      const [free, paid] = scorePaidAndFree(
        makeScoreTable({
          signalPoints: {
            [ScoringSignal.QUOTA_COSTLY]: {matchPoints: 0, conflictPoints: -7},
          },
        }),
      );
      expect(paid).toMatchObject({
        totalScore: -7,
        signalPoints: {[ScoringSignal.QUOTA_COSTLY]: -7},
      });
      expect(free.totalScore).toBe(0);
    });

    it('does not penalise a paid subtitle', () => {
      const [free, paid] = scorePaidAndFree(AIOSUBTITLES_SCORE_TABLE);
      expect(paid.signalPoints).toMatchObject({
        [ScoringSignal.QUOTA_COSTLY]: 0,
      });
      expect(paid.totalScore).toBe(free.totalScore);
    });
  });

  describe('episode signal points', () => {
    const KIND_TABLE = makeScoreTable({
      signalPoints: {
        [ScoringSignal.RELEASE_GROUP]: {matchPoints: 50, conflictPoints: 0},
        [ScoringSignal.RELEASE_EDITION]: {matchPoints: 30, conflictPoints: 0},
      },
      episodeSignalPoints: {
        [ScoringSignal.RELEASE_GROUP]: {matchPoints: 30, conflictPoints: 0},
      },
    });
    const groupRelease = makeReleaseInfo({releaseGroup: 'NTb'});

    it('takes the episode points for an episode video', () => {
      expect(
        score({
          candidateReleases: [groupRelease],
          video: makeVideo({
            catalogSeason: 1,
            catalogEpisode: 2,
            videoRelease: makeReleaseInfo({releaseGroup: 'NTb'}),
          }),
          scoreTable: KIND_TABLE,
        }),
      ).toMatchObject({
        totalScore: 30,
        signalPoints: {
          [ScoringSignal.RELEASE_GROUP]: 30,
          [ScoringSignal.RELEASE_EDITION]: 0,
        },
      });
    });

    it('takes the base points for a movie video', () => {
      expect(
        score({candidateReleases: [groupRelease], scoreTable: KIND_TABLE}),
      ).toMatchObject({
        totalScore: 50,
        signalPoints: {[ScoringSignal.RELEASE_GROUP]: 50},
      });
    });
  });

  describe('tiered tables', () => {
    const TIERED_TABLE = makeScoreTable({
      tableMode: ScoreTableMode.TIERED,
      signalPoints: {
        [ScoringSignal.QUOTA_COSTLY]: {matchPoints: 0, conflictPoints: -1},
        [ScoringSignal.RELEASE_GROUP]: {matchPoints: 7, conflictPoints: -3},
      },
      tierOrder: [ScoringSignal.QUOTA_COSTLY],
    });
    const groupRelease = makeReleaseInfo({releaseGroup: 'NTb'});

    it('keeps tier signals out of the total score', () => {
      expect(
        score({
          candidate: makeCandidate({isQuotaCostly: true}),
          candidateReleases: [groupRelease],
          scoreTable: TIERED_TABLE,
        }),
      ).toMatchObject({
        totalScore: 7,
        priorityVector: [-1],
        tierScore: 7,
        signalPoints: {
          [ScoringSignal.QUOTA_COSTLY]: -1,
          [ScoringSignal.RELEASE_GROUP]: 7,
        },
      });
    });

    it('puts a free subtitle above a paid one with a higher score', () => {
      const paidMatch = score({
        candidate: makeCandidate({isQuotaCostly: true}),
        candidateReleases: [groupRelease],
        scoreTable: TIERED_TABLE,
      });
      const freeConflict = score({
        candidateReleases: [makeReleaseInfo({releaseGroup: 'FLUX'})],
        scoreTable: TIERED_TABLE,
      });
      expect([paidMatch, freeConflict].sort(compareScoreBreakdowns)).toEqual([
        freeConflict,
        paidMatch,
      ]);
    });

    it('orders by total score inside one tier', () => {
      const groupMatch = score({
        candidateReleases: [groupRelease],
        scoreTable: TIERED_TABLE,
      });
      const groupConflict = score({
        candidateReleases: [makeReleaseInfo({releaseGroup: 'FLUX'})],
        scoreTable: TIERED_TABLE,
      });
      expect([groupConflict, groupMatch].sort(compareScoreBreakdowns)).toEqual([
        groupMatch,
        groupConflict,
      ]);
    });

    it('compares the total score by bucket when the table sets a bucket size', () => {
      const bucketTable = {...TIERED_TABLE, scoreBucketSize: 10};
      const groupMatch = score({
        candidateReleases: [groupRelease],
        scoreTable: bucketTable,
      });
      const noGroup = score({scoreTable: bucketTable});
      expect(groupMatch).toMatchObject({totalScore: 7, tierScore: 0});
      expect(noGroup).toMatchObject({totalScore: 0, tierScore: 0});
      expect(compareScoreBreakdowns(groupMatch, noGroup)).toBe(0);
    });

    it('floors a negative total into the bucket below zero', () => {
      expect(
        score({
          candidateReleases: [makeReleaseInfo({releaseGroup: 'FLUX'})],
          scoreTable: {...TIERED_TABLE, scoreBucketSize: 10},
        }),
      ).toMatchObject({totalScore: -3, tierScore: -1});
    });

    it('leaves the tier score empty for additive and strict-priority tables', () => {
      expect(score()).toMatchObject({tierScore: null});
      expect(score({scoreTable: STRICT_TABLE})).toMatchObject({
        tierScore: null,
      });
    });
  });

  describe('subtitle source points', () => {
    const SUBTITLE_SOURCE_TABLE = makeScoreTable({
      signalPoints: FIXTURE_POINTS,
      subtitleSourcePoints: {[SubtitleSource.SUBDL]: 4},
    });

    it('adds the points of the candidate source once', () => {
      expect(
        score({
          candidate: makeCandidate({subtitleSource: SubtitleSource.SUBDL}),
          candidateReleases: [makeReleaseInfo(), makeReleaseInfo()],
          scoreTable: SUBTITLE_SOURCE_TABLE,
        }),
      ).toMatchObject({totalScore: 4, subtitleSourcePoints: 4});
    });

    it('adds nothing for a source the table does not name', () => {
      expect(
        score({
          candidate: makeCandidate({subtitleSource: SubtitleSource.YIFY}),
          scoreTable: SUBTITLE_SOURCE_TABLE,
        }),
      ).toMatchObject({totalScore: 0, subtitleSourcePoints: 0});
    });

    it('adds source points to a request without video information', () => {
      expect(
        score({
          candidate: makeCandidate({subtitleSource: SubtitleSource.SUBDL}),
          candidateReleases: [],
          scoreTable: SUBTITLE_SOURCE_TABLE,
        }),
      ).toMatchObject({totalScore: 4});
    });

    it('keeps source points out of the priority vector', () => {
      expect(
        score({
          candidate: makeCandidate({subtitleSource: SubtitleSource.SUBDL}),
          scoreTable: {
            ...SUBTITLE_SOURCE_TABLE,
            tableMode: ScoreTableMode.STRICT_PRIORITY,
            priorityOrder: [ScoringSignal.RELEASE_GROUP],
          },
        }),
      ).toMatchObject({totalScore: 4, priorityVector: [0]});
    });
  });
});

describe('compareScoreBreakdowns', () => {
  const makeBreakdown = overrides => ({
    totalScore: 0,
    hardRejectReason: null,
    signalPoints: {},
    bestReleaseIndex: 0,
    confidenceWord: null,
    priorityVector: null,
    ...overrides,
  });

  it('puts the higher total score first', () => {
    const higher = makeBreakdown({totalScore: 50});
    const lower = makeBreakdown({totalScore: 10});
    expect([lower, higher].sort(compareScoreBreakdowns)).toEqual([
      higher,
      lower,
    ]);
  });

  it('puts the lexicographically higher priority vector first', () => {
    const higher = makeBreakdown({priorityVector: [1, 0, 0]});
    const lower = makeBreakdown({priorityVector: [0, 9, 9]});
    expect([lower, higher].sort(compareScoreBreakdowns)).toEqual([
      higher,
      lower,
    ]);
  });

  it('compares the tier score after an equal priority vector', () => {
    const higher = makeBreakdown({priorityVector: [0], tierScore: 3});
    const lower = makeBreakdown({priorityVector: [0], tierScore: 1});
    expect([lower, higher].sort(compareScoreBreakdowns)).toEqual([
      higher,
      lower,
    ]);
  });

  it('lets the priority vector outrank the tier score', () => {
    const higher = makeBreakdown({priorityVector: [0], tierScore: 1});
    const lower = makeBreakdown({priorityVector: [-1], tierScore: 99});
    expect([lower, higher].sort(compareScoreBreakdowns)).toEqual([
      higher,
      lower,
    ]);
  });

  it('ties equal breakdowns', () => {
    expect(
      compareScoreBreakdowns(
        makeBreakdown({totalScore: 5}),
        makeBreakdown({totalScore: 5}),
      ),
    ).toBe(0);
    expect(
      compareScoreBreakdowns(
        makeBreakdown({priorityVector: [1, 2]}),
        makeBreakdown({priorityVector: [1, 2]}),
      ),
    ).toBe(0);
  });
});
