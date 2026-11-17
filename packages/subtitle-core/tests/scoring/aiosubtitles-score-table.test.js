import {describe, expect, it} from 'vitest';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
  ScoreTableMode,
  ScoringSignal,
} from '../../src/constants/subtitle-core-enums.js';
import {AIOSUBTITLES_SCORE_TABLE} from '../../src/scoring/aiosubtitles-score-table.js';
import {assertScoreTable} from '../../src/scoring/assert-score-table.js';
import {scoreSubtitleCandidate} from '../../src/scoring/score-candidate.js';
import {
  makeCandidate,
  makeReleaseInfo,
  makeVideo,
} from '../helpers/factories.js';

const scoreWithOurTable = ({
  candidate = makeCandidate(),
  candidateReleases = [makeReleaseInfo()],
  video = makeVideo(),
} = {}) =>
  scoreSubtitleCandidate({
    candidate,
    candidateReleases,
    video,
    scoreTable: AIOSUBTITLES_SCORE_TABLE,
  });

describe('AIOSUBTITLES_SCORE_TABLE', () => {
  it('passes the table check', () => {
    expect(() => assertScoreTable(AIOSUBTITLES_SCORE_TABLE)).not.toThrow();
  });

  it('refuses a write to a signal entry', () => {
    expect(() => {
      AIOSUBTITLES_SCORE_TABLE.signalPoints[
        ScoringSignal.HASH_MATCH
      ].matchPoints = 1;
    }).toThrow(TypeError);
    expect(
      AIOSUBTITLES_SCORE_TABLE.signalPoints[ScoringSignal.HASH_MATCH]
        .matchPoints,
    ).toBe(1000);
  });

  it('keeps the hash match and takes 40 points when only one name carries an edition', () => {
    expect(
      scoreWithOurTable({
        candidate: makeCandidate({hashMatchVideoHashes: ['h1']}),
        video: makeVideo({
          videoHash: 'h1',
          videoRelease: makeReleaseInfo({
            releaseEdition: ReleaseEdition.EXTENDED,
          }),
        }),
      }),
    ).toMatchObject({
      signalPoints: {
        [ScoringSignal.HASH_MATCH]: 1000,
        [ScoringSignal.RELEASE_EDITION]: -40,
      },
    });
  });

  it('gives no variant points to a request with video information', () => {
    const breakdown = scoreWithOurTable({
      candidate: makeCandidate({
        hashMatchVideoHashes: ['h1'],
        variantHashMatchCount: 3,
        variantReferenceFamilyCount: 3,
      }),
      candidateReleases: [
        makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.BLURAY}),
      ],
      video: makeVideo({
        videoHash: 'h1',
        videoRelease: makeReleaseInfo({
          releaseSourceFamily: ReleaseSourceFamily.WEB,
        }),
      }),
    });
    expect(breakdown).toMatchObject({
      totalScore: -40,
      signalPoints: {
        [ScoringSignal.HASH_MATCH]: 0,
        [ScoringSignal.VARIANT_HASH_MATCH]: 0,
        [ScoringSignal.VARIANT_REFERENCE_FAMILY]: 0,
      },
    });
  });

  it('gives no variant points to a request with only a video hash', () => {
    expect(
      scoreWithOurTable({
        candidate: makeCandidate({variantHashMatchCount: 2}),
        video: makeVideo({videoHash: 'h2'}),
      }),
    ).toMatchObject({signalPoints: {[ScoringSignal.VARIANT_HASH_MATCH]: 0}});
  });

  it('is an additive table with citations', () => {
    expect(AIOSUBTITLES_SCORE_TABLE).toMatchObject({
      tableMode: ScoreTableMode.ADDITIVE,
      tableCitations: expect.arrayContaining([expect.any(String)]),
    });
  });

  it('carries the spec §9.2, §9.3 and §9.5 points verbatim', () => {
    expect(AIOSUBTITLES_SCORE_TABLE.signalPoints).toEqual({
      [ScoringSignal.HASH_MATCH]: {matchPoints: 1000, conflictPoints: 0},
      [ScoringSignal.EXACT_NAME]: {matchPoints: 50, conflictPoints: 0},
      [ScoringSignal.RELEASE_GROUP]: {matchPoints: 40, conflictPoints: -10},
      [ScoringSignal.RELEASE_SOURCE_FAMILY]: {
        matchPoints: 30,
        conflictPoints: -40,
      },
      [ScoringSignal.AUDIO_SOURCE_FAMILY_HINT]: {
        matchPoints: 15,
        conflictPoints: -20,
      },
      [ScoringSignal.STREAMING_SERVICE]: {
        matchPoints: 20,
        conflictPoints: -20,
      },
      [ScoringSignal.RELEASE_EDITION]: {
        matchPoints: 30,
        conflictPoints: -40,
        strongConflictPoints: -50,
      },
      [ScoringSignal.NAME_FPS]: {matchPoints: 0, conflictPoints: -50},
      [ScoringSignal.RESOLUTION]: {matchPoints: 3, conflictPoints: 0},
      [ScoringSignal.WORD_OVERLAP]: {matchPoints: 20, conflictPoints: 0},
      [ScoringSignal.TRUSTED_UPLOADER]: {matchPoints: 10, conflictPoints: 0},
      [ScoringSignal.DOWNLOAD_COUNT]: {
        matchPoints: 2,
        conflictPoints: 0,
        maxPoints: 10,
      },
      [ScoringSignal.MACHINE_TRANSLATED]: {
        matchPoints: 0,
        conflictPoints: -20,
      },
      [ScoringSignal.HEARING_IMPAIRED]: {matchPoints: 0, conflictPoints: -5},
      [ScoringSignal.FORCED]: {matchPoints: 0, conflictPoints: -200},
      [ScoringSignal.REFERENCE_FAMILY]: {
        matchPoints: 900,
        conflictPoints: -300,
      },
      [ScoringSignal.CUE_SHAPE]: {matchPoints: 0, conflictPoints: -30},
      [ScoringSignal.INDEPENDENT_COPIES]: {
        matchPoints: 5,
        conflictPoints: 0,
        maxPoints: 15,
      },
      [ScoringSignal.VARIANT_REFERENCE_FAMILY]: {
        matchPoints: 300,
        conflictPoints: 0,
        maxPoints: 900,
      },
      [ScoringSignal.VARIANT_HASH_MATCH]: {
        matchPoints: 300,
        conflictPoints: 0,
        maxPoints: 900,
      },
    });
  });

  it('caps the download points at 10 for 1,000,000 downloads', () => {
    expect(
      scoreWithOurTable({
        candidate: makeCandidate({siteDownloadCount: 1_000_000}),
      }),
    ).toMatchObject({
      signalPoints: {[ScoringSignal.DOWNLOAD_COUNT]: expect.closeTo(10)},
    });
  });

  it('gives 2 points per log10 of downloads below the cap', () => {
    expect(
      scoreWithOurTable({candidate: makeCandidate({siteDownloadCount: 100})}),
    ).toMatchObject({
      signalPoints: {[ScoringSignal.DOWNLOAD_COUNT]: expect.closeTo(4)},
    });
  });

  it('takes 50 points for two different special editions', () => {
    expect(
      scoreWithOurTable({
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
      signalPoints: {[ScoringSignal.RELEASE_EDITION]: -50},
    });
  });

  it('takes 40 points when only one name carries an edition', () => {
    expect(
      scoreWithOurTable({
        candidateReleases: [
          makeReleaseInfo({releaseEdition: ReleaseEdition.DIRECTORS_CUT}),
        ],
        video: makeVideo({videoRelease: makeReleaseInfo()}),
      }),
    ).toMatchObject({
      signalPoints: {[ScoringSignal.RELEASE_EDITION]: -40},
    });
  });

  it('caps the independent copies at 15', () => {
    expect(
      scoreWithOurTable({candidate: makeCandidate({independentCopyCount: 4})}),
    ).toMatchObject({
      signalPoints: {[ScoringSignal.INDEPENDENT_COPIES]: 15},
    });
  });

  it('caps each variant signal at 900', () => {
    expect(
      scoreWithOurTable({
        candidate: makeCandidate({
          variantReferenceFamilyCount: 5,
          variantHashMatchCount: 2,
        }),
      }),
    ).toMatchObject({
      signalPoints: {
        [ScoringSignal.VARIANT_REFERENCE_FAMILY]: 900,
        [ScoringSignal.VARIANT_HASH_MATCH]: 600,
      },
    });
  });

  it('scores a request without video information on site signals only', () => {
    expect(
      scoreWithOurTable({
        candidate: makeCandidate({
          siteDownloadCount: 100,
          isUploaderTrusted: true,
        }),
        candidateReleases: [],
      }),
    ).toMatchObject({
      hardRejectReason: null,
      totalScore: expect.closeTo(14),
    });
  });
});
