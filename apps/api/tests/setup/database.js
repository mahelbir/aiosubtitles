import {afterAll, beforeAll, beforeEach} from 'vitest';
import {closeTestApp, getTestApp} from '../helpers/app.js';
import {createFixtureTables} from '../helpers/fixture-models.js';
import {resetState} from '../helpers/reset.js';

beforeAll(async () => {
  await getTestApp();
  await createFixtureTables();
});

beforeEach(async () => {
  await resetState();
});

afterAll(async () => {
  await closeTestApp();
});
