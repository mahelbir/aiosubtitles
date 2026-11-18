import {keyBy} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
  ScoreTableMode,
  ScoringSignal,
} from '../../src/constants/subtitle-core-enums.js';
import {assertScoreTable} from '../../src/scoring/assert-score-table.js';
import {READY_MADE_SCORE_TABLES} from '../../src/scoring/ready-made-score-tables.js';
import {
  compareScoreBreakdowns,
  scoreSubtitleCandidate,
} from '../../src/scoring/score-candidate.js';
import {
  makeCandidate,
  makeNamedRelease,
  makeReleaseInfo,
  makeVideo,
} from '../helpers/factories.js';

const TABLE_NAMES = [
  'orion',
  'lyra',
  'vega',
  'subliminal',
  'bazarr',
  'strict-priority',
];
const tablesByName = keyBy(READY_MADE_SCORE_TABLES, ({tableName}) => tableName);

const MOVIE_VIDEO = makeVideo({
  videoRelease: makeReleaseInfo({
    releaseGroup: 'NTb',
    releaseSourceFamily: ReleaseSourceFamily.WEB,
  }),
});
const EPISODE_VIDEO = makeVideo({
  catalogSeason: 1,
  catalogEpisode: 1,
  videoRelease: makeReleaseInfo({
    releaseGroup: 'NTb',
    releaseSourceFamily: ReleaseSourceFamily.WEB,
    seasonNumbers: [1],
    episodeNumbers: [1],
  }),
});

const scoreWith = (
  tableName,
  {
    candidate = makeCandidate(),
    candidateReleases = [makeReleaseInfo()],
    video = MOVIE_VIDEO,
  } = {},
) =>
  scoreSubtitleCandidate({
    candidate,
    candidateReleases,
    video,
    scoreTable: tablesByName[tableName],
  });

const listPoints = ({signalPoints, episodeSignalPoints = {}}) =>
  [
    ...Object.values(signalPoints),
    ...Object.values(episodeSignalPoints),
  ].flatMap(tablePoints => Object.values(tablePoints));

