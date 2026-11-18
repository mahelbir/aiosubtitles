import {describe, expect, it} from 'vitest';
import {PARSED_FIELD_NAMES} from '../../src/parser-test/normalize-fields.js';
import {buildParserReport} from '../../src/parser-test/parser-report.js';

const SPREAD = {
  pointEstimate: 0.5,
  lowerBound: 0.25,
  upperBound: 0.75,
  unitCount: 4,
};

const fieldAccuracy = Object.fromEntries(
  PARSED_FIELD_NAMES.map(fieldName => [
    fieldName,
    {correctCount: 0, itemCount: 0, accuracy: null},
  ]),
);

const OUTCOME = {
  ownNameCount: 4,
  ownNameCountBySource: {subtitleReleaseNames: 3, videoFilenames: 1},
  droppedEditionCountByDataset: {guessit: 1, sonarr: 0, ptt: 2},
  nameCountByDataset: {own: 4, guessit: 0, sonarr: 0, ptt: 0},
  ownTruth: {
    pendingItemCount: 2,
    sampleSize: 0,
    sampleErrorCount: 0,
    ignoredLabelCount: 1,
  },
  labelsSha256: 'f'.repeat(64),
  guessitVersion: '4.5.1',
  libraryVersions: {'parsium-media': '1.1.0'},
  referenceCommits: {guessit: 'a'.repeat(40)},
  libraryResults: [
    {
      library: 'guessit',
      datasetName: 'own',
      fieldAccuracy: {
        ...fieldAccuracy,
        releaseTitle: {correctCount: 2, itemCount: 4, accuracy: 0.5},
      },
      emptyFieldNames: PARSED_FIELD_NAMES.filter(
        fieldName => fieldName !== 'releaseTitle',
      ),
      libraryScore: SPREAD,
    },
  ],
  pairComparisons: [
    {
      libraryA: 'guessit',
      libraryB: 'parsium',
      datasetNames: ['own'],
      difference: SPREAD,
      isAWinner: true,
      isBWinner: false,
    },
    {
      libraryA: 'guessit',
      libraryB: 'parsium',
      datasetNames: ['sonarr', 'ptt'],
      difference: SPREAD,
      isAWinner: false,
      isBWinner: true,
    },
    {
      libraryA: 'release-parser',
      libraryB: 'video-filename-parser',
      datasetNames: ['guessit'],
      difference: null,
      isAWinner: false,
      isBWinner: false,
    },
  ],
  decision: {
    ownScoreByLibrary: {parsium: null},
    bestLibrary: 'parsium',
    carriedLibraries: ['parsium'],
    isGuessitPorted: true,
    fieldFlags: [{library: 'parsium', fieldName: 'episodeNumbers'}],
    decisionLine: 'Decision: port guessit',
  },
};

const RUN_FINGERPRINT = {
  corpusFingerprint: {
    metricsSha256: 'b'.repeat(64),
    indexSha256: 'c'.repeat(64),
    caseSha256ByCode: {V06: 'd'.repeat(64)},
  },
  codeFingerprint: {
    evalSourceTree: 'e'.repeat(40),
    subtitleCoreSourceTree: '1'.repeat(40),
    hasUncommittedChanges: false,
  },
};

const REPORT_TEXT = buildParserReport({
  outcome: OUTCOME,
  reportDate: '2026-11-18',
  runFingerprint: RUN_FINGERPRINT,
});

describe('buildParserReport', () => {
  it('prints the §7.2 subtitle-name count apart from the combined own count', () => {
    expect(REPORT_TEXT).toContain(
      '- Own names: 4 in all; subtitle release names by the §7.2 rule: 3; video file names: 1',
    );
  });

  it('counts the external edition items dropped for naming several editions', () => {
    expect(REPORT_TEXT).toContain(
      '- Edition items dropped because one source names several canonical editions: guessit yml 1, Sonarr ParserTests 0, PTT and go-ptt tests 2',
    );
  });

  it('notes the Sonarr titles that keep the year and the missing video-filename-parser service', () => {
    expect(REPORT_TEXT).toContain(
      '- Sonarr titles: some Sonarr title items keep the series year',
    );
    expect(REPORT_TEXT).toContain(
      '- video-filename-parser service: the library has no service field',
    );
  });

  it('marks a clean source tree', () => {
    expect(REPORT_TEXT).toContain('- Uncommitted source changes: no');
  });

  it('shows a field without items as a dash and names the empty fields', () => {
    expect(REPORT_TEXT).toContain(
      '| guessit | — | — | — | — | — | — | 0.500 (2/4) | — | 0.500 [0.250, 0.750] | 4 |',
    );
    expect(REPORT_TEXT).toContain(
      'Fields without items: group, source, service, edition, season, episode, year.',
    );
  });

  it('names the winner of each comparison, or a tie, and a dash for an empty scope', () => {
    expect(REPORT_TEXT).toContain(
      '| guessit | parsium-media | own names | 0.500 [0.250, 0.750] | 4 | guessit wins |',
    );
    expect(REPORT_TEXT).toContain(
      '| guessit | parsium-media | Sonarr ParserTests + PTT and go-ptt tests | 0.500 [0.250, 0.750] | 4 | parsium-media wins |',
    );
    expect(REPORT_TEXT).toContain(
      '| @aiostreams/release-parser | @ctrl/video-filename-parser | guessit yml | — | 0 | tie |',
    );
  });

  it('shows the agreed-sample rate as a dash when nothing was sampled', () => {
    expect(REPORT_TEXT).toContain(
      '- Sampled labels that differ from the agreed value: 0 (—)',
    );
  });

  it('flags a port that loses on season or episode and ends on the decision', () => {
    expect(REPORT_TEXT).toContain('- guessit ported: yes');
    expect(REPORT_TEXT).toContain(
      '- Season or episode losses of a port: episode to parsium-media',
    );
    expect(REPORT_TEXT).toContain('- Own-name scores: parsium-media —');
    expect(REPORT_TEXT.trimEnd().split('\n').at(-1)).toBe(
      'Decision: port guessit',
    );
  });
});
