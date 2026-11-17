const STATE_INCREMENT = 0x6d2b79f5;
const OUTPUT_RANGE = 4294967296;

export const mulberry32 = seed => {
  let state = seed | 0;
  return () => {
    state = (state + STATE_INCREMENT) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / OUTPUT_RANGE;
  };
};
