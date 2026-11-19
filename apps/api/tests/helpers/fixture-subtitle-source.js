import {vi} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  ANY_SUBTITLE_LANGUAGE,
  SubtitleSourceVideoType,
} from '../../src/lib/subtitle-sources/subtitle-source-contract.js';

export function createFixtureSubtitleSourceClient(overrides = {}) {
  return {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    credentialKinds: [],
    isSearchHashSensitive: false,
    servedLanguageCodes: ANY_SUBTITLE_LANGUAGE,
    servedVideoTypes: SubtitleSourceVideoType.values,
    downloadBudgets: [],
    isAvailable: vi.fn(() => true),
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
