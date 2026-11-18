import {sortBy, sum} from 'es-toolkit';
import {strFromU8, strToU8} from 'fflate';
import {describe, expect, it} from 'vitest';
import {
  ARCHIVE_ENTRY_COUNT_MAX,
  ARCHIVE_INFLATED_BYTES_MAX,
  ArchiveError,
  ArchiveLimitError,
  ArchiveReadError,
  extractSubtitleEntries,
} from '../../src/archive/extract-subtitle-entries.js';
import {
  archiveBuilders,
  breakFirstZipDeflateBlock,
  buildStreamedZip,
  buildZip,
  cutZipInsideEntry,
  declareZipEntryCount,
  declareZipInflatedSize,
  episodePackEntries,
  episodeSrtBytes,
  fillerBytes,
  flipByte,
  sevenZipEpisodesFixture,
  unknownRarVariantBytes,
} from '../helpers/archive-fixtures.js';
import {buildStoredRar} from '../helpers/build-stored-rar.js';

const readEntries = archiveEntries =>
  sortBy(archiveEntries, ['entryPath']).map(({entryPath, entryBytes}) => ({
    entryPath,
    entryText: strFromU8(entryBytes),
  }));

const twoEpisodeEntries = () => [
  {entryPath: 'S01E01.srt', entryBytes: episodeSrtBytes('one')},
  {entryPath: 'S01E02.srt', entryBytes: episodeSrtBytes('two')},
];

const inflatedByteLength = archiveEntries =>
  sum(archiveEntries.map(({entryBytes}) => entryBytes.length));

