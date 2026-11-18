export const SHUTDOWN_DRAIN_WINDOW_MS = 30000;

export const SHUTDOWN_SETTLE_WINDOW_MS = 5000;

export const SHUTDOWN_CLOSE_MARGIN_MS = 3000;

export const SHUTDOWN_GRACE_MS =
  SHUTDOWN_DRAIN_WINDOW_MS +
  SHUTDOWN_SETTLE_WINDOW_MS +
  SHUTDOWN_CLOSE_MARGIN_MS;

let shutdownSignal = null;

export function startShutdownDeadline() {
  if (!shutdownSignal) {
    const shutdownController = new AbortController();
    setTimeout(
      () => shutdownController.abort(),
      SHUTDOWN_DRAIN_WINDOW_MS,
    ).unref();
    shutdownSignal = shutdownController.signal;
  }
  return shutdownSignal;
}

export function readShutdownSignal() {
  return shutdownSignal;
}

export function waitForAbort(signal) {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), {once: true});
  });
}
