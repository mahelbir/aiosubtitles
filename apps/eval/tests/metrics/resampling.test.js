import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {
  RESAMPLE_DRAW_COUNT,
  RESAMPLE_SEED,
  comparePaired,
  resampleStatistic,
} from '../../src/metrics/resampling.js';
import {referenceMulberry32} from './helpers/reference-mulberry32.js';

const buildVideo = (videoCode, metricValue) => ({videoCode, metricValue});

const sortByVideoCode = video => video.videoCode;

const sortByNameDigest = unit =>
  createHash('sha256').update(unit.name, 'utf8').digest('hex');

const computeMacroMean = videos =>
  videos.reduce((total, video) => total + video.metricValue, 0) / videos.length;

const drawReferenceResamples = ({sortedUnits, seed, drawCount}) => {
  const random = referenceMulberry32(seed);
  return Array.from({length: drawCount}, () =>
    Array.from(
      {length: sortedUnits.length},
      () => sortedUnits[Math.floor(random() * sortedUnits.length)],
    ),
  );
};

const recordResamples = (toLabel, measure = () => 0) => {
  const recordedResamples = [];
  const statistic = resample => {
    recordedResamples.push(resample.map(toLabel));
    return measure(resample);
  };
  return {recordedResamples, statistic};
};

const EIGHT_VIDEOS = [
  buildVideo('V41', 0.4),
  buildVideo('V06', 0.9),
  buildVideo('E17', 0.1),
  buildVideo('V15', 0.7),
  buildVideo('V01', 0.3),
  buildVideo('V25', 1),
  buildVideo('E16', 0.2),
  buildVideo('V08', 0.6),
];

