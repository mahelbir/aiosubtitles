import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {ConfidenceWord} from '../../src/constants/subtitle-core-enums.js';
import {buildSubtitleLabel} from '../../src/stremio-row/build-subtitle-label.js';

const OPENSUBTITLES_NAME = SubtitleSource.label(SubtitleSource.OPENSUBTITLES);
const RELEASE_NAME = 'Show.S01E01.1080p.WEB-DL-NTb';
const EXACT_WORD = ConfidenceWord.label(ConfidenceWord.EXACT);
const CLOSE_WORD = ConfidenceWord.label(ConfidenceWord.CLOSE);

describe('buildSubtitleLabel', () => {
  it('orders label parts and notes', () => {
    expect(
      buildSubtitleLabel({
        confidenceWord: ConfidenceWord.EXACT,
        subtitleSourceName: OPENSUBTITLES_NAME,
        noteFlags: {isHearingImpaired: true, isQuotaCostly: true},
        releaseName: RELEASE_NAME,
      }),
    ).toBe(
      `${EXACT_WORD} · ${OPENSUBTITLES_NAME} · HI · Quota · ${RELEASE_NAME}`,
    );
  });

  it('puts every note in the order HI, Forced, MT, Quota', () => {
    expect(
      buildSubtitleLabel({
        confidenceWord: ConfidenceWord.CLOSE,
        subtitleSourceName: OPENSUBTITLES_NAME,
        noteFlags: {
          isQuotaCostly: true,
          isMachineTranslated: true,
          isForced: true,
          isHearingImpaired: true,
        },
        releaseName: RELEASE_NAME,
      }),
    ).toBe(
      `${CLOSE_WORD} · ${OPENSUBTITLES_NAME} · HI · Forced · MT · Quota · ${RELEASE_NAME}`,
    );
  });

  it('skips a missing confidence word, false or null notes and a missing release name', () => {
    expect(
      buildSubtitleLabel({
        confidenceWord: null,
        subtitleSourceName: OPENSUBTITLES_NAME,
        noteFlags: {
          isHearingImpaired: false,
          isForced: null,
          isMachineTranslated: false,
          isQuotaCostly: null,
        },
        releaseName: null,
      }),
    ).toBe(OPENSUBTITLES_NAME);
  });

  it('skips an empty or whitespace-only release name', () => {
    for (const releaseName of ['', '  \t ']) {
      expect(
        buildSubtitleLabel({
          confidenceWord: ConfidenceWord.EXACT,
          subtitleSourceName: OPENSUBTITLES_NAME,
          noteFlags: {isHearingImpaired: true},
          releaseName,
        }),
      ).toBe(`${EXACT_WORD} · ${OPENSUBTITLES_NAME} · HI`);
    }
  });
});
