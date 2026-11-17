import {openBackend} from '../lib/backend.js';
import {expect, test as setup} from '../lib/test.js';

setup(
  'sweeps the e2e records an interrupted run left behind',
  async ({request}, testInfo) => {
    const backend = await openBackend(request, testInfo);

    await backend.sweep();

    expect(await backend.sweep()).toEqual({users: [], roles: []});
  },
);
