import {describe, expect, it} from 'vitest';
import {ADDON_MANIFEST_VERSION, ADDON_NAME} from '../src/constants/app.js';

describe('ADDON_NAME', () => {
  it('is the name the manifest and the source User-Agent carry', () => {
    expect(ADDON_NAME).toBe('AIOSubtitles');
  });
});

describe('ADDON_MANIFEST_VERSION', () => {
  it('is the semver release the manifest and the source User-Agent carry', () => {
    expect(ADDON_MANIFEST_VERSION).toBe('1.0.0');
  });
});
