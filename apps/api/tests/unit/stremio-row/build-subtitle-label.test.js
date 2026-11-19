import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {ConfidenceWord} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {buildSubtitleLabel} from '../../../src/lib/stremio-row/build-subtitle-label.js';

const OPENSUBTITLES_NAME = SubtitleSource.label(SubtitleSource.OPENSUBTITLES);
const RELEASE_NAME = 'Show.S01E01.1080p.WEB-DL-NTb';
const EXACT_WORD = ConfidenceWord.label(ConfidenceWord.EXACT);
const CLOSE_WORD = ConfidenceWord.label(ConfidenceWord.CLOSE);

describe('buildSubtitleLabel', () => {
  it('orders label parts and notes, a quota-costly row leading with $', () => {
    expect(
      buildSubtitleLabel({
        confidenceWord: ConfidenceWord.EXACT,
        subtitleSourceName: OPENSUBTITLES_NAME,
        noteFlags: {isHearingImpaired: true, isQuotaCostly: true},
        releaseName: RELEASE_NAME,
      }),
    ).toBe(`$ · ${EXACT_WORD} · ${OPENSUBTITLES_NAME} · HI · ${RELEASE_NAME}`);
  });

  it('leads with $ before the source name when there is no confidence word', () => {
    expect(
      buildSubtitleLabel({
        confidenceWord: null,
        subtitleSourceName: OPENSUBTITLES_NAME,
        noteFlags: {isQuotaCostly: true},
        releaseName: RELEASE_NAME,
      }),
    ).toBe(`$ · ${OPENSUBTITLES_NAME} · ${RELEASE_NAME}`);
  });

  it('puts every note in the order HI, Forced, MT', () => {
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
      `$ · ${CLOSE_WORD} · ${OPENSUBTITLES_NAME} · HI · Forced · MT · ${RELEASE_NAME}`,
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
