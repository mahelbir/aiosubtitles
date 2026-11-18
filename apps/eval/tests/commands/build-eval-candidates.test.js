import {beforeAll, describe, expect, it} from 'vitest';
import {
  ScoringSignal,
  SignalState,
} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {NEAR_DUPLICATE_TEXT_SIMILARITY_MIN} from '@repo/subtitle-core/deduplication/are-cues-near-duplicate.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {extractSignals} from '@repo/subtitle-core/scoring/extract-signals.js';
import {
  buildEvalCandidates,
  buildEvalVideoContext,
  groupDuplicatesPerLanguage,
  readTierOneKey,
} from '../../src/commands/build-eval-candidates.js';
import {createFrozenStore} from '../../src/corpus/frozen-store.js';
import {readCorpus} from '../../src/corpus/read-corpus.js';
import {computeTierOneTwoRecall} from '../../src/metrics/dedup-metrics.js';
import {ATLAS_FIXTURE_ROOT} from '../support/atlas-fixture.js';
import {makeSubtitleCandidate} from './helpers/scoring-inputs.js';

const UNSUPPLIED_SIGNALS = [
  ScoringSignal.TRUSTED_UPLOADER,
  ScoringSignal.DOWNLOAD_COUNT,
  ScoringSignal.MACHINE_TRANSLATED,
  ScoringSignal.HASH_MATCH,
  ScoringSignal.REFERENCE_FAMILY,
];

