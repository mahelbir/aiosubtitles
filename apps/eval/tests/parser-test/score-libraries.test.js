import {describe, expect, it} from 'vitest';
import {
  buildScoreUnits,
  compareLibraries,
  computeLibraryScore,
  decideParser,
  listPairComparisons,
  mergeScopeUnits,
  resampleLibraryScore,
  summarizeFieldAccuracy,
} from '../../src/parser-test/score-libraries.js';
import {buildParsedFields} from './helpers/parsed-fields.js';

const NAME_COUNT = 20;
const TWO_FIELDS = ['releaseTitle', 'seasonNumbers'];
const RELEASE_NAMES = Array.from(
  {length: NAME_COUNT},
  (_, nameIndex) => `Score.Name.${String(nameIndex).padStart(2, '0')}`,
);
const TRUE_FIELDS = buildParsedFields({
  releaseTitle: 'right',
  seasonNumbers: [1],
});

const nameCasesFor = fieldNames =>
  RELEASE_NAMES.map(releaseName => ({
    releaseName,
    expectedFields: Object.fromEntries(
      fieldNames.map(fieldName => [fieldName, TRUE_FIELDS[fieldName]]),
    ),
  }));

const readingsWith = ({titleCorrectCount, seasonCorrectCount}) =>
  new Map(
    RELEASE_NAMES.map((releaseName, nameIndex) => [
      releaseName,
      buildParsedFields({
        releaseTitle: nameIndex < titleCorrectCount ? 'right' : 'wrong',
        seasonNumbers: nameIndex < seasonCorrectCount ? [1] : [2],
      }),
    ]),
  );

const unitsFor = ({
  fieldNames = TWO_FIELDS,
  titleCorrectCount,
  seasonCorrectCount = titleCorrectCount,
}) =>
  buildScoreUnits({
    nameCases: nameCasesFor(fieldNames),
    readingByName: readingsWith({titleCorrectCount, seasonCorrectCount}),
  });

const libraryUnits = ({own, external = own}) => ({
  own: unitsFor(own),
  guessit: unitsFor(external),
  sonarr: unitsFor(external),
  ptt: unitsFor(external),
});

