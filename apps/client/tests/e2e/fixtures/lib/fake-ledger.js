let fetchCount = 0;

export function readFakeLedger() {
  fetchCount += 1;
  return {fetchCount};
}
