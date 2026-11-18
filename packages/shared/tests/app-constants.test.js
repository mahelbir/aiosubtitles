import {describe, expect, it} from 'vitest';
import {ADDON_MANIFEST_VERSION} from '../src/constants/app.js';

describe('ADDON_MANIFEST_VERSION', () => {
  it('is the semver release the manifest and the source User-Agent carry', () => {
    expect(ADDON_MANIFEST_VERSION).toBe('1.0.0');
  });
});
