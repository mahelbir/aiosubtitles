import {strToU8} from 'fflate';
import {describe, expect, it} from 'vitest';
import {extractSubtitleEntries} from '../../src/archive/extract-subtitle-entries.js';
import {
  listArchiveEntriesForVideo,
  pickArchiveEntryForVideo,
} from '../../src/archive/pick-archive-entry.js';
import {
  archiveBuilders,
  episodePackEntries,
  episodeSrtBytes,
  sevenZipEpisodesFixture,
} from '../helpers/archive-fixtures.js';

const extractEntryPaths = async archiveBytes =>
  (await extractSubtitleEntries(archiveBytes)).map(({entryPath}) => entryPath);

const episodeVideo = episodeNumber => ({seasonNumber: 1, episodeNumber});
const movieVideo = {seasonNumber: null, episodeNumber: null};

describe('pickArchiveEntryForVideo', () => {
  describe.each(archiveBuilders)('from a %s archive', (kindName, build) => {
    it('picks S01E02.srt for episode 2 and lists both episode 2 entries', async () => {
      const entryPaths = await extractEntryPaths(build(episodePackEntries()));

      expect(pickArchiveEntryForVideo({entryPaths, ...episodeVideo(2)})).toBe(
        'S01E02.srt',
      );
      expect(
        listArchiveEntriesForVideo({entryPaths, ...episodeVideo(2)}).toSorted(),
      ).toEqual(['S01E02.SDH.srt', 'S01E02.srt']);
    });

    it('gives null for episode 3', async () => {
      const entryPaths = await extractEntryPaths(build(episodePackEntries()));

      expect(
        pickArchiveEntryForVideo({entryPaths, ...episodeVideo(3)}),
      ).toBeNull();
      expect(
        listArchiveEntriesForVideo({entryPaths, ...episodeVideo(3)}),
      ).toEqual([]);
    });

    it('picks the only .srt of a movie archive that also holds a .nfo', async () => {
      const entryPaths = await extractEntryPaths(
        build([
          {
            entryPath: 'Movie.2019.1080p.BluRay.x264-GROUP.srt',
            entryBytes: episodeSrtBytes('one'),
          },
          {
            entryPath: 'Movie.2019.1080p.BluRay.x264-GROUP.nfo',
            entryBytes: strToU8('Release notes.'),
          },
        ]),
      );

      expect(pickArchiveEntryForVideo({entryPaths, ...movieVideo})).toBe(
        'Movie.2019.1080p.BluRay.x264-GROUP.srt',
      );
    });
  });

  it('picks S01E02.srt for episode 2 from a 7z archive', async () => {
    const entryPaths = await extractEntryPaths(sevenZipEpisodesFixture());

    expect(pickArchiveEntryForVideo({entryPaths, ...episodeVideo(2)})).toBe(
      'S01E02.srt',
    );
    expect(
      pickArchiveEntryForVideo({entryPaths, ...episodeVideo(3)}),
    ).toBeNull();
  });

  it('picks the episode inside a season folder', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Season 1/S01E01.srt', 'Season 1/S01E02.srt'],
        ...episodeVideo(2),
      }),
    ).toBe('Season 1/S01E02.srt');
  });

  it('reads the season from the folder when the file name has none', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Season 1/E05.srt', 'Season 2/E05.srt'],
        seasonNumber: 2,
        episodeNumber: 5,
      }),
    ).toBe('Season 2/E05.srt');
  });

  it('gives null when the folder season is another season', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Season 2/E05.srt'],
        seasonNumber: 1,
        episodeNumber: 5,
      }),
    ).toBeNull();
  });

  it('keeps the episode of the requested season folder', () => {
    expect(
      listArchiveEntriesForVideo({
        entryPaths: ['Show.S01/S01E05.srt', 'Show.S02/S02E05.srt'],
        seasonNumber: 2,
        episodeNumber: 5,
      }),
    ).toEqual(['Show.S02/S02E05.srt']);
  });

  it('accepts any season when no season is named anywhere', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Subs/E05.srt'],
        seasonNumber: 3,
        episodeNumber: 5,
      }),
    ).toBe('Subs/E05.srt');
  });

  it('prefers a name without an HI marker over a shorter path', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['S01E02.HI.srt', 'Show.Name.S01E02.srt'],
        ...episodeVideo(2),
      }),
    ).toBe('Show.Name.S01E02.srt');
  });

  it('ranks a forced-only name after a full one', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Movie.forced.srt', 'Movie.2019.1080p.srt'],
        ...movieVideo,
      }),
    ).toBe('Movie.2019.1080p.srt');
  });

  it('gives null for the right episode number in another season', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['S02E02.srt'],
        ...episodeVideo(2),
      }),
    ).toBeNull();
  });

  it('prefers a name without an SDH marker over a shorter path', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['S01E02.SDH.srt', 'Show.Name.S01E02.srt'],
        ...episodeVideo(2),
      }),
    ).toBe('Show.Name.S01E02.srt');
  });

  it('prefers the shorter path between two plain names', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Subs/Show.S01E02.srt', 'Show.S01E02.srt'],
        ...episodeVideo(2),
      }),
    ).toBe('Show.S01E02.srt');
  });

  it('breaks a length tie lexically', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Show.S01E02.b.srt', 'Show.S01E02.a.srt'],
        ...episodeVideo(2),
      }),
    ).toBe('Show.S01E02.a.srt');
  });

  it('picks the one subtitle entry of a movie', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Movie.2019.srt'],
        ...movieVideo,
      }),
    ).toBe('Movie.2019.srt');
  });

  it('gives null for CD-split movie entries', () => {
    expect(
      pickArchiveEntryForVideo({
        entryPaths: ['Movie.2019.CD1.srt', 'Movie.2019.CD2.srt'],
        ...movieVideo,
      }),
    ).toBeNull();
  });
});
