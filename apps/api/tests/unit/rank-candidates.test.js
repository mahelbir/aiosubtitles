import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  NEAR_DUPLICATE_CANDIDATE_MAX,
  listNearDuplicateCandidates,
  rankVideoCandidates,
} from '../../src/routes/(addon)/_subtitle-list/rank-candidates.js';

const VIDEO_CONTEXT = {
  videoId: 'tt0133093',
  catalogSeason: null,
  catalogEpisode: null,
  videoHash: null,
  videoRelease: null,
  catalogDurationMs: null,
};

let candidateSequence = 0;

function makeCandidate(overrides = {}) {
  candidateSequence += 1;
  const urlCode = String(candidateSequence).padStart(64, '0');
  return {
    subtitleId: `subtitle-${candidateSequence}`,
    fileSubtitleId: null,
    urlCode,
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    siteFileId: `site-file-${candidateSequence}`,
    archiveEntryPath: '',
    siteFileUrl: null,
    aliasOfUrlCode: null,
    hasOpensubtitlesV3Alias: false,
    languageCode: 'tur',
    releaseNames: ['The.Matrix.1999.1080p.BluRay.x264-AAA'],
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: null,
    siteDownloadCount: null,
    siteFps: null,
    firstSeenAt: new Date(
      Date.UTC(2026, 0, 1, 0, 0, candidateSequence),
    ).toISOString(),
    fileExtension: 'srt',
    hashMatchVideoHashes: [],
    fileFacts: null,
    siteCueShape: null,
    referenceComparison: null,
    variantReferenceFamilyCount: 0,
    variantHashMatchCount: 0,
    isAccountHidden: false,
    ...overrides,
  };
}

function makeFileFacts(normalizedCues = null) {
  candidateSequence += 1;
  return {
    contentKey: String(candidateSequence).padStart(64, 'f'),
    isFileValid: true,
    fileInvalidReasons: [],
    cueCount: 2,
    lastCueEndMs: 4000,
    detectedLanguageCode: 'tur',
    normalizedCues,
  };
}

function makeCues(firstText) {
  return [
    {startMs: 1000, endMs: 2000, text: firstText},
    {startMs: 3000, endMs: 4000, text: 'the crew waited on the deck all night'},
  ];
}

function makeNearDuplicatePair() {
  return [
    makeCandidate({
      fileFacts: makeFileFacts(
        makeCues('the ship reached the harbour early this morning'),
      ),
    }),
    makeCandidate({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      fileFacts: makeFileFacts(
        makeCues('the ship reached the harbor early this morning'),
      ),
    }),
  ];
}

function makeFileFillers(count) {
  return Array.from({length: count}, () =>
    makeCandidate({fileFacts: makeFileFacts()}),
  );
}

function rank(candidates) {
  return rankVideoCandidates({
    candidates,
    videoContext: VIDEO_CONTEXT,
    languageCodes: ['tur'],
    subtitleLanguageLimit: 1000,
  });
}

function countPairRows(rankedRows, nearDuplicatePair) {
  const pairUrlCodes = nearDuplicatePair.map(({urlCode}) => urlCode);
  return rankedRows.filter(({urlCode}) => pairUrlCodes.includes(urlCode))
    .length;
}

describe('rankVideoCandidates near-duplicate grouping', () => {
  it('merges near duplicates in a language at the candidate limit', () => {
    const nearDuplicatePair = makeNearDuplicatePair();

    const {rankedRows} = rank([
      ...nearDuplicatePair,
      ...makeFileFillers(NEAR_DUPLICATE_CANDIDATE_MAX - 2),
    ]);

    expect(countPairRows(rankedRows, nearDuplicatePair)).toBe(1);
  });

  it('skips near-duplicate grouping in a language past the candidate limit', () => {
    const nearDuplicatePair = makeNearDuplicatePair();

    const {rankedRows} = rank([
      ...nearDuplicatePair,
      ...makeFileFillers(NEAR_DUPLICATE_CANDIDATE_MAX - 1),
    ]);

    expect(countPairRows(rankedRows, nearDuplicatePair)).toBe(2);
  });

  it('counts only candidates with valid files toward the limit', () => {
    const nearDuplicatePair = makeNearDuplicatePair();

    const {rankedRows} = rank([
      ...nearDuplicatePair,
      ...makeFileFillers(NEAR_DUPLICATE_CANDIDATE_MAX - 2),
      ...Array.from({length: 50}, () => makeCandidate()),
    ]);

    expect(countPairRows(rankedRows, nearDuplicatePair)).toBe(1);
  });

  it('lists cue reads only for languages at or under the limit', () => {
    const turkishCandidates = makeFileFillers(NEAR_DUPLICATE_CANDIDATE_MAX + 1);
    const englishCandidates = [
      makeCandidate({languageCode: 'eng', fileFacts: makeFileFacts()}),
      makeCandidate({languageCode: 'eng', fileFacts: makeFileFacts()}),
      makeCandidate({languageCode: 'eng'}),
    ];

    expect(
      listNearDuplicateCandidates([...turkishCandidates, ...englishCandidates]),
    ).toEqual(englishCandidates.slice(0, 2));
  });
});

