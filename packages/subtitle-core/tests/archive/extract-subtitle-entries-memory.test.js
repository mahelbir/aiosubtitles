import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  ArchiveReadError,
  extractSubtitleEntries,
} from '../../src/archive/extract-subtitle-entries.js';
import {
  sevenZipEpisodesFixture,
  unknownRarVariantBytes,
} from '../helpers/archive-fixtures.js';

const loadedLibarchive = vi.hoisted(() => ({current: null}));

vi.mock(import('libarchive-wasm'), async importOriginal => {
  const libarchiveExports = await importOriginal();
  return {
    ...libarchiveExports,
    libarchiveWasm: async (...libarchiveArgs) => {
      loadedLibarchive.current = await libarchiveExports.libarchiveWasm(
        ...libarchiveArgs,
      );
      return loadedLibarchive.current;
    },
  };
});

const wasmModule = () => loadedLibarchive.current.module;

describe('extractSubtitleEntries WASM memory', () => {
  beforeAll(async () => {
    await extractSubtitleEntries(sevenZipEpisodesFixture());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('frees the input copy when the archive cannot be opened', async () => {
    const mallocSpy = vi.spyOn(wasmModule(), '_malloc');
    const freeSpy = vi.spyOn(wasmModule(), '_free');
    vi.spyOn(wasmModule(), '_archive_read_new_memory').mockReturnValue(0);

    await expect(
      extractSubtitleEntries(sevenZipEpisodesFixture()),
    ).rejects.toBeInstanceOf(ArchiveReadError);

    const allocatedPointers = mallocSpy.mock.results.map(({value}) => value);
    expect(allocatedPointers).not.toHaveLength(0);
    expect(freeSpy.mock.calls.map(([pointer]) => pointer)).toEqual(
      expect.arrayContaining(allocatedPointers),
    );
  });

  it('throws ArchiveReadError when the WASM heap cannot allocate', async () => {
    vi.spyOn(wasmModule(), '_malloc').mockReturnValue(0);
    const openSpy = vi.spyOn(wasmModule(), '_archive_read_new_memory');

    await expect(
      extractSubtitleEntries(sevenZipEpisodesFixture()),
    ).rejects.toBeInstanceOf(ArchiveReadError);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('never opens a reader for a RAR signature of an unknown variant', async () => {
    const mallocSpy = vi.spyOn(wasmModule(), '_malloc');

    await expect(
      extractSubtitleEntries(unknownRarVariantBytes()),
    ).rejects.toBeInstanceOf(ArchiveReadError);
    expect(mallocSpy).not.toHaveBeenCalled();
  });

  it('keeps the WASM heap flat across many unopenable archives', async () => {
    vi.spyOn(wasmModule(), '_archive_read_new_memory').mockReturnValue(0);
    const megabyteArchive = new Uint8Array(1048576);
    megabyteArchive.set(sevenZipEpisodesFixture());
    await extractSubtitleEntries(megabyteArchive).catch(() => null);
    const heapByteLength = wasmModule().HEAPU8.length;

    for (let callIndex = 0; callIndex < 100; callIndex++) {
      await extractSubtitleEntries(megabyteArchive).catch(() => null);
    }

    expect(wasmModule().HEAPU8.length).toBe(heapByteLength);
  });
});