describe('READY_MADE_SCORE_TABLES', () => {
  it('lists the metrics §6 tables in order', () => {
    expect(READY_MADE_SCORE_TABLES.map(({tableName}) => tableName)).toEqual(
      TABLE_NAMES,
    );
  });

  it.each(TABLE_NAMES)('%s passes the table check', tableName => {
    expect(() => assertScoreTable(tablesByName[tableName])).not.toThrow();
  });

  it.each(TABLE_NAMES)('%s cites at least one REF line', tableName => {
    expect(tablesByName[tableName].tableCitations).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.(js|py):\d+/)]),
    );
  });

  it.each(TABLE_NAMES)('%s refuses a write to a signal entry', tableName => {
    const [firstEntry] = Object.values(tablesByName[tableName].signalPoints);
    expect(() => {
      firstEntry.matchPoints = 1;
    }).toThrow(TypeError);
  });

  it.each(TABLE_NAMES)(
    '%s keys its subtitle source points by subtitle sources',
    tableName => {
      expect(
        Object.keys(tablesByName[tableName].subtitleSourcePoints ?? {}).every(
          subtitleSource => SubtitleSource.values.includes(subtitleSource),
        ),
      ).toBe(true);
    },
  );

  it.each(TABLE_NAMES)('%s leaves out every fps row', tableName => {
    const {signalPoints, episodeSignalPoints, priorityOrder, tierOrder} =
      tablesByName[tableName];
    expect(signalPoints).not.toHaveProperty(ScoringSignal.NAME_FPS);
    expect(episodeSignalPoints ?? {}).not.toHaveProperty(
      ScoringSignal.NAME_FPS,
    );
    expect([...(priorityOrder ?? []), ...(tierOrder ?? [])]).not.toContain(
      ScoringSignal.NAME_FPS,
    );
  });

  describe('orion', () => {
    it('orion/src/release.js:68 gives 100 for the same source and takes 100 for another', () => {
      expect(
        tablesByName.orion.signalPoints[ScoringSignal.RELEASE_SOURCE_FAMILY],
      ).toEqual({matchPoints: 100, conflictPoints: -100});
      expect(
        scoreWith('orion', {
          candidateReleases: [
            makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.BLURAY}),
          ],
        }),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.RELEASE_SOURCE_FAMILY]: -100},
      });
    });

    it('orion/src/release.js:70-71 gives 60 for the same edition, takes 30 for one-sided and 60 for two', () => {
      expect(
        tablesByName.orion.signalPoints[ScoringSignal.RELEASE_EDITION],
      ).toEqual({
        matchPoints: 60,
        conflictPoints: -30,
        strongConflictPoints: -60,
      });
    });

    it('orion/src/addon.js:764 puts forced rows below free ones and paid rows below both, before the score', () => {
      expect(tablesByName.orion).toMatchObject({
        tableMode: ScoreTableMode.TIERED,
        tierOrder: [ScoringSignal.QUOTA_COSTLY, ScoringSignal.FORCED],
      });
      const paidSameGroup = scoreWith('orion', {
        candidate: makeCandidate({isQuotaCostly: true}),
        candidateReleases: [makeReleaseInfo({releaseGroup: 'NTb'})],
      });
      const forcedSameGroup = scoreWith('orion', {
        candidate: makeCandidate({isForced: true}),
        candidateReleases: [makeReleaseInfo({releaseGroup: 'NTb'})],
      });
      const freeOtherSource = scoreWith('orion', {
        candidateReleases: [
          makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.BLURAY}),
        ],
      });
      expect(
        [paidSameGroup, forcedSameGroup, freeOtherSource].sort(
          compareScoreBreakdowns,
        ),
      ).toEqual([freeOtherSource, forcedSameGroup, paidSameGroup]);
    });
  });

  describe('lyra', () => {
    it('Stremio-Lyra/src/utils/filenameMatcher.js:57 gives a group 50 on a movie and 30 on an episode', () => {
      const groupRelease = makeReleaseInfo({releaseGroup: 'NTb'});
      expect(
        scoreWith('lyra', {candidateReleases: [groupRelease]}),
      ).toMatchObject({signalPoints: {[ScoringSignal.RELEASE_GROUP]: 50}});
      expect(
        scoreWith('lyra', {
          candidateReleases: [
            makeReleaseInfo({
              releaseGroup: 'NTb',
              seasonNumbers: [1],
              episodeNumbers: [1],
            }),
          ],
          video: EPISODE_VIDEO,
        }),
      ).toMatchObject({signalPoints: {[ScoringSignal.RELEASE_GROUP]: 30}});
    });

    it('compares exact scores, since its 10-point threshold sits on rows we hard-reject', () => {
      expect(tablesByName.lyra.tableMode).toBe(ScoreTableMode.ADDITIVE);
      expect(tablesByName.lyra).not.toHaveProperty('scoreBucketSize');
      expect(tablesByName.lyra).not.toHaveProperty('tierOrder');
    });
  });

  describe('vega', () => {
    it('StremioVega/src/handlers/subtitles.js:2461-2471 gives an edition 1500, takes 300 one-sided and 1000 for two', () => {
      expect(
        tablesByName.vega.signalPoints[ScoringSignal.RELEASE_EDITION],
      ).toEqual({
        matchPoints: 1500,
        conflictPoints: -300,
        strongConflictPoints: -1000,
      });
      expect(
        scoreWith('vega', {
          candidateReleases: [
            makeReleaseInfo({releaseEdition: ReleaseEdition.DIRECTORS_CUT}),
          ],
          video: makeVideo({
            videoRelease: makeReleaseInfo({
              releaseEdition: ReleaseEdition.EXTENDED,
            }),
          }),
        }),
      ).toMatchObject({signalPoints: {[ScoringSignal.RELEASE_EDITION]: -1000}});
    });

    it('StremioVega/src/handlers/subtitles.js:2717-2725 ranks OpenSubtitles v3 above SubDL', () => {
      expect(tablesByName.vega.subtitleSourcePoints).toMatchObject({
        [SubtitleSource.OPENSUBTITLES_V3]: 3,
        [SubtitleSource.SUBDL]: 2,
      });
    });

    it('StremioVega/src/handlers/subtitles.js:2792 keeps a hash match above any name score', () => {
      expect(tablesByName.vega).toMatchObject({
        tableMode: ScoreTableMode.TIERED,
        tierOrder: [ScoringSignal.HASH_MATCH],
      });
      const videoName = 'Movie.2020.EXTENDED.1080p.NF.WEB-DL-NTb';
      const videoRelease = makeNamedRelease(videoName, {
        releaseGroup: 'NTb',
        releaseSourceFamily: ReleaseSourceFamily.WEB,
        streamingService: 'NF',
        releaseEdition: ReleaseEdition.EXTENDED,
        resolutionHeight: 1080,
      });
      const video = makeVideo({videoHash: 'h1', videoRelease});
      const hashWithConflicts = scoreWith('vega', {
        candidate: makeCandidate({hashMatchVideoHashes: ['h1']}),
        candidateReleases: [
          makeNamedRelease('Movie.2020.1080p.AMZN.WEB-DL-FLUX', {
            releaseGroup: 'FLUX',
            releaseSourceFamily: ReleaseSourceFamily.WEB,
            streamingService: 'AMZN',
            resolutionHeight: 1080,
          }),
        ],
        video,
      });
      const exactNameWithoutHash = scoreWith('vega', {
        candidateReleases: [videoRelease],
        video,
      });
      expect(hashWithConflicts).toMatchObject({
        signalPoints: {
          [ScoringSignal.HASH_MATCH]: 200_000,
          [ScoringSignal.RELEASE_GROUP]: -100,
          [ScoringSignal.STREAMING_SERVICE]: -200,
          [ScoringSignal.RELEASE_EDITION]: -300,
        },
      });
      expect(exactNameWithoutHash).toMatchObject({
        signalPoints: {
          [ScoringSignal.HASH_MATCH]: 0,
          [ScoringSignal.EXACT_NAME]: 10_000,
        },
      });
      expect(
        [exactNameWithoutHash, hashWithConflicts].sort(compareScoreBreakdowns),
      ).toEqual([hashWithConflicts, exactNameWithoutHash]);
    });
  });

  describe('subliminal', () => {
    it('subliminal/src/subliminal/score.py:64,81 gives a hash 323 on a movie and 971 on an episode', () => {
      const hashCandidate = makeCandidate({hashMatchVideoHashes: ['h1']});
      expect(
        scoreWith('subliminal', {
          candidate: hashCandidate,
          video: makeVideo({videoHash: 'h1'}),
        }),
      ).toMatchObject({signalPoints: {[ScoringSignal.HASH_MATCH]: 323}});
      expect(
        scoreWith('subliminal', {
          candidate: hashCandidate,
          candidateReleases: [
            makeReleaseInfo({seasonNumbers: [1], episodeNumbers: [1]}),
          ],
          video: makeVideo({
            catalogSeason: 1,
            catalogEpisode: 1,
            videoHash: 'h1',
          }),
        }),
      ).toMatchObject({signalPoints: {[ScoringSignal.HASH_MATCH]: 971}});
    });

    it('subliminal/src/subliminal/score.py:73,88 gives a source 4', () => {
      expect(
        tablesByName.subliminal.signalPoints[
          ScoringSignal.RELEASE_SOURCE_FAMILY
        ],
      ).toEqual({matchPoints: 4, conflictPoints: 0});
    });
  });

  describe('bazarr', () => {
    it('bazarr/custom_libs/subliminal_patch/score.py:38,50 gives a source 25 on an episode and 30 on a movie', () => {
      expect(
        scoreWith('bazarr', {
          candidateReleases: [
            makeReleaseInfo({releaseSourceFamily: ReleaseSourceFamily.WEB}),
          ],
        }),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.RELEASE_SOURCE_FAMILY]: 30},
      });
      expect(
        scoreWith('bazarr', {
          candidateReleases: [
            makeReleaseInfo({
              releaseSourceFamily: ReleaseSourceFamily.WEB,
              seasonNumbers: [1],
              episodeNumbers: [1],
            }),
          ],
          video: EPISODE_VIDEO,
        }),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.RELEASE_SOURCE_FAMILY]: 25},
      });
    });

    it('bazarr/custom_libs/subliminal_patch/subtitle.py:517-530 takes 30 for two different editions, like one-sided', () => {
      expect(
        scoreWith('bazarr', {
          candidateReleases: [
            makeReleaseInfo({releaseEdition: ReleaseEdition.DIRECTORS_CUT}),
          ],
          video: makeVideo({
            videoRelease: makeReleaseInfo({
              releaseEdition: ReleaseEdition.EXTENDED,
            }),
          }),
        }),
      ).toMatchObject({signalPoints: {[ScoringSignal.RELEASE_EDITION]: -30}});
    });

    it('bazarr/custom_libs/subliminal_patch/subtitle.py:517-530 takes 1 for two different services', () => {
      expect(
        scoreWith('bazarr', {
          candidateReleases: [makeReleaseInfo({streamingService: 'AMZN'})],
          video: makeVideo({
            videoRelease: makeReleaseInfo({streamingService: 'NF'}),
          }),
        }),
      ).toMatchObject({
        signalPoints: {[ScoringSignal.STREAMING_SERVICE]: -1},
      });
    });

    it('cites the both-absent shift of edition and service', () => {
      expect(tablesByName.bazarr.tableCitations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /subtitle\.py:517-530 .*both-absent counts as match, shifted by −30\/−1 to keep Bazarr's order/,
          ),
        ]),
      );
    });

    it('bazarr/custom_libs/subliminal_patch/subtitle.py:517-530 ranks same and neither edition equal, one side 30 lower', () => {
      const noEdition = scoreWith('bazarr');
      const sameEdition = scoreWith('bazarr', {
        candidateReleases: [
          makeReleaseInfo({releaseEdition: ReleaseEdition.EXTENDED}),
        ],
        video: makeVideo({
          videoRelease: makeReleaseInfo({
            releaseEdition: ReleaseEdition.EXTENDED,
          }),
        }),
      });
      const oneSided = scoreWith('bazarr', {
        candidateReleases: [
          makeReleaseInfo({releaseEdition: ReleaseEdition.EXTENDED}),
        ],
      });
      expect(sameEdition.totalScore).toBe(noEdition.totalScore);
      expect(noEdition.totalScore - oneSided.totalScore).toBe(30);
    });
  });

  describe('strict-priority', () => {
    it('uses no negative points', () => {
      expect(
        listPoints(tablesByName['strict-priority']).every(
          tablePoints => tablePoints >= 0,
        ),
      ).toBe(true);
    });

    it('orders subliminal/src/subliminal/score.py:63-77 rows by descending weight', () => {
      expect(tablesByName['strict-priority']).toMatchObject({
        tableMode: ScoreTableMode.STRICT_PRIORITY,
        priorityOrder: [
          ScoringSignal.HASH_MATCH,
          ScoringSignal.RELEASE_GROUP,
          ScoringSignal.STREAMING_SERVICE,
          ScoringSignal.RELEASE_SOURCE_FAMILY,
          ScoringSignal.RESOLUTION,
        ],
      });
    });

    it('names its metrics §6 derivation', () => {
      expect(tablesByName['strict-priority'].tableCitations).toEqual(
        expect.arrayContaining([expect.stringContaining('metrics.md §6')]),
      );
    });
  });
});
