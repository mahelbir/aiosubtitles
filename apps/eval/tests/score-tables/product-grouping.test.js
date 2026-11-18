import {describe, expect, it} from 'vitest';
import {NEAR_DUPLICATE_TEXT_SIMILARITY_MIN} from '@repo/subtitle-core/deduplication/are-cues-near-duplicate.js';
import {runProductGrouping} from '../../src/score-tables/dedup-run.js';
import {makeSubtitleCandidate} from '../commands/helpers/scoring-inputs.js';

const makeFileCandidate = (urlCode, subtitleSource, siteFileId) =>
  makeSubtitleCandidate({
    urlCode,
    subtitleSource,
    siteFileId,
    fileFacts: {
      contentKey: 'same-content',
      isFileValid: true,
      normalizedCues: null,
    },
  });

describe('runProductGrouping', () => {
  it('keeps each video’s copy counts apart when two videos share a url code', () => {
    const {copyCountByVideoCode, missingSiteIdRowCount} = runProductGrouping({
      videos: [
        {
          videoCode: 'V01',
          videoContext: {videoRelease: null},
          candidates: [
            makeFileCandidate('shared-code', 'subdl', '1'),
            makeFileCandidate('other-code', 'subsource', '2'),
            makeFileCandidate('third-code', 'altyazidb', '3'),
          ],
        },
        {
          videoCode: 'V02',
          videoContext: {videoRelease: null},
          candidates: [makeFileCandidate('shared-code', 'subdl', '1')],
        },
      ],
      textSimilarityMin: NEAR_DUPLICATE_TEXT_SIMILARITY_MIN,
    });

    expect(copyCountByVideoCode.get('V01').get('shared-code')).toBe(2);
    expect(copyCountByVideoCode.get('V02').get('shared-code')).toBe(0);
    expect(missingSiteIdRowCount).toBe(0);
  });
});
