import {describe, expect, it, vi} from 'vitest';
import {
  UnknownSubtitleSourceError,
  buildEvalCandidates,
  readTierOneKey,
} from '../../src/commands/build-eval-candidates.js';
import {makeSubtitleCandidate} from './helpers/scoring-inputs.js';

const makeEvalCase = ({
  subtitleSourceName = 'SubDL',
  rawSha256 = null,
  isOfficialAddon = false,
  siteIdentity = {subtitleSource: 'subdl', siteFileId: '9001'},
}) => ({
  poolRows: [{servedIndex: 0, candidateId: 'X/c1', siteIdentity}],
  candidates: [
    {
      candidateId: 'X/c1',
      rawSha256,
      languageCode: 'tur',
      parsedRowId: {
        subtitleSourceName,
        isQuotaCostly: false,
        isHearingImpaired: false,
        isForced: false,
        isOfficialAddon,
        releaseNames: ['Show.S01E01.720p'],
      },
    },
  ],
});

describe('buildEvalCandidates edges', () => {
  it('leaves file facts unknown when the row has no frozen raw file', async () => {
    const frozenStore = {readBlob: vi.fn()};

    const [candidate] = await buildEvalCandidates({
      evalCase: makeEvalCase({}),
      frozenStore,
    });

    expect(candidate.fileFacts).toBeNull();
    expect(frozenStore.readBlob).not.toHaveBeenCalled();
  });

  it('refuses a source name it does not know', async () => {
    await expect(
      buildEvalCandidates({
        evalCase: makeEvalCase({subtitleSourceName: 'Nowhere'}),
        frozenStore: {readBlob: vi.fn()},
      }),
    ).rejects.toThrow(UnknownSubtitleSourceError);
  });

  it('refuses an official addon row whose url gives no source', async () => {
    await expect(
      buildEvalCandidates({
        evalCase: makeEvalCase({
          subtitleSourceName: 'OpenSubtitles',
          isOfficialAddon: true,
          siteIdentity: null,
        }),
        frozenStore: {readBlob: vi.fn()},
      }),
    ).rejects.toThrow(UnknownSubtitleSourceError);
  });

  it('gives a row without a site id no tier-1 key', () => {
    expect(
      readTierOneKey(makeSubtitleCandidate({siteFileId: null})),
    ).toBeNull();
  });
});