describe('buildScoreUnits', () => {
  it('counts one item per asserted field and one correct per equal reading', () => {
    const scoreUnits = buildScoreUnits({
      nameCases: [
        {
          releaseName: 'One.Name',
          expectedFields: {releaseTitle: 'one name', seasonNumbers: [1, 2]},
        },
      ],
      readingByName: new Map([
        [
          'One.Name',
          buildParsedFields({releaseTitle: 'one name', seasonNumbers: [2]}),
        ],
      ]),
    });
    expect(summarizeFieldAccuracy(scoreUnits)).toMatchObject({
      releaseTitle: {correctCount: 1, itemCount: 1, accuracy: 1},
      seasonNumbers: {correctCount: 0, itemCount: 1, accuracy: 0},
      releaseGroup: {correctCount: 0, itemCount: 0, accuracy: null},
    });
  });

  it('keys each unit by the SHA-256 of its name', () => {
    const [scoreUnit] = buildScoreUnits({
      nameCases: [{releaseName: 'abc', expectedFields: {releaseYear: null}}],
      readingByName: new Map([['abc', buildParsedFields({})]]),
    });
    expect(scoreUnit.sortKey).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('skips a name the source asserts no field for', () => {
    expect(
      buildScoreUnits({
        nameCases: [{releaseName: 'Empty', expectedFields: {}}],
        readingByName: new Map([['Empty', buildParsedFields({})]]),
      }),
    ).toEqual([]);
  });
});

describe('computeLibraryScore', () => {
  it('takes the unweighted mean of the per-field accuracies', () => {
    expect(
      computeLibraryScore(
        unitsFor({titleCorrectCount: NAME_COUNT, seasonCorrectCount: 0}),
      ),
    ).toBe(0.5);
  });

  it('leaves a field without items out of the mean', () => {
    expect(
      computeLibraryScore(
        unitsFor({fieldNames: ['releaseTitle'], titleCorrectCount: 15}),
      ),
    ).toBe(0.75);
  });
});

describe('resampleLibraryScore', () => {
  it('reports the point estimate, a 95% interval and the name count', () => {
    const spread = resampleLibraryScore(unitsFor({titleCorrectCount: 10}));
    expect(spread.pointEstimate).toBe(0.5);
    expect(spread.unitCount).toBe(NAME_COUNT);
    expect(spread.lowerBound).toBeLessThan(0.5);
    expect(spread.upperBound).toBeGreaterThan(0.5);
  });
});

describe('compareLibraries', () => {
  it('declares a winner only when the paired interval excludes zero', () => {
    const strongUnits = unitsFor({titleCorrectCount: NAME_COUNT});
    const weakUnits = unitsFor({titleCorrectCount: 5});
    expect(
      compareLibraries({unitsA: strongUnits, unitsB: weakUnits}).isAWinner,
    ).toBe(true);
    expect(
      compareLibraries({unitsA: weakUnits, unitsB: strongUnits}).isAWinner,
    ).toBe(false);
    expect(
      compareLibraries({unitsA: strongUnits, unitsB: strongUnits}).isAWinner,
    ).toBe(false);
  });

  it('compares one field when a field name is given', () => {
    const titleOnlyUnits = unitsFor({
      titleCorrectCount: NAME_COUNT,
      seasonCorrectCount: 0,
    });
    const bothUnits = unitsFor({titleCorrectCount: NAME_COUNT});
    expect(
      compareLibraries({
        unitsA: bothUnits,
        unitsB: titleOnlyUnits,
        fieldName: 'seasonNumbers',
      }).isAWinner,
    ).toBe(true);
    expect(
      compareLibraries({
        unitsA: bothUnits,
        unitsB: titleOnlyUnits,
        fieldName: 'releaseTitle',
      }).isAWinner,
    ).toBe(false);
  });
});

describe('listPairComparisons', () => {
  it(
    'compares every pair on own names and on the external sets outside both lineages',
    {timeout: 30_000},
    () => {
      const scoreUnits = libraryUnits({own: {titleCorrectCount: 10}});
      const comparisons = listPairComparisons({
        guessit: scoreUnits,
        'release-parser': scoreUnits,
        'video-filename-parser': scoreUnits,
        parsium: scoreUnits,
      });
      expect(
        comparisons.map(({libraryA, libraryB, datasetNames}) => [
          libraryA,
          libraryB,
          datasetNames,
        ]),
      ).toEqual([
        ['guessit', 'release-parser', ['own']],
        ['guessit', 'release-parser', ['sonarr']],
        ['guessit', 'video-filename-parser', ['own']],
        ['guessit', 'video-filename-parser', ['ptt']],
        ['guessit', 'parsium', ['own']],
        ['guessit', 'parsium', ['sonarr', 'ptt']],
        ['release-parser', 'video-filename-parser', ['own']],
        ['release-parser', 'video-filename-parser', ['guessit']],
        ['release-parser', 'parsium', ['own']],
        ['release-parser', 'parsium', ['guessit', 'sonarr']],
        ['video-filename-parser', 'parsium', ['own']],
        ['video-filename-parser', 'parsium', ['guessit', 'ptt']],
      ]);
      expect(
        comparisons.every(
          ({isAWinner, isBWinner, difference}) =>
            !isAWinner && !isBWinner && difference.pointEstimate === 0,
        ),
      ).toBe(true);
    },
  );

  it(
    'draws a name found in two sets of one scope as one unit',
    {timeout: 30_000},
    () => {
      const scoreUnits = libraryUnits({own: {titleCorrectCount: 10}});
      const comparisons = listPairComparisons({
        guessit: scoreUnits,
        'release-parser': scoreUnits,
        'video-filename-parser': scoreUnits,
        parsium: scoreUnits,
      });
      expect(
        comparisons.find(
          ({libraryA, libraryB, datasetNames}) =>
            libraryA === 'guessit' &&
            libraryB === 'parsium' &&
            datasetNames.length === 2,
        ).difference.unitCount,
      ).toBe(NAME_COUNT);
    },
  );
});

describe('mergeScopeUnits', () => {
  it('sums the items and correct readings of one name across sets', () => {
    const [sonarrUnits, pttUnits] = [2001, 1999].map(readYear =>
      buildScoreUnits({
        nameCases: [
          {releaseName: 'Shared.Name', expectedFields: {releaseYear: 2001}},
        ],
        readingByName: new Map([
          ['Shared.Name', buildParsedFields({releaseYear: readYear})],
        ]),
      }),
    );
    const [mergedUnit, ...otherUnits] = mergeScopeUnits([
      ...sonarrUnits,
      ...pttUnits,
    ]);
    expect(otherUnits).toEqual([]);
    expect(summarizeFieldAccuracy([mergedUnit]).releaseYear).toEqual({
      correctCount: 1,
      itemCount: 2,
      accuracy: 0.5,
    });
  });

  it('drops the edition item of a name whose edition another set dropped', () => {
    const readingByName = new Map([
      ['Shared.Name', buildParsedFields({releaseEdition: 'unrated'})],
    ]);
    const multiEditionUnits = buildScoreUnits({
      nameCases: [
        {
          releaseName: 'Shared.Name',
          expectedFields: {releaseYear: null},
          hasDroppedEdition: true,
        },
      ],
      readingByName,
    });
    const singleEditionUnits = buildScoreUnits({
      nameCases: [
        {
          releaseName: 'Shared.Name',
          expectedFields: {releaseEdition: 'unrated'},
        },
      ],
      readingByName,
    });
    const mergedUnits = mergeScopeUnits([
      ...singleEditionUnits,
      ...multiEditionUnits,
    ]);
    expect(mergedUnits).toHaveLength(1);
    expect(summarizeFieldAccuracy(mergedUnits)).toMatchObject({
      releaseEdition: {correctCount: 0, itemCount: 0, accuracy: null},
      releaseYear: {correctCount: 1, itemCount: 1, accuracy: 1},
    });
  });
});

describe('decideParser', () => {
  it('carries two JS libraries that tie on own names and uses the first', () => {
    const decision = decideParser({
      scoreUnitsByLibrary: {
        guessit: libraryUnits({own: {titleCorrectCount: 10}}),
        'release-parser': libraryUnits({own: {titleCorrectCount: 16}}),
        'video-filename-parser': libraryUnits({own: {titleCorrectCount: 2}}),
        parsium: libraryUnits({own: {titleCorrectCount: 16}}),
      },
    });
    expect(decision.bestLibrary).toBe('release-parser');
    expect(decision.carriedLibraries).toEqual(['release-parser', 'parsium']);
    expect(decision.isGuessitPorted).toBe(false);
    expect(decision.decisionLine).toBe(
      'Decision: use @aiostreams/release-parser',
    );
  });

  it('ports guessit when it beats every carried library on own names and loses no shared set', () => {
    const decision = decideParser({
      scoreUnitsByLibrary: {
        guessit: libraryUnits({own: {titleCorrectCount: NAME_COUNT}}),
        'release-parser': libraryUnits({own: {titleCorrectCount: 14}}),
        'video-filename-parser': libraryUnits({own: {titleCorrectCount: 4}}),
        parsium: libraryUnits({own: {titleCorrectCount: 2}}),
      },
    });
    expect(decision.carriedLibraries).toEqual(['release-parser']);
    expect(decision.isGuessitPorted).toBe(true);
    expect(decision.decisionLine).toBe('Decision: port guessit');
    expect(decision.fieldFlags).toEqual([]);
  });

  it('keeps the JS library when guessit wins own names but loses their shared external set', () => {
    const decision = decideParser({
      scoreUnitsByLibrary: {
        guessit: libraryUnits({
          own: {titleCorrectCount: NAME_COUNT},
          external: {titleCorrectCount: 2},
        }),
        'release-parser': libraryUnits({
          own: {titleCorrectCount: 8},
          external: {titleCorrectCount: NAME_COUNT},
        }),
        'video-filename-parser': libraryUnits({own: {titleCorrectCount: 6}}),
        parsium: libraryUnits({own: {titleCorrectCount: 4}}),
      },
    });
    expect(decision.isGuessitPorted).toBe(false);
    expect(decision.decisionLine).toBe(
      'Decision: use @aiostreams/release-parser',
    );
  });

  it('flags a port that loses on season to a carried library', () => {
    const decision = decideParser({
      scoreUnitsByLibrary: {
        guessit: libraryUnits({
          own: {titleCorrectCount: NAME_COUNT, seasonCorrectCount: 10},
          external: {titleCorrectCount: NAME_COUNT},
        }),
        'release-parser': libraryUnits({own: {titleCorrectCount: 2}}),
        'video-filename-parser': libraryUnits({own: {titleCorrectCount: 2}}),
        parsium: libraryUnits({
          own: {titleCorrectCount: 4, seasonCorrectCount: NAME_COUNT},
        }),
      },
    });
    expect(decision.bestLibrary).toBe('parsium');
    expect(decision.isGuessitPorted).toBe(true);
    expect(decision.fieldFlags).toEqual([
      {library: 'parsium', fieldName: 'seasonNumbers'},
    ]);
  });
});
