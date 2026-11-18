import {describe, expect, it} from 'vitest';
import {detectArchiveKind} from '../../src/archive/detect-archive-kind.js';
import {buildStoredRar} from '../helpers/build-stored-rar.js';
import {
  buildZip,
  episodePackEntries,
  episodeSrtBytes,
  sevenZipEpisodesFixture,
  unknownRarVariantBytes,
} from '../helpers/archive-fixtures.js';

describe('detectArchiveKind', () => {
  it('detects a ZIP archive', () => {
    expect(detectArchiveKind(buildZip(episodePackEntries()))).toBe('zip');
  });

  it('detects a RAR archive', () => {
    expect(detectArchiveKind(buildStoredRar(episodePackEntries()))).toBe('rar');
  });

  it('detects the RAR4 signature', () => {
    expect(
      detectArchiveKind(
        Uint8Array.of(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0xcf),
      ),
    ).toBe('rar');
  });

  it('returns null for a RAR signature of an unknown variant', () => {
    expect(detectArchiveKind(unknownRarVariantBytes())).toBeNull();
  });

  it('detects a 7z archive', () => {
    expect(detectArchiveKind(sevenZipEpisodesFixture())).toBe('seven-zip');
  });

  it('returns null for plain SRT bytes', () => {
    expect(detectArchiveKind(episodeSrtBytes('one'))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(detectArchiveKind(new Uint8Array(0))).toBeNull();
  });
});
