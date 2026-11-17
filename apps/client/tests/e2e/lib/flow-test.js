import {backendFixtures} from './backend.js';
import {expect, test as base} from './test.js';

export const test = base.extend(backendFixtures);

export {expect};
