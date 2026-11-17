import {loadWorkspaceEnv} from '@repo/tooling/env.js';

export function loadClientEnv() {
  const ambientPort = process.env.PORT;
  loadWorkspaceEnv();
  const port = process.env.NEXT_PORT ?? ambientPort;
  if (port) {
    process.env.PORT = port;
  } else {
    delete process.env.PORT;
  }
}
