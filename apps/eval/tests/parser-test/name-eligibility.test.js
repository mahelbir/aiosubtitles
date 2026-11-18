import {describe, expect, it} from 'vitest';
import {isNameEligible} from '../../src/parser-test/name-eligibility.js';

const ELIGIBILITY_CELLS = [
  ['guessit', 'own', true],
  ['guessit', 'guessit', false],
  ['guessit', 'sonarr', true],
  ['guessit', 'ptt', true],
  ['release-parser', 'own', true],
  ['release-parser', 'guessit', true],
  ['release-parser', 'sonarr', true],
  ['release-parser', 'ptt', false],
  ['video-filename-parser', 'own', true],
  ['video-filename-parser', 'guessit', true],
  ['video-filename-parser', 'sonarr', false],
  ['video-filename-parser', 'ptt', true],
  ['parsium', 'own', true],
  ['parsium', 'guessit', true],
  ['parsium', 'sonarr', true],
  ['parsium', 'ptt', true],
];

describe('isNameEligible', () => {
  it.each(ELIGIBILITY_CELLS)(
    'scores %s on the %s set: %s',
    (library, datasetName, isEligible) => {
      expect(isNameEligible({library, datasetName})).toBe(isEligible);
    },
  );
});
