import {Enum} from 'enum-plus';
import {isEqual} from 'es-toolkit';
import {normalizeCueText} from '@repo/subtitle-core/file-format/normalize-cue-text.js';

export const WyzieRefusal = Enum({
  INVALID_KEY: {value: 'invalid-key'},
  FREE_PLAN: {value: 'free-plan'},
  KEY_ON_HOLD: {value: 'key-on-hold'},
  UNKNOWN: {value: 'unknown'},
});

const WYZIE_REFUSAL_PATTERNS = [
  {messagePattern: /invalid api key/i, wyzieRefusal: WyzieRefusal.INVALID_KEY},
  {messagePattern: /free plan/i, wyzieRefusal: WyzieRefusal.FREE_PLAN},
  {messagePattern: /on hold/i, wyzieRefusal: WyzieRefusal.KEY_ON_HOLD},
];
const UPSELL_WINDOW_MS = 6000;
const UPSELL_TEXT_PATTERN = /free plan/i;
const JIMAKU_PATTERN = /jimaku/i;
const SOURCE_TEXT_FIELDS = ['name', 'label', 'description'];

function isUpsellCue({startMs, text}) {
  return startMs < UPSELL_WINDOW_MS && UPSELL_TEXT_PATTERN.test(text);
}

function toCueTexts(cues) {
  return cues
    .filter(cue => !isUpsellCue(cue))
    .map(({text}) => normalizeCueText(text));
}

function toCueTimings(cues) {
  return cues
    .filter(cue => !isUpsellCue(cue))
    .map(({startMs, endMs}) => [startMs, endMs]);
}

export function toWyzieRefusal(refusalBody) {
  const refusalMessage = String(refusalBody?.message ?? '');
  return (
    WYZIE_REFUSAL_PATTERNS.find(({messagePattern}) =>
      messagePattern.test(refusalMessage),
    )?.wyzieRefusal ?? WyzieRefusal.UNKNOWN
  );
}

function findCarriedRows({wyzieRowsByCodename, opensubtitlesLegacyIds}) {
  const legacyIds = new Set(opensubtitlesLegacyIds.map(String));
  return Object.entries(wyzieRowsByCodename).flatMap(([codename, rows]) =>
    rows
      .map(({id}) => String(id))
      .filter(siteFileId => legacyIds.has(siteFileId))
      .map(siteFileId => ({codename, siteFileId})),
  );
}

export function findCarriedSubtitle({
  wyzieRowsByCodename,
  opensubtitlesLegacyIds,
  v3Ids,
}) {
  const carriedRows = findCarriedRows({
    wyzieRowsByCodename,
    opensubtitlesLegacyIds,
  });
  const v3IdSet = new Set(v3Ids.map(String));
  return (
    carriedRows.find(({siteFileId}) => v3IdSet.has(siteFileId)) ??
    carriedRows[0] ??
    null
  );
}

function findJimakuCodename({tiered = []}) {
  return (
    tiered.find(sourceEntry =>
      SOURCE_TEXT_FIELDS.some(fieldName =>
        JIMAKU_PATTERN.test(sourceEntry[fieldName] ?? ''),
      ),
    )?.key ?? null
  );
}

function toCountDrop(countBefore, countAfter) {
  return Number.isFinite(countBefore) && Number.isFinite(countAfter)
    ? countBefore - countAfter
    : null;
}

function hasCueDifference(wyzieCues, v3Cues, toCueFacts) {
  if (wyzieCues === null || v3Cues === null) {
    return null;
  }
  return !isEqual(toCueFacts(wyzieCues), toCueFacts(v3Cues));
}

export function summarizeWyzieVerification({
  wyzieSources,
  wyzieRowsByCodename,
  opensubtitlesLegacyIds,
  v3Ids,
  wyzieBalanceBefore,
  wyzieBalanceAfter,
  opensubtitlesRemainingBefore,
  opensubtitlesRemainingAfter,
  firstCues,
  wyzieCues,
  v3Cues,
}) {
  const carriedSubtitle = findCarriedSubtitle({
    wyzieRowsByCodename,
    opensubtitlesLegacyIds,
    v3Ids,
  });
  const jimakuCodename = findJimakuCodename(wyzieSources);
  return {
    opensubtitlesCodename: carriedSubtitle?.codename ?? null,
    isLegacyIdCarried: carriedSubtitle !== null,
    isOpensubtitlesQuotaSpent:
      toCountDrop(opensubtitlesRemainingBefore, opensubtitlesRemainingAfter) >
      0,
    wyzieDownloadCost: toCountDrop(wyzieBalanceBefore, wyzieBalanceAfter),
    hasUpsellCue: firstCues.some(isUpsellCue),
    hasAlteredCues: hasCueDifference(wyzieCues, v3Cues, toCueTexts),
    hasShiftedTimings: hasCueDifference(wyzieCues, v3Cues, toCueTimings),
    jimakuCodename,
    isJimakuAvailableToKey:
      jimakuCodename !== null &&
      (wyzieSources.available ?? []).includes(jimakuCodename),
  };
}