describe('extractSubtitleEntries', () => {
  it('caps an archive at 50 MiB inflated and 500 entries by default', () => {
    expect(ARCHIVE_INFLATED_BYTES_MAX).toBe(52428800);
    expect(ARCHIVE_ENTRY_COUNT_MAX).toBe(500);
  });

  describe.each(archiveBuilders)('from a %s archive', (kindName, build) => {
    it('keeps only the subtitle entries and skips __MACOSX and dot-files', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        build(episodePackEntries()),
      );

      expect(readEntries(subtitleEntries)).toEqual([
        {entryPath: 'S01E01.srt', entryText: strFromU8(episodeSrtBytes('one'))},
        {
          entryPath: 'S01E02.SDH.srt',
          entryText: strFromU8(episodeSrtBytes('two SDH')),
        },
        {entryPath: 'S01E02.srt', entryText: strFromU8(episodeSrtBytes('two'))},
      ]);
      expect(
        subtitleEntries.every(
          ({entryBytes}) => entryBytes instanceof Uint8Array,
        ),
      ).toBe(true);
    });

    it('skips a dot-file outside __MACOSX', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        build([
          {entryPath: '.S01E01.srt', entryBytes: episodeSrtBytes('hidden')},
          {entryPath: 'S01E01.srt', entryBytes: episodeSrtBytes('one')},
        ]),
      );

      expect(subtitleEntries.map(({entryPath}) => entryPath)).toEqual([
        'S01E01.srt',
      ]);
    });

    it('keeps every subtitle extension', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        build(
          ['srt', 'ass', 'ssa', 'vtt', 'sub', 'nfo', 'idx'].map(
            fileExtension => ({
              entryPath: `Movie.2019.${fileExtension}`,
              entryBytes: strToU8(fileExtension),
            }),
          ),
        ),
      );

      expect(
        subtitleEntries.map(({entryPath}) => entryPath).toSorted(),
      ).toEqual([
        'Movie.2019.ass',
        'Movie.2019.srt',
        'Movie.2019.ssa',
        'Movie.2019.sub',
        'Movie.2019.vtt',
      ]);
    });

    it('keeps the folder in an entry path', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        build([
          {
            entryPath: 'Season 1/S01E02.srt',
            entryBytes: episodeSrtBytes('two'),
          },
        ]),
      );

      expect(readEntries(subtitleEntries)).toEqual([
        {
          entryPath: 'Season 1/S01E02.srt',
          entryText: strFromU8(episodeSrtBytes('two')),
        },
      ]);
    });

    it('throws ArchiveLimitError when a subtitle entry inflates past the byte limit', async () => {
      await expect(
        extractSubtitleEntries(
          build([{entryPath: 'S01E01.srt', entryBytes: fillerBytes(1025)}]),
          {inflatedBytesMax: 1024},
        ),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('counts a non-subtitle entry toward the byte limit', async () => {
      await expect(
        extractSubtitleEntries(
          build([
            {entryPath: 'S01E01.srt', entryBytes: fillerBytes(10)},
            {entryPath: 'readme.txt', entryBytes: fillerBytes(1025)},
          ]),
          {inflatedBytesMax: 1024},
        ),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('accepts an archive that inflates to exactly the byte limit', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        build([{entryPath: 'S01E01.srt', entryBytes: fillerBytes(1024)}]),
        {inflatedBytesMax: 1024},
      );

      expect(readEntries(subtitleEntries)).toEqual([
        {entryPath: 'S01E01.srt', entryText: 'a'.repeat(1024)},
      ]);
    });

    it('throws ArchiveLimitError when the archive holds more entries than the limit', async () => {
      await expect(
        extractSubtitleEntries(build(twoEpisodeEntries()), {entryCountMax: 1}),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('counts a non-subtitle entry toward the entry limit', async () => {
      await expect(
        extractSubtitleEntries(
          build([
            ...twoEpisodeEntries(),
            {entryPath: 'readme.txt', entryBytes: strToU8('Enjoy.')},
          ]),
          {entryCountMax: 2},
        ),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('accepts an archive holding exactly the entry limit', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        build(twoEpisodeEntries()),
        {entryCountMax: 2},
      );

      expect(readEntries(subtitleEntries)).toEqual([
        {entryPath: 'S01E01.srt', entryText: strFromU8(episodeSrtBytes('one'))},
        {entryPath: 'S01E02.srt', entryText: strFromU8(episodeSrtBytes('two'))},
      ]);
    });
  });

  it('throws ArchiveLimitError for a ZIP entry whose header understates its inflated size', async () => {
    const lyingZip = declareZipInflatedSize(
      buildZip([{entryPath: 'S01E01.srt', entryBytes: fillerBytes(65536)}]),
      100,
    );

    await expect(
      extractSubtitleEntries(lyingZip, {inflatedBytesMax: 1024}),
    ).rejects.toBeInstanceOf(ArchiveLimitError);
  });

  it('derives both archive errors from ArchiveError', () => {
    expect(new ArchiveLimitError('Over.')).toBeInstanceOf(ArchiveError);
    expect(new ArchiveReadError('Broken.')).toBeInstanceOf(ArchiveError);
  });

  describe.each(archiveBuilders)(
    'normalising a %s archive',
    (kindName, build) => {
      it('turns backslashes in entry paths into slashes', async () => {
        const subtitleEntries = await extractSubtitleEntries(
          build([
            {
              entryPath: 'Season 1\\S01E02.srt',
              entryBytes: episodeSrtBytes('two'),
            },
            {
              entryPath: '__MACOSX\\._S01E02.srt',
              entryBytes: episodeSrtBytes('ghost'),
            },
          ]),
        );

        expect(subtitleEntries.map(({entryPath}) => entryPath)).toEqual([
          'Season 1/S01E02.srt',
        ]);
      });

      it('rejects an archive that holds no entries', async () => {
        await expect(extractSubtitleEntries(build([]))).rejects.toBeInstanceOf(
          ArchiveReadError,
        );
      });
    },
  );

  describe('reading a RAR archive', () => {
    it.each([13, 14])(
      'refuses a declared dictionary of %i bits',
      async dictionaryBits => {
        await expect(
          extractSubtitleEntries(
            buildStoredRar(twoEpisodeEntries(), {dictionaryBits}),
          ),
        ).rejects.toBeInstanceOf(ArchiveReadError);
      },
    );

    it('rejects a declared size that reads back negative', async () => {
      await expect(
        extractSubtitleEntries(
          buildStoredRar([
            {
              entryPath: 'S01E01.srt',
              entryBytes: fillerBytes(10),
              declaredByteLength: 2 ** 31,
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('stops at a declared size past the byte limit before reading', async () => {
      await expect(
        extractSubtitleEntries(
          buildStoredRar([
            {
              entryPath: 'S01E01.srt',
              entryBytes: fillerBytes(10),
              declaredByteLength: 1025,
            },
          ]),
          {inflatedBytesMax: 1024},
        ),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('counts the bytes it reads when the header understates them', async () => {
      await expect(
        extractSubtitleEntries(
          buildStoredRar([
            {
              entryPath: 'S01E01.srt',
              entryBytes: fillerBytes(131072),
              declaredByteLength: 100,
            },
          ]),
          {inflatedBytesMax: 1024},
        ),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('reads an entry larger than one read chunk whole', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        buildStoredRar([
          {entryPath: 'S01E01.srt', entryBytes: fillerBytes(150000)},
        ]),
      );

      expect(readEntries(subtitleEntries)).toEqual([
        {entryPath: 'S01E01.srt', entryText: 'a'.repeat(150000)},
      ]);
    });
  });

  describe('reading a damaged archive', () => {
    it.each([
      ['a truncated ZIP', () => buildZip(twoEpisodeEntries()).subarray(0, 50)],
      [
        'a ZIP with a broken deflate block',
        () => breakFirstZipDeflateBlock(buildZip(twoEpisodeEntries())),
      ],
      [
        'a truncated RAR',
        () => buildStoredRar(twoEpisodeEntries()).subarray(0, 150),
      ],
      [
        'a RAR with a flipped header byte',
        () => flipByte(buildStoredRar(twoEpisodeEntries()), 30),
      ],
      [
        'a 7z cut inside its header',
        () => sevenZipEpisodesFixture().subarray(0, 150),
      ],
      [
        'a 7z cut inside its body',
        () => sevenZipEpisodesFixture().subarray(0, 200),
      ],
      [
        'a 7z with a flipped packed byte',
        () => flipByte(sevenZipEpisodesFixture(), 40),
      ],
    ])('throws ArchiveReadError for %s', async (caseName, build) => {
      const readError = await extractSubtitleEntries(build()).catch(
        thrownError => thrownError,
      );

      expect(readError).toBeInstanceOf(ArchiveReadError);
      expect(readError.message).toMatch(/[.!?]$/u);
    });

    it('keeps the library error as the cause', async () => {
      const readError = await extractSubtitleEntries(
        flipByte(sevenZipEpisodesFixture(), 40),
      ).catch(thrownError => thrownError);

      expect(readError.cause).toBeInstanceOf(Error);
      expect(readError.cause).not.toBeInstanceOf(ArchiveError);
    });
  });

  it('gives no entries for bytes that are not an archive', async () => {
    await expect(
      extractSubtitleEntries(episodeSrtBytes('one')),
    ).resolves.toEqual([]);
  });

  it('rejects a RAR signature of an unknown variant', async () => {
    await expect(
      extractSubtitleEntries(unknownRarVariantBytes()),
    ).rejects.toBeInstanceOf(ArchiveReadError);
  });

  describe.each([
    ['ZIP', buildZip],
    ['streamed ZIP', buildStreamedZip],
  ])('reading a cut %s archive', (kindName, build) => {
    it.each([10, 40])(
      'throws ArchiveReadError when cut %i bytes into entry 2',
      async entryByteOffset => {
        await expect(
          extractSubtitleEntries(
            cutZipInsideEntry(build(twoEpisodeEntries()), 1, entryByteOffset),
          ),
        ).rejects.toBeInstanceOf(ArchiveReadError);
      },
    );

    it.each([
      ['a newline', strToU8('\n')],
      ['100 junk bytes', fillerBytes(100)],
    ])(
      'reads the archive normally with %s appended',
      async (tailName, tailBytes) => {
        const zipBytes = build(twoEpisodeEntries());
        const paddedBytes = new Uint8Array(zipBytes.length + tailBytes.length);
        paddedBytes.set(zipBytes);
        paddedBytes.set(tailBytes, zipBytes.length);

        expect(readEntries(await extractSubtitleEntries(paddedBytes))).toEqual([
          {
            entryPath: 'S01E01.srt',
            entryText: strFromU8(episodeSrtBytes('one')),
          },
          {
            entryPath: 'S01E02.srt',
            entryText: strFromU8(episodeSrtBytes('two')),
          },
        ]);
      },
    );

    it('throws ArchiveReadError when the central directory counts other entries', async () => {
      await expect(
        extractSubtitleEntries(
          declareZipEntryCount(build(twoEpisodeEntries()), 3),
        ),
      ).rejects.toBeInstanceOf(ArchiveReadError);
    });
  });

  it('extracts two RAR archives at once without mixing their entries', async () => {
    await extractSubtitleEntries(buildStoredRar(twoEpisodeEntries()));
    const [firstEntries, secondEntries] = await Promise.all([
      extractSubtitleEntries(
        buildStoredRar([
          {entryPath: 'S01E01.srt', entryBytes: episodeSrtBytes('one')},
        ]),
      ),
      extractSubtitleEntries(
        buildStoredRar([
          {entryPath: 'S01E02.srt', entryBytes: episodeSrtBytes('two')},
        ]),
      ),
    ]);

    expect(readEntries(firstEntries)).toEqual([
      {entryPath: 'S01E01.srt', entryText: strFromU8(episodeSrtBytes('one'))},
    ]);
    expect(readEntries(secondEntries)).toEqual([
      {entryPath: 'S01E02.srt', entryText: strFromU8(episodeSrtBytes('two'))},
    ]);
  });

  describe('from a 7z archive', () => {
    const sevenZipByteLength = inflatedByteLength(twoEpisodeEntries());

    it('extracts both episode entries', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        sevenZipEpisodesFixture(),
      );

      expect(readEntries(subtitleEntries)).toEqual([
        {entryPath: 'S01E01.srt', entryText: strFromU8(episodeSrtBytes('one'))},
        {entryPath: 'S01E02.srt', entryText: strFromU8(episodeSrtBytes('two'))},
      ]);
    });

    it('throws ArchiveLimitError one byte under its inflated size', async () => {
      await expect(
        extractSubtitleEntries(sevenZipEpisodesFixture(), {
          inflatedBytesMax: sevenZipByteLength - 1,
        }),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('accepts exactly its inflated size', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        sevenZipEpisodesFixture(),
        {inflatedBytesMax: sevenZipByteLength},
      );

      expect(subtitleEntries).toHaveLength(2);
    });

    it('throws ArchiveLimitError over the entry limit', async () => {
      await expect(
        extractSubtitleEntries(sevenZipEpisodesFixture(), {entryCountMax: 1}),
      ).rejects.toBeInstanceOf(ArchiveLimitError);
    });

    it('accepts exactly the entry limit', async () => {
      const subtitleEntries = await extractSubtitleEntries(
        sevenZipEpisodesFixture(),
        {entryCountMax: 2},
      );

      expect(subtitleEntries).toHaveLength(2);
    });
  });
});
