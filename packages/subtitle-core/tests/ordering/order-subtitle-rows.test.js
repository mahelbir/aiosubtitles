import {describe, expect, it} from 'vitest';
import {orderSubtitleRows} from '../../src/ordering/order-subtitle-rows.js';
import {makeRankedRow} from '../helpers/factories.js';

const SHUFFLE_SEED = 20261117;
const SHUFFLE_ROUNDS = 20;
const NO_LIMIT = 30;

const makeSeededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWith = (rows, random) => {
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const urlCodesOf = (rows) => rows.map((row) => row.urlCode);

describe('orderSubtitleRows', () => {
  it('puts every row of an earlier user language before any row of a later one', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'eng-high', languageCode: 'eng', totalScore: 90}),
      makeRankedRow({urlCode: 'tur-low', languageCode: 'tur', totalScore: 10}),
      makeRankedRow({urlCode: 'eng-low', languageCode: 'eng', totalScore: 5}),
      makeRankedRow({urlCode: 'tur-high', languageCode: 'tur', totalScore: 50}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur', 'eng'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(orderedRows.map((row) => row.languageCode)).toEqual(['tur', 'tur', 'eng', 'eng']);
  });

  it('drops a row whose language is not in the user language list', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'tur-1', languageCode: 'tur', totalScore: 10}),
      makeRankedRow({urlCode: 'fre-1', languageCode: 'fre', totalScore: 99}),
      makeRankedRow({urlCode: 'eng-1', languageCode: 'eng', totalScore: 10}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur', 'eng'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['tur-1', 'eng-1']);
  });

  it('shows a language listed twice once, at its first position', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'eng-1', languageCode: 'eng', totalScore: 10}),
      makeRankedRow({urlCode: 'tur-1', languageCode: 'tur', totalScore: 10}),
      makeRankedRow({urlCode: 'tur-2', languageCode: 'tur', totalScore: 5}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur', 'eng', 'tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['tur-1', 'tur-2', 'eng-1']);
  });

  it('ignores listed codes that match inherited object keys', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'eng-1', languageCode: 'eng', totalScore: 10}),
      makeRankedRow({urlCode: 'tur-1', languageCode: 'tur', totalScore: 10}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['constructor', 'toString', '__proto__', 'eng', 'tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['eng-1', 'tur-1']);
  });

  it('skips a listed language that has no rows', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'tur-1', languageCode: 'tur', totalScore: 20}),
      makeRankedRow({urlCode: 'tur-2', languageCode: 'tur', totalScore: 10}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['ger', 'tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['tur-1', 'tur-2']);
  });

  it('orders rows inside a language by total score from high to low', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'mid', languageCode: 'tur', totalScore: 40}),
      makeRankedRow({urlCode: 'top', languageCode: 'tur', totalScore: 80}),
      makeRankedRow({urlCode: 'low', languageCode: 'tur', totalScore: -5}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['top', 'mid', 'low']);
  });

  it('breaks a score tie by site download count from high to low', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'aaa', languageCode: 'tur', totalScore: 30, siteDownloadCount: 5}),
      makeRankedRow({urlCode: 'bbb', languageCode: 'tur', totalScore: 30, siteDownloadCount: 500}),
      makeRankedRow({urlCode: 'ccc', languageCode: 'tur', totalScore: 30, siteDownloadCount: 50}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['bbb', 'ccc', 'aaa']);
  });

  it('treats a missing site download count as zero', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'aaa', languageCode: 'tur', totalScore: 30, siteDownloadCount: null}),
      makeRankedRow({urlCode: 'bbb', languageCode: 'tur', totalScore: 30, siteDownloadCount: 1}),
      makeRankedRow({urlCode: 'ccc', languageCode: 'tur', totalScore: 30, siteDownloadCount: 0}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['bbb', 'aaa', 'ccc']);
  });

  it('breaks a score and download tie by url code ascending', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'ccc', languageCode: 'tur', totalScore: 30, siteDownloadCount: 7}),
      makeRankedRow({urlCode: 'aaa', languageCode: 'tur', totalScore: 30, siteDownloadCount: 7}),
      makeRankedRow({urlCode: 'bbb', languageCode: 'tur', totalScore: 30, siteDownloadCount: 7}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur'],
      subtitleLanguageLimit: NO_LIMIT,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('keeps only the top rows of each language up to the language limit', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'tur-3', languageCode: 'tur', totalScore: 10}),
      makeRankedRow({urlCode: 'eng-1', languageCode: 'eng', totalScore: 70}),
      makeRankedRow({urlCode: 'tur-1', languageCode: 'tur', totalScore: 90}),
      makeRankedRow({urlCode: 'eng-3', languageCode: 'eng', totalScore: 20}),
      makeRankedRow({urlCode: 'tur-2', languageCode: 'tur', totalScore: 50}),
      makeRankedRow({urlCode: 'eng-2', languageCode: 'eng', totalScore: 40}),
    ];

    const orderedRows = orderSubtitleRows({
      rankedRows,
      languageCodes: ['tur', 'eng'],
      subtitleLanguageLimit: 2,
    });

    expect(urlCodesOf(orderedRows)).toEqual(['tur-1', 'tur-2', 'eng-1', 'eng-2']);
  });

  it('gives the same order for every shuffle of the same input', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'tur-a', languageCode: 'tur', totalScore: 30, siteDownloadCount: 7}),
      makeRankedRow({urlCode: 'tur-b', languageCode: 'tur', totalScore: 30, siteDownloadCount: 7}),
      makeRankedRow({urlCode: 'tur-c', languageCode: 'tur', totalScore: 30, siteDownloadCount: null}),
      makeRankedRow({urlCode: 'tur-d', languageCode: 'tur', totalScore: 30, siteDownloadCount: 0}),
      makeRankedRow({urlCode: 'tur-e', languageCode: 'tur', totalScore: 60, siteDownloadCount: 1}),
      makeRankedRow({urlCode: 'eng-a', languageCode: 'eng', totalScore: 10, siteDownloadCount: 3}),
      makeRankedRow({urlCode: 'eng-b', languageCode: 'eng', totalScore: 10, siteDownloadCount: 3}),
      makeRankedRow({urlCode: 'eng-c', languageCode: 'eng', totalScore: 10, siteDownloadCount: 9}),
      makeRankedRow({urlCode: 'fre-a', languageCode: 'fre', totalScore: 99, siteDownloadCount: 99}),
    ];
    const expectedUrlCodes = ['tur-e', 'tur-a', 'tur-b', 'tur-c', 'eng-c', 'eng-a', 'eng-b'];
    const random = makeSeededRandom(SHUFFLE_SEED);

    for (let round = 0; round < SHUFFLE_ROUNDS; round += 1) {
      const orderedRows = orderSubtitleRows({
        rankedRows: shuffleWith(rankedRows, random),
        languageCodes: ['tur', 'eng'],
        subtitleLanguageLimit: 4,
      });

      expect(urlCodesOf(orderedRows)).toEqual(expectedUrlCodes);
    }
  });

  it('leaves the input array unchanged', () => {
    const rankedRows = [
      makeRankedRow({urlCode: 'bbb', languageCode: 'tur', totalScore: 10}),
      makeRankedRow({urlCode: 'aaa', languageCode: 'tur', totalScore: 20}),
    ];
    const inputUrlCodes = urlCodesOf(rankedRows);

    orderSubtitleRows({rankedRows, languageCodes: ['tur'], subtitleLanguageLimit: 1});

    expect(urlCodesOf(rankedRows)).toEqual(inputUrlCodes);
  });
});
