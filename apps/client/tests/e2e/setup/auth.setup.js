import {mkdir, writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import {ADMIN_ACCOUNT, signIn} from '../lib/backend.js';
import {
  ADMIN_STORAGE_STATE_PATH,
  getSessionStorageState,
  toPersistedSession,
} from '../lib/session.js';
import {test as setup} from '../lib/test.js';

setup(
  'opens the seeded admin session the flows start from',
  async ({request, baseURL}) => {
    const session = toPersistedSession(await signIn(request, ADMIN_ACCOUNT));
    await mkdir(path.dirname(ADMIN_STORAGE_STATE_PATH), {recursive: true});
    await writeFile(
      ADMIN_STORAGE_STATE_PATH,
      JSON.stringify(getSessionStorageState(baseURL, session)),
    );
  },
);
