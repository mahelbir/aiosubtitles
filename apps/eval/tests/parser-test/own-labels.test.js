import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {ReleaseSourceFamily} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {PARSED_FIELD_NAMES} from '../../src/parser-test/normalize-fields.js';
import {
  buildPendingItems,
  findOwnItems,
  ParserLabelError,
  parseParserLabels,
  resolveOwnTruth,
  selectAgreedSample,
} from '../../src/parser-test/own-labels.js';
import {referenceMulberry32} from '../metrics/helpers/reference-mulberry32.js';
import {buildParsedFields} from './helpers/parsed-fields.js';

const SAMPLE_SEED = 20261117;
const LIBRARIES = [
  'guessit',
  'release-parser',
  'video-filename-parser',
  'parsium',
];

const readingsFor = readingsByName =>
  new Map(
    LIBRARIES.map((library, libraryIndex) => [
      library,
      new Map(
        Object.entries(readingsByName).map(([releaseName, readings]) => [
          releaseName,
          buildParsedFields(readings[libraryIndex] ?? readings[0]),
        ]),
      ),
    ]),
  );

const AGREED_FIELDS = {releaseTitle: 'film', releaseYear: 2020};

const OWN_ITEMS = findOwnItems({
  releaseNames: ['Film.2020', 'Show.S01E02'],
  readingsByLibrary: readingsFor({
    'Film.2020': [AGREED_FIELDS],
    'Show.S01E02': [
      {releaseTitle: 'show', seasonNumbers: [1], episodeNumbers: [2]},
      {releaseTitle: 'show', seasonNumbers: [1], episodeNumbers: [2]},
      {releaseTitle: 'show s01e02'},
      {releaseTitle: 'show', seasonNumbers: [1], episodeNumbers: [2]},
    ],
  }),
});

const sha256 = text => createHash('sha256').update(text).digest('hex');

const referenceSample = agreedItems => {
  const orderedItems = agreedItems.toSorted(
    (first, second) =>
      sha256(first.releaseName).localeCompare(sha256(second.releaseName)) ||
      PARSED_FIELD_NAMES.indexOf(first.fieldName) -
        PARSED_FIELD_NAMES.indexOf(second.fieldName),
  );
  const sampleSize = Math.ceil(orderedItems.length / 10);
  const random = referenceMulberry32(SAMPLE_SEED);
  for (let position = 0; position < sampleSize; position += 1) {
    const swapPosition =
      position + Math.floor(random() * (orderedItems.length - position));
    [orderedItems[position], orderedItems[swapPosition]] = [
      orderedItems[swapPosition],
      orderedItems[position],
    ];
  }
  return orderedItems.slice(0, sampleSize);
};

const manyAgreedItems = () =>
  findOwnItems({
    releaseNames: Array.from(
      {length: 13},
      (_, nameIndex) => `Name.${nameIndex}`,
    ),
    readingsByLibrary: readingsFor(
      Object.fromEntries(
        Array.from({length: 13}, (_, nameIndex) => [
          `Name.${nameIndex}`,
          [{releaseTitle: `name ${nameIndex}`}],
        ]),
      ),
    ),
  });

describe('findOwnItems', () => {
  it('lists all eight fields of every own name', () => {
    expect(OWN_ITEMS).toHaveLength(16);
  });

  it('accepts a field the four libraries read the same after normalisation', () => {
    expect(
      OWN_ITEMS.find(
        ownItem =>
          ownItem.releaseName === 'Film.2020' &&
          ownItem.fieldName === 'releaseYear',
      ),
    ).toEqual({
      releaseName: 'Film.2020',
      fieldName: 'releaseYear',
      isAgreed: true,
      agreedValue: 2020,
    });
  });

  it('marks a field the libraries read differently as disagreed', () => {
    expect(
      OWN_ITEMS.filter(ownItem => !ownItem.isAgreed).map(
        ({releaseName, fieldName}) => `${releaseName}:${fieldName}`,
      ),
    ).toEqual([
      'Show.S01E02:seasonNumbers',
      'Show.S01E02:episodeNumbers',
      'Show.S01E02:releaseTitle',
    ]);
  });
});

describe('selectAgreedSample', () => {
  it('draws a tenth of the agreed items, rounded up, with mulberry32 and the fixed seed', () => {
    const ownItems = manyAgreedItems();
    const agreedItems = ownItems.filter(ownItem => ownItem.isAgreed);
    expect(selectAgreedSample(ownItems)).toEqual(referenceSample(agreedItems));
    expect(selectAgreedSample(ownItems)).toHaveLength(
      Math.ceil(agreedItems.length / 10),
    );
  });

  it('does not depend on the input order', () => {
    const ownItems = manyAgreedItems();
    expect(selectAgreedSample(ownItems.toReversed())).toEqual(
      selectAgreedSample(ownItems),
    );
  });

  it('never samples a disagreed item', () => {
    expect(
      selectAgreedSample(OWN_ITEMS).every(sampledItem => sampledItem.isAgreed),
    ).toBe(true);
  });
});

describe('buildPendingItems', () => {
  it('lists the disagreed items and the agreed sample, sorted and unmarked', () => {
    const pendingItems = buildPendingItems(OWN_ITEMS);
    const sampledItems = selectAgreedSample(OWN_ITEMS);
    expect(pendingItems).toHaveLength(3 + sampledItems.length);
    expect(pendingItems).toEqual(
      expect.arrayContaining([
        {releaseName: 'Show.S01E02', fieldName: 'seasonNumbers'},
        ...sampledItems.map(({releaseName, fieldName}) => ({
          releaseName,
          fieldName,
        })),
      ]),
    );
    expect(pendingItems.every(item => Object.keys(item).length === 2)).toBe(
      true,
    );
    expect(pendingItems).toEqual(
      pendingItems.toSorted(
        (first, second) =>
          first.releaseName.localeCompare(second.releaseName) ||
          PARSED_FIELD_NAMES.indexOf(first.fieldName) -
            PARSED_FIELD_NAMES.indexOf(second.fieldName),
      ),
    );
  });
});

