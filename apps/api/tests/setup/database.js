import {afterAll, beforeAll, beforeEach} from 'vitest';
import {drainBackgroundQueues} from '../../src/lib/subtitle-background/background-queues.js';
import {closeTestApp, getTestApp} from '../helpers/app.js';
import {createFixtureTables} from '../helpers/fixture-models.js';
import {resetState} from '../helpers/reset.js';

beforeAll(async () => {
  await getTestApp();
  await createFixtureTables();
});

beforeEach(async () => {
  await drainBackgroundQueues();
  await resetState();
});

afterAll(async () => {
  await closeTestApp();
});
