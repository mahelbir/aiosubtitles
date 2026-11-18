import {describe, expect, it} from 'vitest';
import {
  WyzieRefusal,
  findCarriedSubtitle,
  summarizeWyzieVerification,
  toWyzieRefusal,
} from '../live/helpers/wyzie-verification.js';

const LEGACY_ID = '1955024019';
const upsellCue = {startMs: 0, endMs: 6000, text: "You're on the free plan"};
const v3Cues = [
  {startMs: 7000, endMs: 9000, text: 'Wake up, Neo.'},
  {startMs: 9500, endMs: 11000, text: '<i>The Matrix has you.</i>'},
];

function makeInput(overrides = {}) {
  return {
    wyzieSources: {tiered: [{key: 'charlie', name: 'charlie'}], available: []},
    wyzieRowsByCodename: {charlie: [{id: LEGACY_ID}, {id: '42'}]},
    opensubtitlesLegacyIds: [LEGACY_ID],
    v3Ids: [LEGACY_ID],
    wyzieBalanceBefore: 1000,
    wyzieBalanceAfter: 999,
    opensubtitlesRemainingBefore: 950,
    opensubtitlesRemainingAfter: 950,
    firstCues: [upsellCue, v3Cues[0]],
    wyzieCues: [upsellCue, ...v3Cues],
    v3Cues,
    ...overrides,
  };
}

describe('summarizeWyzieVerification', () => {
  it('names the codename whose rows carry an OpenSubtitles legacy id', () => {
    const summary = summarizeWyzieVerification(makeInput());
    expect(summary.opensubtitlesCodename).toBe('charlie');
    expect(summary.isLegacyIdCarried).toBe(true);
  });

  it('compares row ids as strings', () => {
    const summary = summarizeWyzieVerification(
      makeInput({wyzieRowsByCodename: {charlie: [{id: Number(LEGACY_ID)}]}}),
    );
    expect(summary.opensubtitlesCodename).toBe('charlie');
  });

  it('returns null and false when no codename carries a legacy id', () => {
    const summary = summarizeWyzieVerification(
      makeInput({wyzieRowsByCodename: {charlie: [{id: '42'}], xray: []}}),
    );
    expect(summary.opensubtitlesCodename).toBeNull();
    expect(summary.isLegacyIdCarried).toBe(false);
  });

  it('reads an unchanged OpenSubtitles quota as not spent', () => {
    expect(
      summarizeWyzieVerification(makeInput()).isOpensubtitlesQuotaSpent,
    ).toBe(false);
  });

  it('reads a lower OpenSubtitles quota as spent', () => {
    expect(
      summarizeWyzieVerification(makeInput({opensubtitlesRemainingAfter: 949}))
        .isOpensubtitlesQuotaSpent,
    ).toBe(true);
  });

  it('takes the Wyzie download cost from the balance drop', () => {
    expect(summarizeWyzieVerification(makeInput()).wyzieDownloadCost).toBe(1);
  });

  it('finds the upsell cue in the first six seconds', () => {
    expect(summarizeWyzieVerification(makeInput()).hasUpsellCue).toBe(true);
  });

  it('ignores the upsell text after six seconds', () => {
    expect(
      summarizeWyzieVerification(
        makeInput({firstCues: [{...upsellCue, startMs: 6000, endMs: 8000}]}),
      ).hasUpsellCue,
    ).toBe(false);
  });

  it('reads the Wyzie copy as unaltered when only the upsell cue differs', () => {
    expect(summarizeWyzieVerification(makeInput()).hasAlteredCues).toBe(false);
  });

  it('reads the Wyzie copy as altered when one line changed', () => {
    expect(
      summarizeWyzieVerification(
        makeInput({
          wyzieCues: [
            upsellCue,
            v3Cues[0],
            {...v3Cues[1], text: 'The Matrix owns you.'},
          ],
        }),
      ).hasAlteredCues,
    ).toBe(true);
  });

  it('reads the Wyzie copy as altered when the cue count differs', () => {
    expect(
      summarizeWyzieVerification(makeInput({wyzieCues: [upsellCue, v3Cues[0]]}))
        .hasAlteredCues,
    ).toBe(true);
  });

  it('reads equal timings after the upsell cue as not shifted', () => {
    expect(summarizeWyzieVerification(makeInput()).hasShiftedTimings).toBe(
      false,
    );
  });

  it('reads one moved cue as shifted timings', () => {
    expect(
      summarizeWyzieVerification(
        makeInput({
          wyzieCues: [
            upsellCue,
            v3Cues[0],
            {...v3Cues[1], startMs: 9600, endMs: 11100},
          ],
        }),
      ).hasShiftedTimings,
    ).toBe(true);
  });

  it('keeps a text change out of the timing flag', () => {
    const summary = summarizeWyzieVerification(
      makeInput({
        wyzieCues: [upsellCue, v3Cues[0], {...v3Cues[1], text: 'Changed.'}],
      }),
    );
    expect(summary.hasAlteredCues).toBe(true);
    expect(summary.hasShiftedTimings).toBe(false);
  });

  it('returns null cue flags when the v3 copy is missing', () => {
    const summary = summarizeWyzieVerification(makeInput({v3Cues: null}));
    expect(summary.hasAlteredCues).toBeNull();
    expect(summary.hasShiftedTimings).toBeNull();
  });

  it('names the Jimaku codename and its availability to the key', () => {
    const summary = summarizeWyzieVerification(
      makeInput({
        wyzieSources: {
          tiered: [
            {key: 'charlie', name: 'charlie'},
            {key: 'mike', name: 'mike', description: 'Anime from JIMAKU'},
          ],
          available: ['charlie', 'mike'],
        },
      }),
    );
    expect(summary.jimakuCodename).toBe('mike');
    expect(summary.isJimakuAvailableToKey).toBe(true);
  });

  it('marks a Jimaku codename outside the key plan as unavailable', () => {
    const summary = summarizeWyzieVerification(
      makeInput({
        wyzieSources: {
          tiered: [{key: 'mike', name: 'mike', label: 'Jimaku'}],
          available: ['charlie'],
        },
      }),
    );
    expect(summary.jimakuCodename).toBe('mike');
    expect(summary.isJimakuAvailableToKey).toBe(false);
  });

  it('returns null and false when no source names Jimaku', () => {
    const summary = summarizeWyzieVerification(makeInput());
    expect(summary.jimakuCodename).toBeNull();
    expect(summary.isJimakuAvailableToKey).toBe(false);
  });
});