describe('buildEvalCandidates', () => {
  let evalCaseByCode;
  let candidatesByCode;

  beforeAll(async () => {
    const evalCases = await readCorpus({atlasRoot: ATLAS_FIXTURE_ROOT});
    const frozenStore = createFrozenStore(ATLAS_FIXTURE_ROOT);
    evalCaseByCode = new Map(
      evalCases.map(evalCase => [evalCase.caseCode, evalCase]),
    );
    candidatesByCode = new Map(
      await Promise.all(
        evalCases.map(async evalCase => [
          evalCase.caseCode,
          await buildEvalCandidates({evalCase, frozenStore}),
        ]),
      ),
    );
  });

  const listAllCandidates = () =>
    [...candidatesByCode.values()].flatMap(candidates => candidates ?? []);

  const readField = (caseCode, fieldName) =>
    (candidatesByCode.get(caseCode) ?? []).map(
      candidate => candidate[fieldName],
    );

  it('builds one candidate per pool row that names a candidate, in served order', () => {
    expect(candidatesByCode.get('V90')).toHaveLength(5);
    expect(candidatesByCode.get('V92')).toHaveLength(2);
  });

  it('takes the subtitle source from the source name, and an official addon row from its url', () => {
    expect(readField('V90', 'subtitleSource')).toEqual([
      'opensubtitles',
      'altyazidb',
      'subsource',
      'opensubtitles-v3',
      'subdl',
    ]);
    expect(readField('V92', 'subtitleSource')).toEqual([
      'altyazidb',
      'thesubtitledb',
    ]);
  });

  it('takes the site file id from the list url', () => {
    expect(readField('V90', 'siteFileId')).toEqual([
      '7001',
      '11-22-33',
      '44-55-66',
      '8001',
      '9001',
    ]);
    expect(readField('V92', 'siteFileId')).toEqual(['77-88-99', '6001']);
  });

  it('takes the release names from the list label', () => {
    expect(readField('V90', 'releaseNames')).toEqual([
      ['Fixture.Show.S01E01.1080p.WEB-FAKE'],
      ['Fixture.Show.S01E01.1080p.WEB-FAKE'],
      ['Fixture_Show_S01E01'],
      ['Fixture.Show.S01E01.720p'],
      ['Fixture.Show.S01E01.WEB', 'Fixture.Show.S01E01.HDTV'],
    ]);
    expect(readField('V92', 'releaseNames')).toEqual([
      ['Fixture Film (2019)'],
      ['Fixture.Film.2019.1080p'],
    ]);
  });

  it('reads the paid and hearing-impaired flags from the row', () => {
    expect(readField('V90', 'isQuotaCostly').map(Boolean)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(readField('V90', 'isHearingImpaired').map(Boolean)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(readField('V90', 'languageCode')).toEqual(
      Array.from({length: 5}, () => 'tur'),
    );
  });

  it('builds file facts from the frozen raw file of each row', () => {
    const [fitsRow, duplicateRow, wrongRow, shortRow, emptyRow] =
      candidatesByCode.get('V90') ?? [];

    expect(fitsRow?.fileFacts).toMatchObject({isFileValid: true, cueCount: 12});
    expect(duplicateRow?.fileFacts?.contentKey).toBe(
      fitsRow?.fileFacts?.contentKey,
    );
    expect(wrongRow?.fileFacts?.isFileValid).toBe(true);
    expect(wrongRow?.fileFacts?.contentKey).not.toBe(
      fitsRow?.fileFacts?.contentKey,
    );
    expect(shortRow?.fileFacts?.isFileValid).toBe(false);
    expect(emptyRow?.fileFacts?.isFileValid).toBe(false);
  });

  it('leaves every signal the corpus cannot supply unknown (metrics §6)', () => {
    const candidates = listAllCandidates();

    expect(candidates).toHaveLength(7);
    for (const caseCode of ['V90', 'V92']) {
      const video = buildEvalVideoContext(evalCaseByCode.get(caseCode));
      for (const candidate of candidatesByCode.get(caseCode)) {
        expect(candidate).toMatchObject({
          isUploaderTrusted: null,
          siteDownloadCount: null,
          isMachineTranslated: null,
          hashMatchVideoHashes: [],
        });
        const signals = extractSignals({
          candidate,
          candidateRelease: parseReleaseName(candidate.releaseNames[0]),
          video,
        });
        expect(
          UNSUPPLIED_SIGNALS.map(
            scoringSignal => signals[scoringSignal].signalState,
          ),
        ).toEqual(UNSUPPLIED_SIGNALS.map(() => SignalState.UNKNOWN));
      }
    }
  });

  it('never feeds the reference time family into a ranking run (metrics §6)', () => {
    const candidates = listAllCandidates();

    expect(evalCaseByCode.get('V90').truthCues.length).toBeGreaterThan(0);
    expect(candidates).toHaveLength(7);
    expect(candidates.map(candidate => candidate.referenceComparison)).toEqual(
      Array.from({length: 7}, () => null),
    );
  });
});

describe('buildEvalVideoContext', () => {
  let evalCaseByCode;

  beforeAll(async () => {
    const evalCases = await readCorpus({atlasRoot: ATLAS_FIXTURE_ROOT});
    evalCaseByCode = new Map(
      evalCases.map(evalCase => [evalCase.caseCode, evalCase]),
    );
  });

  it('builds an episode video from the catalog id and the file name, with no hash', () => {
    const evalCase = evalCaseByCode.get('V90');

    expect(evalCase.video.videoHash).not.toBeNull();
    expect(buildEvalVideoContext(evalCase)).toMatchObject({
      videoId: 'tt9000001:1:1',
      catalogSeason: 1,
      catalogEpisode: 1,
      videoHash: null,
      catalogDurationMs: null,
      videoRelease: {
        seasonNumbers: [1],
        episodeNumbers: [1],
        resolutionHeight: 1080,
      },
    });
  });

  it('builds a film video with no season, no episode and no hash', () => {
    const evalCase = evalCaseByCode.get('V92');

    expect(evalCase.video.videoHash).not.toBeNull();
    expect(buildEvalVideoContext(evalCase)).toMatchObject({
      videoId: 'tt9000002',
      catalogSeason: null,
      catalogEpisode: null,
      videoHash: null,
      catalogDurationMs: null,
      videoRelease: {releaseYear: 2019, resolutionHeight: 1080},
    });
  });
});

describe('readTierOneKey', () => {
  const firstCandidate = makeSubtitleCandidate({
    subtitleSource: 'altyazidb',
    siteFileId: '11-22-33',
  });
  const twinCandidate = makeSubtitleCandidate({
    urlCode: 'url-code-2',
    subtitleSource: 'altyazidb',
    siteFileId: '11-22-33',
  });
  const otherCandidate = makeSubtitleCandidate({
    subtitleSource: 'altyazidb',
    siteFileId: '44-55-66',
  });

  it('keys a tier-1 identity as a primitive', () => {
    expect(typeof readTierOneKey(firstCandidate)).toBe('string');
    expect(readTierOneKey(firstCandidate)).toBe(readTierOneKey(twinCandidate));
    expect(readTierOneKey(firstCandidate)).not.toBe(
      readTierOneKey(otherCandidate),
    );
  });

  it('lets D1 merge only the rows that share a tier-1 identity', () => {
    const toRow = candidate => ({
      videoCode: 'V90',
      candidateKey: 'same-content',
      subtitleSource: candidate.subtitleSource,
      tierOneKey: readTierOneKey(candidate),
    });

    const recall = computeTierOneTwoRecall({
      rows: [
        toRow(firstCandidate),
        toRow(twinCandidate),
        toRow(otherCandidate),
      ],
    });

    expect(recall.pairRecall.total).toEqual({
      pairCount: 3,
      mergedPairCount: 1,
      recall: 1 / 3,
    });
  });
});

describe('groupDuplicatesPerLanguage', () => {
  it('groups duplicates within one language only', () => {
    const candidates = [
      makeSubtitleCandidate({urlCode: 'tur-a', languageCode: 'tur'}),
      makeSubtitleCandidate({urlCode: 'eng-a', languageCode: 'eng'}),
      makeSubtitleCandidate({urlCode: 'tur-b', languageCode: 'tur'}),
      makeSubtitleCandidate({
        urlCode: 'tur-c',
        languageCode: 'tur',
        siteFileId: 'site-file-2',
      }),
    ];

    const duplicateGroups = groupDuplicatesPerLanguage({
      candidates,
      textSimilarityMin: NEAR_DUPLICATE_TEXT_SIMILARITY_MIN,
    });

    expect(duplicateGroups).toHaveLength(3);
    expect(
      duplicateGroups
        .map(duplicateGroup =>
          duplicateGroup.members.map(member => member.urlCode).toSorted(),
        )
        .toSorted(),
    ).toEqual([['eng-a'], ['tur-a', 'tur-b'], ['tur-c']]);
  });
});
