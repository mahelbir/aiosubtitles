import {vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

export function createFixtureSubtitleSourceClient(overrides = {}) {
  return {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    credentialKinds: [],
    isSearchHashSensitive: false,
    downloadBudgets: [],
    canSearchWithoutCredential: vi.fn(() => true),
    canDownloadWithoutCredential: vi.fn(() => true),
    searchSubtitles: vi.fn(async () => []),
    downloadSubtitle: vi.fn(async () => ({
      fileBytes: new Uint8Array(),
      fileNameHint: null,
      extractedEntryPath: null,
    })),
    ...overrides,
  };
}
