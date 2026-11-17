import {openBackend} from '../lib/backend.js';
import {expect, test as teardown} from '../lib/test.js';

teardown(
  'the flows leave no e2e record behind',
  async ({request}, testInfo) => {
    const backend = await openBackend(request, testInfo);

    expect(await backend.sweep(), 'Leftover e2e records.').toEqual({
      users: [],
      roles: [],
    });
  },
);
