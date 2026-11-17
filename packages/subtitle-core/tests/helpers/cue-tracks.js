const MIN_CUE_GAP_MS = 8000;
const CUE_GAP_SPREAD_MS = 4001;
const MIN_CUE_DURATION_MS = 1500;
const CUE_DURATION_SPREAD_MS = 2500;

export const makeCue = (overrides = {}) => ({
  startMs: 0,
  endMs: 2000,
  text: 'Cue text',
  ...overrides,
});

export const makeCueTrack = ({
  cueCount,
  minCueGapMs = MIN_CUE_GAP_MS,
  cueGapSpreadMs = CUE_GAP_SPREAD_MS,
}) => {
  let startMs = minCueGapMs;
  return Array.from({length: cueCount}, (_, cueIndex) => {
    const cue = makeCue({
      startMs,
      endMs:
        startMs +
        MIN_CUE_DURATION_MS +
        ((cueIndex * 613) % CUE_DURATION_SPREAD_MS),
      text: `Line ${cueIndex + 1}`,
    });
    startMs += minCueGapMs + ((cueIndex * 7919) % cueGapSpreadMs);
    return cue;
  });
};

export const mapCueTimes = (cues, mapTimeMs) =>
  cues.map((cue, cueIndex) => ({
    ...cue,
    startMs: mapTimeMs(cue.startMs, cueIndex),
    endMs: mapTimeMs(cue.endMs, cueIndex),
  }));
