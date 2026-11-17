import {describe, expect, it} from 'vitest';
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

  it('does not penalise a paid subtitle', () => {
    const rel = makeReleaseInfo();
    const video = makeVideo();
    const free = scoreSubtitleCandidate({
      candidate: makeCandidate({isQuotaCostly: false}),
      candidateReleases: [rel],
      video,
      scoreTable: AIOSUBTITLES_SCORE_TABLE,
    });
    const paid = scoreSubtitleCandidate({
      candidate: makeCandidate({isQuotaCostly: true}),
      candidateReleases: [rel],
      video,
      scoreTable: AIOSUBTITLES_SCORE_TABLE,
    });
    expect(paid.totalScore).toBe(free.totalScore);
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