describe('listNearDuplicateCandidates', () => {
  function makeShapedCandidate({
    cueCount = 2,
    lastCueEndMs = 4000,
    contentKey,
    fileFormat = 'srt',
    languageCode = 'tur',
  } = {}) {
    const fileFacts = makeFileFacts();
    return makeCandidate({
      languageCode,
      fileFormat,
      fileFacts: {
        ...fileFacts,
        contentKey: contentKey ?? fileFacts.contentKey,
        cueCount,
        lastCueEndMs,
      },
    });
  }

  it('leaves out a file whose cue count no other file shares', () => {
    const pair = [makeShapedCandidate(), makeShapedCandidate()];
    const loner = makeShapedCandidate({cueCount: 3});

    expect(listNearDuplicateCandidates([...pair, loner])).toEqual(pair);
  });

  it('leaves out files that share only their content key', () => {
    const contentKey = 'a'.repeat(64);

    expect(
      listNearDuplicateCandidates([
        makeShapedCandidate({contentKey}),
        makeShapedCandidate({contentKey}),
      ]),
    ).toEqual([]);
  });

  it('leaves out files whose last cue ends at another time', () => {
    expect(
      listNearDuplicateCandidates([
        makeShapedCandidate({lastCueEndMs: 4000}),
        makeShapedCandidate({lastCueEndMs: 5000}),
      ]),
    ).toEqual([]);
  });

  it('ignores the last cue end of a frame-based file', () => {
    const pair = [
      makeShapedCandidate({lastCueEndMs: 4000}),
      makeShapedCandidate({lastCueEndMs: 4170, fileFormat: 'microdvd'}),
    ];

    expect(listNearDuplicateCandidates(pair)).toEqual(pair);
  });

  it('pairs files only inside one language', () => {
    expect(
      listNearDuplicateCandidates([
        makeShapedCandidate({languageCode: 'tur'}),
        makeShapedCandidate({languageCode: 'eng'}),
      ]),
    ).toEqual([]);
  });
});

describe('rankVideoCandidates hidden OpenSubtitles count', () => {
  function makeHiddenCandidate(overrides = {}) {
    return makeCandidate({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      isQuotaCostly: true,
      isAccountHidden: true,
      ...overrides,
    });
  }

  it('counts hidden duplicates once', () => {
    const siteFileUrl = 'https://dl.opensubtitles.org/file/1';

    const {rankedRows, hiddenSubtitleCount} = rank([
      makeHiddenCandidate({siteFileUrl}),
      makeHiddenCandidate({siteFileUrl}),
      makeHiddenCandidate({
        releaseNames: ['The.Matrix.1999.720p.WEB-DL-BBB'],
      }),
    ]);

    expect(rankedRows).toEqual([]);
    expect(hiddenSubtitleCount).toBe(2);
  });

  it('lists a hidden row grouped with a visible one and leaves it uncounted', () => {
    const hiddenCandidate = makeHiddenCandidate();
    const visibleCandidate = makeCandidate({
      subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
      aliasOfUrlCode: hiddenCandidate.urlCode,
    });

    const {rankedRows, hiddenSubtitleCount} = rank([
      hiddenCandidate,
      visibleCandidate,
    ]);

    expect(rankedRows.map(({urlCode}) => urlCode)).toEqual([
      visibleCandidate.urlCode,
    ]);
    expect(hiddenSubtitleCount).toBe(0);
  });

  it('does not count a hard-rejected hidden row', () => {
    const {hiddenSubtitleCount} = rank([
      makeHiddenCandidate({
        releaseNames: ['The.Matrix.1999.1080p.BluRay.x264-DDD.CD1'],
      }),
    ]);

    expect(hiddenSubtitleCount).toBe(0);
  });
});