describe('resampleStatistic exact enumeration', () => {
  const threeVideos = [
    buildVideo('V15', 0.9),
    buildVideo('V06', 1),
    buildVideo('V08', 0.2),
  ];

  it('bounds n = 3 by the single-worst and single-best video triples', () => {
    expect(
      resampleStatistic({
        units: threeVideos,
        sortKey: sortByVideoCode,
        statistic: computeMacroMean,
        seed: RESAMPLE_SEED,
        drawCount: RESAMPLE_DRAW_COUNT,
      }),
    ).toEqual({
      pointEstimate: expect.closeTo(0.7, 12),
      lowerBound: expect.closeTo(0.2, 12),
      upperBound: expect.closeTo(1, 12),
      unitCount: 3,
    });
  });

  it.each([1, 2])(
    'ignores the draw count and seed %i when n^n is small',
    seed => {
      expect(
        resampleStatistic({
          units: [buildVideo('A', 0), buildVideo('B', 3), buildVideo('C', 9)],
          sortKey: sortByVideoCode,
          statistic: computeMacroMean,
          seed,
          drawCount: 1,
        }),
      ).toEqual({pointEstimate: 4, lowerBound: 0, upperBound: 9, unitCount: 3});
    },
  );

  it('passes each of the 27 ordered resamples of n = 3', () => {
    const {recordedResamples, statistic} = recordResamples(
      video => video.videoCode,
    );
    resampleStatistic({
      units: threeVideos,
      sortKey: sortByVideoCode,
      statistic,
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    const codes = ['V06', 'V08', 'V15'];
    const expectedResamples = codes.flatMap(first =>
      codes.flatMap(second => codes.map(third => [first, second, third])),
    );
    const distinctResamples = new Set(
      recordedResamples.map(resample => resample.join(',')),
    );
    expect(recordedResamples.every(resample => resample.length === 3)).toBe(
      true,
    );
    expect([...distinctResamples].sort()).toEqual(
      expectedResamples.map(resample => resample.join(',')).sort(),
    );
  });

  it('weights n = 4 so the single-worst quadruple stays below 2.5%', () => {
    expect(
      resampleStatistic({
        units: [
          buildVideo('A', 0),
          buildVideo('B', 1),
          buildVideo('C', 1),
          buildVideo('D', 1),
        ],
        sortKey: sortByVideoCode,
        statistic: computeMacroMean,
        seed: RESAMPLE_SEED,
        drawCount: 1,
      }),
    ).toEqual({
      pointEstimate: 0.75,
      lowerBound: 0.25,
      upperBound: 1,
      unitCount: 4,
    });
  });
});

describe('resampleStatistic random draws', () => {
  it('draws from the units sorted by their sort key', () => {
    const {recordedResamples, statistic} = recordResamples(
      video => video.videoCode,
    );
    resampleStatistic({
      units: EIGHT_VIDEOS,
      sortKey: sortByVideoCode,
      statistic,
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    const [expectedResample] = drawReferenceResamples({
      sortedUnits: EIGHT_VIDEOS.toSorted((first, second) =>
        first.videoCode.localeCompare(second.videoCode),
      ),
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    expect(recordedResamples).toContainEqual(
      expectedResample.map(video => video.videoCode),
    );
  });

  it('takes the percentile bounds over the drawn resamples', () => {
    const drawCount = 3;
    const sortedVideos = EIGHT_VIDEOS.toSorted((first, second) =>
      first.videoCode.localeCompare(second.videoCode),
    );
    const drawnMeans = drawReferenceResamples({
      sortedUnits: sortedVideos,
      seed: RESAMPLE_SEED,
      drawCount,
    }).map(computeMacroMean);
    expect(
      resampleStatistic({
        units: EIGHT_VIDEOS,
        sortKey: sortByVideoCode,
        statistic: computeMacroMean,
        seed: RESAMPLE_SEED,
        drawCount,
      }),
    ).toEqual({
      pointEstimate: expect.closeTo(computeMacroMean(EIGHT_VIDEOS), 12),
      lowerBound: expect.closeTo(Math.min(...drawnMeans), 12),
      upperBound: expect.closeTo(Math.max(...drawnMeans), 12),
      unitCount: 8,
    });
  });

  it('lets the name caller draw from names sorted by SHA-256', () => {
    const names = [
      'Movie.2020.1080p.WEB-DL',
      'Show.S01E02.HDTV',
      'Film.2019.BluRay',
      'Series.S02E01.WEBRip',
      'Another.Movie.2018.DVDRip',
      'Doc.2021.AMZN.WEB-DL',
      'Kids.S03E04.NF.WEB',
      'Old.Film.1999.Remux',
    ].map(name => ({name}));
    const {recordedResamples, statistic} = recordResamples(unit => unit.name);
    resampleStatistic({
      units: names,
      sortKey: sortByNameDigest,
      statistic,
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    const [expectedResample] = drawReferenceResamples({
      sortedUnits: names.toSorted((first, second) =>
        sortByNameDigest(first).localeCompare(sortByNameDigest(second)),
      ),
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    expect(recordedResamples).toContainEqual(
      expectedResample.map(unit => unit.name),
    );
  });
});

describe('comparePaired', () => {
  const compareVideos = ({valuesA, valuesB, isLowerBetter = false}) =>
    comparePaired({
      unitsA: ['V06', 'V08', 'V15'].map((videoCode, index) =>
        buildVideo(videoCode, valuesA[index]),
      ),
      unitsB: ['V06', 'V08', 'V15'].map((videoCode, index) =>
        buildVideo(videoCode, valuesB[index]),
      ),
      sortKey: sortByVideoCode,
      statistic: computeMacroMean,
      seed: RESAMPLE_SEED,
      drawCount: RESAMPLE_DRAW_COUNT,
      isLowerBetter,
    });

  it('names A the winner when A is better on every video', () => {
    expect(
      compareVideos({valuesA: [1, 1, 1], valuesB: [0.5, 0.8, 0.9]}),
    ).toEqual({
      difference: expect.objectContaining({
        pointEstimate: expect.closeTo(0.8 / 3, 12),
        lowerBound: expect.closeTo(0.1, 12),
        unitCount: 3,
      }),
      isAWinner: true,
    });
  });

  it('calls a tie when A is worse on one video', () => {
    expect(
      compareVideos({valuesA: [1, 1, 0.5], valuesB: [0.5, 0.8, 0.9]}),
    ).toEqual(
      expect.objectContaining({
        difference: expect.objectContaining({
          lowerBound: expect.closeTo(-0.4, 12),
        }),
        isAWinner: false,
      }),
    );
  });

  it('calls a tie when the lower bound is exactly zero', () => {
    expect(
      compareVideos({valuesA: [1, 1, 0.9], valuesB: [0.5, 0.8, 0.9]}),
    ).toEqual(
      expect.objectContaining({
        difference: expect.objectContaining({lowerBound: 0}),
        isAWinner: false,
      }),
    );
  });

  it('names A the winner on a lower-is-better metric when A is lower everywhere', () => {
    expect(
      compareVideos({
        valuesA: [0, 0, 0],
        valuesB: [1, 0.5, 1],
        isLowerBetter: true,
      }),
    ).toEqual(expect.objectContaining({isAWinner: true}));
  });

  it('calls a tie on a lower-is-better metric when A is higher on one video', () => {
    expect(
      compareVideos({
        valuesA: [0, 1, 0],
        valuesB: [0.5, 0.5, 0.5],
        isLowerBetter: true,
      }),
    ).toEqual(expect.objectContaining({isAWinner: false}));
  });

  it('resamples B minus A on a lower-is-better metric', () => {
    expect(
      compareVideos({
        valuesA: [0, 0, 0],
        valuesB: [1, 0.5, 1],
        isLowerBetter: true,
      }).difference,
    ).toEqual(
      expect.objectContaining({
        pointEstimate: expect.closeTo(2.5 / 3, 12),
        lowerBound: 0.5,
        upperBound: 1,
      }),
    );
  });

  it('calls a tie when the lower bound is float noise above zero', () => {
    expect(
      compareVideos({
        valuesA: [0.1 + 0.2, 0.1 + 0.2, 0.1 + 0.2],
        valuesB: [0.3, 0.3, 0.3],
      }),
    ).toEqual(expect.objectContaining({isAWinner: false}));
  });

  it.each([
    ['A', [null, null, null], [0.5, 0.5, 0.5]],
    ['B', [0.5, 0.5, 0.5], [null, null, null]],
  ])(
    'rejects a null statistic on side %s before subtracting',
    (_side, valuesA, valuesB) => {
      expect(() =>
        comparePaired({
          unitsA: ['V06', 'V08', 'V15'].map((videoCode, index) =>
            buildVideo(videoCode, valuesA[index]),
          ),
          unitsB: ['V06', 'V08', 'V15'].map((videoCode, index) =>
            buildVideo(videoCode, valuesB[index]),
          ),
          sortKey: sortByVideoCode,
          statistic: videos =>
            videos[0].metricValue === null ? null : computeMacroMean(videos),
          seed: RESAMPLE_SEED,
          drawCount: RESAMPLE_DRAW_COUNT,
          isLowerBetter: false,
        }),
      ).toThrow(RangeError);
    },
  );

  it('rejects units that are not paired by sort key', () => {
    const pairUp = codesB =>
      comparePaired({
        unitsA: ['V06', 'V08'].map(videoCode => buildVideo(videoCode, 1)),
        unitsB: codesB.map(videoCode => buildVideo(videoCode, 0)),
        sortKey: sortByVideoCode,
        statistic: computeMacroMean,
        seed: RESAMPLE_SEED,
        drawCount: 10,
        isLowerBetter: false,
      });
    expect(() => pairUp(['V06', 'V15'])).toThrow(RangeError);
    expect(() => pairUp(['V06'])).toThrow(RangeError);
  });
});

describe('resampleStatistic sort order', () => {
  it('orders units by plain string comparison, not by locale', () => {
    const units = ['b', 'A', 'c', 'B', 'a', 'C', 'd', 'D'].map(videoCode =>
      buildVideo(videoCode, 0),
    );
    const {recordedResamples, statistic} = recordResamples(
      video => video.videoCode,
    );
    resampleStatistic({
      units,
      sortKey: sortByVideoCode,
      statistic,
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    const [expectedResample] = drawReferenceResamples({
      sortedUnits: ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'].map(videoCode =>
        buildVideo(videoCode, 0),
      ),
      seed: RESAMPLE_SEED,
      drawCount: 1,
    });
    expect(recordedResamples).toContainEqual(
      expectedResample.map(video => video.videoCode),
    );
  });
});

describe('resampling constants', () => {
  it('fixes the seed and draw count of metrics §3.1 and §7.4', () => {
    expect(RESAMPLE_SEED).toBe(20261117);
    expect(RESAMPLE_DRAW_COUNT).toBe(10_000);
  });
});

describe('resampleStatistic statistic values', () => {
  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a statistic value of %s',
    statisticValue => {
      expect(() =>
        resampleStatistic({
          units: [buildVideo('V06', 1), buildVideo('V08', 0)],
          sortKey: sortByVideoCode,
          statistic: resample =>
            resample[0].videoCode === 'V08' ? statisticValue : 1,
          seed: RESAMPLE_SEED,
          drawCount: RESAMPLE_DRAW_COUNT,
        }),
      ).toThrow(RangeError);
    },
  );
});
