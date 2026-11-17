import {makeCandidate} from './factories.js';

export const SCENE_LINES = [
  'Where were you last night?',
  'I was at the harbour with my brother.',
  'Nobody saw you there.',
  'Then ask the fisherman, he knows me.',
  'The fisherman left town this morning.',
  'That is very convenient for you.',
  'I am telling you the truth.',
  'We will see about that tomorrow.',
];

export const NEAR_DUPLICATE_SCENE_LINES = SCENE_LINES.map((line, index) =>
  index === 2 ? 'Nobody saw you yesterday.' : line,
);

export const OTHER_SCENE_LINES = [
  'The train leaves at nine sharp.',
  'Bring the papers and the keys.',
  'Do not forget the blue suitcase.',
  'She called twice while you slept.',
  'Our money is gone, all of it.',
  'Lock every door before dawn.',
  'Quiet, somebody is coming upstairs.',
  'Run to the car and start it now.',
];

const SCRAMBLED_LETTERS = 'abcdefghijklmnopqrstuvwxyz ';

export const makeScrambledLines = ({seed, lineCount, lineLength = 30}) => {
  let randomState = seed;
  const nextLetter = () => {
    randomState = (randomState * 1103515245 + 12345) % 2147483648;
    return SCRAMBLED_LETTERS[
      Math.floor(randomState / 65536) % SCRAMBLED_LETTERS.length
    ];
  };
  return Array.from({length: lineCount}, () =>
    Array.from({length: lineLength}, nextLetter).join(''),
  );
};

export const makeCues = (lines = SCENE_LINES, offsetMs = 0) =>
  lines.map((text, index) => ({
    startMs: offsetMs + index * 3000,
    endMs: offsetMs + index * 3000 + 2500,
    text,
  }));

export const makeFileFacts = (overrides = {}) => {
  const normalizedCues = overrides.normalizedCues ?? makeCues();
  return {
    contentKey: 'content-key-1',
    isFileValid: true,
    fileInvalidReasons: [],
    cueCount: normalizedCues.length,
    lastCueEndMs: normalizedCues.at(-1)?.endMs ?? 0,
    detectedLanguageCode: 'eng',
    normalizedCues,
    ...overrides,
  };
};

export const makeDistinctCandidate = (urlCode, overrides = {}) =>
  makeCandidate({urlCode, siteFileId: `site-file-${urlCode}`, ...overrides});
