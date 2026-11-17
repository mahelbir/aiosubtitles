import {afterAll, beforeAll, beforeEach} from 'vitest';
import {closeTestApp, getTestApp} from '../helpers/app.js';
import {resetState} from '../helpers/reset.js';

beforeAll(async () => {
  await getTestApp();
});

beforeEach(async () => {
  await resetState();
});

afterAll(async () => {
  await closeTestApp();
});
