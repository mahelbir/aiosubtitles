import {vi} from 'vitest';

/* A write from another process never reaches this one's memo; only a read past
   the memo window shows what Redis now holds. The clock only moves forward, so
   each read also lands past whatever an earlier one memoized. */
const MEMO_WINDOW_STEP = 60_000;

let clockOffset = 0;

export async function readPastMemoWindow(read) {
  clockOffset += MEMO_WINDOW_STEP;
  vi.useFakeTimers({toFake: ['Date'], now: Date.now() + clockOffset});
  try {
    return await read();
  } finally {
    vi.useRealTimers();
  }
}