const labelFor = (releaseName, fieldName, expectedValue) => ({
  releaseName,
  fieldName,
  expectedValue,
});

const DIFFERING_VALUES = {
  releaseGroup: ['grp', 'other-grp'],
  releaseSourceFamily: [ReleaseSourceFamily.WEB, ReleaseSourceFamily.DVD],
  streamingService: ['NF', 'HULU'],
  releaseEdition: ['extended', 'imax'],
  seasonNumbers: [[98], [99]],
  episodeNumbers: [[98], [99]],
  releaseTitle: ['some title', 'other title'],
  releaseYear: [1998, 1999],
};

const differingValue = (fieldName, agreedValue) => {
  const [firstValue, secondValue] = DIFFERING_VALUES[fieldName];
  return JSON.stringify(firstValue) === JSON.stringify(agreedValue)
    ? secondValue
    : firstValue;
};

const fullLabels = ({isSampleDiffering = false} = {}) => [
  labelFor('Show.S01E02', 'seasonNumbers', [1]),
  labelFor('Show.S01E02', 'episodeNumbers', [2]),
  labelFor('Show.S01E02', 'releaseTitle', 'show'),
  ...selectAgreedSample(OWN_ITEMS).map(({releaseName, fieldName}) => {
    const {agreedValue} = OWN_ITEMS.find(
      ownItem =>
        ownItem.releaseName === releaseName && ownItem.fieldName === fieldName,
    );
    return labelFor(
      releaseName,
      fieldName,
      isSampleDiffering ? differingValue(fieldName, agreedValue) : agreedValue,
    );
  }),
];

describe('resolveOwnTruth', () => {
  it('builds every own name from agreed values and labels', () => {
    const ownTruth = resolveOwnTruth({
      ownItems: OWN_ITEMS,
      labels: fullLabels(),
    });
    expect(
      ownTruth.nameCases.find(
        nameCase => nameCase.releaseName === 'Show.S01E02',
      ),
    ).toEqual({
      releaseName: 'Show.S01E02',
      expectedFields: buildParsedFields({
        releaseTitle: 'show',
        seasonNumbers: [1],
        episodeNumbers: [2],
      }),
    });
    expect(ownTruth.pendingItemCount).toBe(buildPendingItems(OWN_ITEMS).length);
  });

  it('counts the sampled agreed items whose label differs', () => {
    const sampleSize = selectAgreedSample(OWN_ITEMS).length;
    expect(sampleSize).toBeGreaterThan(0);
    expect(
      resolveOwnTruth({ownItems: OWN_ITEMS, labels: fullLabels()}),
    ).toMatchObject({sampleSize, sampleErrorCount: 0});
    expect(
      resolveOwnTruth({
        ownItems: OWN_ITEMS,
        labels: fullLabels({isSampleDiffering: true}),
      }),
    ).toMatchObject({sampleSize, sampleErrorCount: sampleSize});
  });

  it('refuses a pending item without a label', () => {
    expect(() =>
      resolveOwnTruth({ownItems: OWN_ITEMS, labels: fullLabels().slice(1)}),
    ).toThrow(ParserLabelError);
  });

  it('ignores a label for an item that is not pending', () => {
    const ownTruth = resolveOwnTruth({
      ownItems: OWN_ITEMS,
      labels: [...fullLabels(), labelFor('Film.2020', 'releaseGroup', 'zzz')],
    });
    expect(ownTruth.ignoredLabelCount).toBe(
      selectAgreedSample(OWN_ITEMS).some(
        ({releaseName, fieldName}) =>
          releaseName === 'Film.2020' && fieldName === 'releaseGroup',
      )
        ? 0
        : 1,
    );
  });
});

describe('parseParserLabels', () => {
  it('reads labels already in normalised form', () => {
    expect(
      parseParserLabels(
        JSON.stringify({
          labels: [
            labelFor('A', 'releaseSourceFamily', 'web'),
            labelFor('A', 'seasonNumbers', [1, 2]),
            labelFor('A', 'releaseEdition', null),
            labelFor('A', 'streamingService', 'NF'),
          ],
        }),
      ),
    ).toHaveLength(4);
  });

  it.each([
    ['a family typo', labelFor('A', 'releaseSourceFamily', 'webb')],
    ['a raw source', labelFor('A', 'releaseSourceFamily', 'WEB-DL')],
    ['an unsorted set', labelFor('A', 'seasonNumbers', [2, 1])],
    ['a year as text', labelFor('A', 'releaseYear', '2020')],
    ['an edition outside the set', labelFor('A', 'releaseEdition', 'limited')],
    ['an unknown field', labelFor('A', 'resolution', '1080p')],
    ['a title not folded', labelFor('A', 'releaseTitle', 'The Show')],
  ])('refuses %s', (_, label) => {
    expect(() => parseParserLabels(JSON.stringify({labels: [label]}))).toThrow(
      ParserLabelError,
    );
  });

  it('refuses one item labelled twice', () => {
    expect(() =>
      parseParserLabels(
        JSON.stringify({
          labels: [
            labelFor('A', 'releaseYear', 2020),
            labelFor('A', 'releaseYear', 2021),
          ],
        }),
      ),
    ).toThrow(ParserLabelError);
  });

  it('refuses text that is not JSON without quoting it', () => {
    expect(() => parseParserLabels('{"labels": [Private.Name')).toThrow(
      'The parser labels file is not valid JSON.',
    );
  });
});
