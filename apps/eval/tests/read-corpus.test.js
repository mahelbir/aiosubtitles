import {beforeAll, describe, expect, it} from 'vitest';
import {readCorpus} from '../src/corpus/read-corpus.js';
import {ATLAS_FIXTURE_ROOT} from './support/atlas-fixture.js';

const AUTH_PATTERN = /auth=/i;
const URL_PATTERN = /[a-z]+:\/\//i;

const collectLeaks = (node, path = '$') => {
  if (typeof node === 'string') {
    return AUTH_PATTERN.test(node) || URL_PATTERN.test(node) ? [path] : [];
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  return Object.entries(node).flatMap(([childKey, child]) => [
    ...(/^(url|auth)$/i.test(childKey) ? [`${path}.${childKey}`] : []),
    ...collectLeaks(child, `${path}.${childKey}`),
  ]);
};

const classByGroup = evalCase => {
  const classByCandidateKey = new Map(
    evalCase.candidates
      .filter(candidate => candidate.expectedClass !== null)
      .map(candidate => [candidate.candidateKey, candidate.expectedClass]),
  );
  const candidateById = new Map(
    evalCase.candidates.map(candidate => [candidate.candidateId, candidate]),
  );
  const groupKeys = new Set(
    evalCase.poolRows
      .map(poolRow => candidateById.get(poolRow.candidateId))
      .filter(candidate => candidate?.isValid === true)
      .map(candidate => candidate.candidateKey),
  );
  return Object.fromEntries(
    [...groupKeys].map(groupKey => [
      groupKey,
      classByCandidateKey.get(groupKey) ?? null,
    ]),
  );
};

describe('readCorpus', () => {
  let evalCases;
  let caseByCode;

  beforeAll(async () => {
    evalCases = await readCorpus({atlasRoot: ATLAS_FIXTURE_ROOT});
    caseByCode = new Map(
      (evalCases ?? []).map(evalCase => [evalCase.caseCode, evalCase]),
    );
  });

  it('returns the cases of index.json in order and skips the twin', () => {
    expect(evalCases.map(evalCase => evalCase.caseCode)).toEqual([
      'V90',
      'V92',
    ]);
  });

  it('reads the truth, the audit status and the duration from case.json', () => {
    const evalCase = caseByCode.get('V90');
    expect({
      truthAuditStatus: evalCase.truthAuditStatus,
      truthCues: evalCase.truthCues,
      durationMs: evalCase.durationMs,
    }).toEqual({
      truthAuditStatus: 'passed',
      truthCues: [
        [1000, 2000],
        [3000, 4500],
      ],
      durationMs: 1500500,
    });
    expect(caseByCode.get('V92').truthAuditStatus).toBe('suspect');
  });

  it('joins the video metadata from local.json, identities and candidates data', () => {
    expect(caseByCode.get('V90').video).toEqual({
      catalogId: 'tt9000001:1:1',
      videoFilename: 'Fixture.Show.S01E01.1080p.WEB-FAKE.mkv',
      videoSizeBytes: 1234567,
      videoHash: '0123456789abcdef',
      frameRate: '24000/1001',
      durationSeconds: 1500.5,
    });
  });

  it('leaves frame rate and duration null for a video without a candidates-data record', () => {
    expect(caseByCode.get('V92').video).toEqual({
      catalogId: 'tt9000002',
      videoFilename: 'Fixture.Film.2019.1080p.mp4',
      videoSizeBytes: 7654321,
      videoHash: 'fedcba9876543210',
      frameRate: null,
      durationSeconds: null,
    });
  });

  it('lists pool rows in served order with labels and site identities', () => {
    expect(caseByCode.get('V90').poolRows).toEqual([
      {
        servedIndex: 0,
        candidateId: 'V90/c1',
        rowId:
          '[OpenSubtitles] 1 hak harcar · bugün 9 kaldı | Fixture.Show.S01E01.1080p.WEB-FAKE',
        label:
          '[OpenSubtitles] 1 hak harcar · bugün 9 kaldı | Fixture.Show.S01E01.1080p.WEB-FAKE',
        siteIdentity: {subtitleSource: 'opensubtitles', siteFileId: '7001'},
      },
      {
        servedIndex: 1,
        candidateId: 'V90/c2',
        rowId:
          '[AltyazıDB] ✓ Ücretsiz · HI | Fixture.Show.S01E01.1080p.WEB-FAKE (2)',
        label:
          '[AltyazıDB] ✓ Ücretsiz · HI | Fixture.Show.S01E01.1080p.WEB-FAKE',
        siteIdentity: {subtitleSource: 'altyazidb', siteFileId: '11-22-33'},
      },
      {
        servedIndex: 2,
        candidateId: 'V90/c4',
        rowId: '[SubSource] ✓ Ücretsiz | Fixture_Show_S01E01',
        label: '[SubSource] ✓ Ücretsiz | Fixture_Show_S01E01',
        siteIdentity: {subtitleSource: 'subsource', siteFileId: '44-55-66'},
      },
      {
        servedIndex: 3,
        candidateId: 'V90/c5',
        rowId: '[OpenSubtitles] ✓ Ücretsiz · Resmi | Fixture.Show.S01E01.720p',
        label: '[OpenSubtitles] ✓ Ücretsiz · Resmi | Fixture.Show.S01E01.720p',
        siteIdentity: {subtitleSource: 'opensubtitles-v3', siteFileId: '8001'},
      },
      {
        servedIndex: 4,
        candidateId: 'V90/c6',
        rowId:
          '[SubDL] ✓ Ücretsiz | Fixture.Show.S01E01.WEB _ Fixture.Show.S01E01.HDTV',
        label:
          '[SubDL] ✓ Ücretsiz | Fixture.Show.S01E01.WEB _ Fixture.Show.S01E01.HDTV',
        siteIdentity: {subtitleSource: 'subdl', siteFileId: '9001'},
      },
      {
        servedIndex: 5,
        candidateId: null,
        rowId: '[AniSub] ✓ Ücretsiz | Fixture Show 01',
        label: '[AniSub] ✓ Ücretsiz | Fixture Show 01',
        siteIdentity: {subtitleSource: 'anisub', siteFileId: '5001'},
      },
    ]);
  });

  it('reads every candidate of both files, pool member or not', () => {
    expect(
      evalCases.map(evalCase =>
        evalCase.candidates.map(candidate => candidate.candidateId),
      ),
    ).toEqual([
      ['V90/c1', 'V90/c2', 'V90/c3', 'V90/c4', 'V90/c5', 'V90/c6', 'V90/c7'],
      ['V92/c1', 'V92/c2'],
    ]);
  });

  it('joins a frozen duplicate candidate', () => {
    const candidate = caseByCode
      .get('V90')
      .candidates.find(entry => entry.candidateId === 'V90/c2');
    expect(candidate).toEqual({
      candidateId: 'V90/c2',
      expectedClass: null,
      rowId:
        '[AltyazıDB] ✓ Ücretsiz · HI | Fixture.Show.S01E01.1080p.WEB-FAKE (2)',
      parsedRowId: {
        subtitleSourceName: 'AltyazıDB',
        isFree: true,
        isQuotaCostly: false,
        isHearingImpaired: true,
        isForced: false,
        isOfficialAddon: false,
        releaseNames: ['Fixture.Show.S01E01.1080p.WEB-FAKE'],
        duplicateIndex: 2,
      },
      candidateKey: '11111111111111111111111111111111',
      rawSha256:
        'a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2',
      trackSha256:
        'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
      cueCount: 2,
      isValid: true,
      invalidReasons: [],
      duplicateOf: 'V90/c1',
      timeFamily: 'f1',
      languageCode: 'tur',
    });
  });

  it('fills null fields for a candidate that never froze', () => {
    const candidate = caseByCode
      .get('V90')
      .candidates.find(entry => entry.candidateId === 'V90/c7');
    expect(candidate).toEqual({
      candidateId: 'V90/c7',
      expectedClass: null,
      rowId: '[AniSub] ✓ Ücretsiz | Fixture Show 01',
      parsedRowId: {
        subtitleSourceName: 'AniSub',
        isFree: true,
        isQuotaCostly: false,
        isHearingImpaired: false,
        isForced: false,
        isOfficialAddon: false,
        releaseNames: ['Fixture Show 01'],
        duplicateIndex: null,
      },
      candidateKey: null,
      rawSha256: null,
      trackSha256: null,
      cueCount: null,
      isValid: null,
      invalidReasons: [],
      duplicateOf: null,
      timeFamily: null,
      languageCode: 'tur',
    });
  });

  it('keeps the null key of a no-cues candidate', () => {
    const candidate = caseByCode
      .get('V90')
      .candidates.find(entry => entry.candidateId === 'V90/c6');
    expect({
      candidateKey: candidate.candidateKey,
      trackSha256: candidate.trackSha256,
      isValid: candidate.isValid,
      invalidReasons: candidate.invalidReasons,
    }).toEqual({
      candidateKey: null,
      trackSha256: null,
      isValid: false,
      invalidReasons: ['no-cues'],
    });
  });

  it('resolves group classes through candidateKey across the whole video', () => {
    expect(evalCases.map(classByGroup)).toEqual([
      {
        '11111111111111111111111111111111': 'fits',
        '22222222222222222222222222222222': 'wrong',
      },
      {'11111111111111111111111111111111': 'wrong'},
    ]);
  });

  it('holds no url or auth token at any depth', () => {
    expect(evalCases).toHaveLength(2);
    expect(evalCases.flatMap(evalCase => evalCase.candidates)).toHaveLength(9);
    expect(evalCases.flatMap(evalCase => evalCase.poolRows)).toHaveLength(8);
    expect(collectLeaks(evalCases)).toEqual([]);
  });
});
