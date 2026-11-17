import {describe, expect, it} from 'vitest';
import {groupDuplicates} from '../../src/deduplication/group-duplicates.js';
import {
  NEAR_DUPLICATE_SCENE_LINES,
  OTHER_SCENE_LINES,
  SCENE_LINES,
  makeCues,
  makeDistinctCandidate as makeRow,
  makeFileFacts,
} from '../helpers/deduplication-fixtures.js';

const TEXT_SIMILARITY_MIN = 0.9;

const urlCodesOf = rows => rows.map(row => row.urlCode).sort();

const groupUrlCodes = groups =>
  groups
    .map(group => urlCodesOf(group.members))
    .sort((left, right) => left[0].localeCompare(right[0]));

const findGroup = (groups, urlCode) =>
  groups.find(group =>
    group.members.some(member => member.urlCode === urlCode),
  );

const runGrouping = (candidates, textSimilarityMin = TEXT_SIMILARITY_MIN) =>
  groupDuplicates({candidates, textSimilarityMin});

const runSingleGroup = candidates => {
  const groups = runGrouping(candidates);
  expect(groups).toHaveLength(1);
  return groups[0];
};

describe('groupDuplicates', () => {
  it('puts every candidate into exactly one group with the representative among its members', () => {
    const candidates = [makeRow('a'), makeRow('b'), makeRow('c')];

    const groups = runGrouping(candidates);

    expect(groupUrlCodes(groups)).toEqual([['a'], ['b'], ['c']]);
    for (const group of groups) {
      expect(group.members).toContain(group.representative);
    }
  });

  it('gives a single-member group no duplicate tier', () => {
    const groups = runGrouping([makeRow('a')]);

    expect(groups).toHaveLength(1);
    expect(groups[0].representative.urlCode).toBe('a');
    expect(groups[0].duplicateTier).toBeNull();
  });

  describe('tier 1', () => {
    it('merges the same site id seen twice', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          archiveEntryPath: '',
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          archiveEntryPath: '',
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(1);
    });

    it('keeps a pack row apart from a file inside the same pack', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          archiveEntryPath: '',
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          archiveEntryPath: 'Show.S01E01.srt',
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });

    it('keeps the same site id from two subtitle sources apart', () => {
      const candidates = [
        makeRow('a', {subtitleSource: 'subdl', siteFileId: '777'}),
        makeRow('b', {subtitleSource: 'subsource', siteFileId: '777'}),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });

    it('lets an invalid file join through its site id', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'key-a'}),
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'key-b', isFileValid: false}),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(1);
    });

    it('merges two rows with the same site file url', () => {
      const siteFileUrl = 'https://subtitles.example/files/777';
      const candidates = [
        makeRow('a', {subtitleSource: 'opensubtitles', siteFileUrl}),
        makeRow('b', {subtitleSource: 'wyzie', siteFileUrl}),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(1);
    });
  });

  describe('tier 2', () => {
    it('merges a row whose alias names another row url code', () => {
      const candidates = [
        makeRow('b', {subtitleSource: 'wyzie', aliasOfUrlCode: 'a'}),
        makeRow('a', {subtitleSource: 'opensubtitles'}),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(2);
    });

    it('lets a row without file facts join through its alias', () => {
      const candidates = [
        makeRow('a', {fileFacts: makeFileFacts({contentKey: 'key-a'})}),
        makeRow('b', {
          subtitleSource: 'wyzie',
          aliasOfUrlCode: 'a',
          fileFacts: null,
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(2);
    });

    it('links nothing through an alias that names a row outside the list', () => {
      const candidates = [
        makeRow('a', {subtitleSource: 'opensubtitles'}),
        makeRow('b', {subtitleSource: 'wyzie', aliasOfUrlCode: 'missing'}),
        makeRow('c', {subtitleSource: 'wyzie', aliasOfUrlCode: 'missing'}),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a'], ['b'], ['c']]);
      expect(groups.map(group => group.duplicateTier)).toEqual([
        null,
        null,
        null,
      ]);
    });
  });

  describe('tier 3', () => {
    it('merges equal content keys from two sources and picks the older row', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          firstSeenAt: '2026-03-01T00:00:00.000Z',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
        makeRow('b', {
          subtitleSource: 'subsource',
          firstSeenAt: '2026-01-01T00:00:00.000Z',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(3);
      expect(groups[0].representative.urlCode).toBe('b');
    });

    it('keeps equal content keys apart when one file is invalid', () => {
      const candidates = [
        makeRow('a', {fileFacts: makeFileFacts({contentKey: 'shared-key'})}),
        makeRow('b', {
          fileFacts: makeFileFacts({
            contentKey: 'shared-key',
            isFileValid: false,
          }),
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });
  });

  describe('tier 4', () => {
    it('merges equal timings with one changed word at 0.9', () => {
      const candidates = [
        makeRow('a', {
          fileFacts: makeFileFacts({
            contentKey: 'key-a',
            normalizedCues: makeCues(),
          }),
        }),
        makeRow('b', {
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues(NEAR_DUPLICATE_SCENE_LINES),
          }),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(4);
    });

    it('merges a pair whose mean similarity is exactly the minimum', () => {
      const tenLines = [...SCENE_LINES, ...SCENE_LINES.slice(0, 2)];
      const candidates = [
        makeRow('a', {
          fileFacts: makeFileFacts({
            contentKey: 'key-a',
            normalizedCues: makeCues(tenLines),
          }),
        }),
        makeRow('b', {
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues([...tenLines.slice(0, 9), 'zzzz']),
          }),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b']]);
      expect(groups[0].duplicateTier).toBe(4);
    });

    it('uses the given text similarity minimum', () => {
      const candidates = [
        makeRow('a', {
          fileFacts: makeFileFacts({
            contentKey: 'key-a',
            normalizedCues: makeCues(),
          }),
        }),
        makeRow('b', {
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues(NEAR_DUPLICATE_SCENE_LINES),
          }),
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates, 0.999))).toEqual([
        ['a'],
        ['b'],
      ]);
    });

    it('keeps equal text with timings shifted by 1 s apart', () => {
      const candidates = [
        makeRow('a', {
          fileFacts: makeFileFacts({
            contentKey: 'key-a',
            normalizedCues: makeCues(),
          }),
        }),
        makeRow('b', {
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues(SCENE_LINES, 1000),
          }),
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });

    it('keeps identical cues apart when one file is invalid', () => {
      const candidates = [
        makeRow('a', {fileFacts: makeFileFacts({contentKey: 'key-a'})}),
        makeRow('b', {
          fileFacts: makeFileFacts({contentKey: 'key-b', isFileValid: false}),
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });

    it('never merges two valid files whose cue lists are empty', () => {
      const candidates = [
        makeRow('a', {
          fileFacts: makeFileFacts({contentKey: 'key-a', normalizedCues: []}),
        }),
        makeRow('b', {
          fileFacts: makeFileFacts({contentKey: 'key-b', normalizedCues: []}),
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });

    it('skips valid files whose cues are missing', () => {
      const candidates = [
        makeRow('a', {
          fileFacts: {
            ...makeFileFacts({contentKey: 'key-a'}),
            normalizedCues: null,
          },
        }),
        makeRow('b', {
          fileFacts: {
            ...makeFileFacts({contentKey: 'key-b'}),
            normalizedCues: null,
          },
        }),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });
  });

  describe('never the same', () => {
    it('keeps equal release names with different content keys apart', () => {
      const releaseNames = ['Show.S01E01.1080p.WEB-DL-NTb'];
      const candidates = [
        makeRow('a', {
          releaseNames,
          fileFacts: makeFileFacts({
            contentKey: 'key-a',
            normalizedCues: makeCues(),
          }),
        }),
        makeRow('b', {
          releaseNames,
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues(OTHER_SCENE_LINES),
          }),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a'], ['b']]);
      expect(groups.map(group => group.duplicateTier)).toEqual([null, null]);
    });

    it('keeps equal release names apart when neither file is downloaded', () => {
      const releaseNames = ['Show.S01E01.1080p.WEB-DL-NTb'];
      const candidates = [
        makeRow('a', {releaseNames, fileFacts: null}),
        makeRow('b', {releaseNames, fileFacts: null}),
      ];

      expect(groupUrlCodes(runGrouping(candidates))).toEqual([['a'], ['b']]);
    });
  });

  describe('representative', () => {
    it('breaks a first-seen tie with the smaller url code', () => {
      const firstSeenAt = '2026-02-01T00:00:00.000Z';
      const candidates = [
        makeRow('b-code', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          firstSeenAt,
        }),
        makeRow('a-code', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          firstSeenAt,
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groups).toHaveLength(1);
      expect(groups[0].representative.urlCode).toBe('a-code');
    });

    it('breaks a first-seen tie by url code across three rows', () => {
      const firstSeenAt = '2026-02-01T00:00:00.000Z';
      const candidates = ['m-code', 'c-code', 'x-code'].map(urlCode =>
        makeRow(urlCode, {
          subtitleSource: 'subdl',
          siteFileId: '777',
          firstSeenAt,
        }),
      );

      expect(runSingleGroup(candidates).representative.urlCode).toBe('c-code');
    });

    it('prefers the earliest first-seen row over a smaller url code', () => {
      const candidates = [
        makeRow('a-code', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          firstSeenAt: '2026-05-01T00:00:00.000Z',
        }),
        makeRow('z-code', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          firstSeenAt: '2026-04-01T00:00:00.000Z',
        }),
      ];

      expect(runSingleGroup(candidates).representative.urlCode).toBe('z-code');
    });

    it('picks the earliest row of a tier-4 group too', () => {
      const candidates = [
        makeRow('a', {
          firstSeenAt: '2026-06-01T00:00:00.000Z',
          fileFacts: makeFileFacts({
            contentKey: 'key-a',
            normalizedCues: makeCues(),
          }),
        }),
        makeRow('b', {
          firstSeenAt: '2026-02-01T00:00:00.000Z',
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues(NEAR_DUPLICATE_SCENE_LINES),
          }),
        }),
      ];

      expect(runSingleGroup(candidates).representative.urlCode).toBe('b');
    });
  });

  describe('transitive groups', () => {
    it('joins rows linked only through a middle row', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: null,
        }),
        makeRow('c', {
          subtitleSource: 'subsource',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b', 'c']]);
    });

    it('takes the highest link tier as the group tier', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: null,
        }),
        makeRow('c', {
          subtitleSource: 'subsource',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
      ];

      expect(runSingleGroup(candidates).duplicateTier).toBe(3);
    });

    it('joins a chain through a tier-4 link', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: null,
        }),
        makeRow('c', {
          subtitleSource: 'subsource',
          fileFacts: makeFileFacts({
            contentKey: 'key-c',
            normalizedCues: makeCues(NEAR_DUPLICATE_SCENE_LINES),
          }),
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({
            contentKey: 'key-b',
            normalizedCues: makeCues(),
          }),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b', 'c']]);
      expect(groups[0].duplicateTier).toBe(4);
    });

    it('ignores a weaker link between rows a stronger chain already joined', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'key-a'}),
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          siteFileUrl: 'https://subtitles.example/files/777',
          fileFacts: makeFileFacts({contentKey: 'key-b'}),
        }),
        makeRow('c', {
          subtitleSource: 'wyzie',
          siteFileUrl: 'https://subtitles.example/files/777',
          fileFacts: makeFileFacts({contentKey: 'key-a'}),
        }),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b', 'c']]);
      expect(groups[0].duplicateTier).toBe(1);
    });

    it('takes tier 2 when an alias and a site id build the group', () => {
      const candidates = [
        makeRow('c', {subtitleSource: 'wyzie', aliasOfUrlCode: 'b'}),
        makeRow('a', {subtitleSource: 'subdl', siteFileId: '777'}),
        makeRow('b', {subtitleSource: 'subdl', siteFileId: '777'}),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b', 'c']]);
      expect(groups[0].duplicateTier).toBe(2);
    });

    it('rates a pair by its strongest evidence', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
        makeRow('b', {
          subtitleSource: 'subdl',
          siteFileId: '777',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
      ];

      expect(runSingleGroup(candidates).duplicateTier).toBe(1);
    });

    it('rates identical content keys as tier 3 even though their cues also match', () => {
      const candidates = [
        makeRow('a', {
          subtitleSource: 'subdl',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
        makeRow('b', {
          subtitleSource: 'subsource',
          fileFacts: makeFileFacts({contentKey: 'shared-key'}),
        }),
      ];

      expect(runSingleGroup(candidates).duplicateTier).toBe(3);
    });

    it('keeps unrelated groups apart', () => {
      const candidates = [
        makeRow('a', {subtitleSource: 'subdl', siteFileId: '777'}),
        makeRow('x', {
          fileFacts: makeFileFacts({
            contentKey: 'key-x',
            normalizedCues: makeCues(OTHER_SCENE_LINES),
          }),
        }),
        makeRow('b', {subtitleSource: 'subdl', siteFileId: '777'}),
        makeRow('y', {
          subtitleSource: 'subsource',
          fileFacts: makeFileFacts({
            contentKey: 'key-x',
            normalizedCues: makeCues(OTHER_SCENE_LINES),
          }),
        }),
        makeRow('z'),
      ];

      const groups = runGrouping(candidates);

      expect(groupUrlCodes(groups)).toEqual([['a', 'b'], ['x', 'y'], ['z']]);
      expect(findGroup(groups, 'a').duplicateTier).toBe(1);
      expect(findGroup(groups, 'x').duplicateTier).toBe(3);
      expect(findGroup(groups, 'z').duplicateTier).toBeNull();
    });
  });
});