describe('toWyzieRefusal', () => {
  it.each([
    ['Invalid API key', WyzieRefusal.INVALID_KEY],
    ['Provider not available on free plan', WyzieRefusal.FREE_PLAN],
    ['Key on hold', WyzieRefusal.KEY_ON_HOLD],
    ['Something else', WyzieRefusal.UNKNOWN],
  ])('maps the 403 message %s', (refusalMessage, wyzieRefusal) => {
    expect(toWyzieRefusal({code: 403, message: refusalMessage})).toBe(
      wyzieRefusal,
    );
  });

  it('maps a 403 without a body as unknown', () => {
    expect(toWyzieRefusal(null)).toBe(WyzieRefusal.UNKNOWN);
  });
});

describe('findCarriedSubtitle', () => {
  it('prefers a row whose id is both a legacy id and a v3 id', () => {
    expect(
      findCarriedSubtitle({
        wyzieRowsByCodename: {charlie: [{id: '7'}, {id: LEGACY_ID}]},
        opensubtitlesLegacyIds: ['7', LEGACY_ID],
        v3Ids: [LEGACY_ID],
      }),
    ).toEqual({codename: 'charlie', siteFileId: LEGACY_ID});
  });

  it('returns null when no row carries a legacy id', () => {
    expect(
      findCarriedSubtitle({
        wyzieRowsByCodename: {charlie: [{id: '42'}]},
        opensubtitlesLegacyIds: [LEGACY_ID],
        v3Ids: [],
      }),
    ).toBeNull();
  });
});
