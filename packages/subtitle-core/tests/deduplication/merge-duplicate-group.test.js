import {describe, expect, it} from 'vitest';
import {
  mergeDuplicateGroup,
  pickClosestReleaseName,
} from '../../src/deduplication/merge-duplicate-group.js';
import {
  makeFileFacts,
  makeDistinctCandidate as makeRow,
} from '../helpers/deduplication-fixtures.js';
import {makeReleaseInfo} from '../helpers/factories.js';

const VIDEO_NAME_TOKENS = [
  'show',
  's01e01',
  '1080p',
  'web',
  'dl',
  'ddp5',
  '1',
  'ntb',
];
const WEB_RELEASE = 'Show.S01E01.1080p.WEB-DL-NTb';
const HDTV_RELEASE = 'Show.S01E01.720p.HDTV-KILLERS';

const makeGroup = (representative, others, duplicateTier = 3) => ({
  representative,
  members: [representative, ...others],
  duplicateTier,
});

const makeVideoRelease = () => makeReleaseInfo({nameTokens: VIDEO_NAME_TOKENS});

describe('pickClosestReleaseName', () => {
  it('prefers the name closest to the video name', () => {
    expect(
      pickClosestReleaseName({
        releaseNames: [HDTV_RELEASE, WEB_RELEASE],
        videoRelease: makeVideoRelease(),
      }),
    ).toBe(WEB_RELEASE);
  });

  it('keeps the earlier name on an overlap tie', () => {
    expect(
      pickClosestReleaseName({
        releaseNames: ['Show.S01E01.1080p-GRP', 'Show.S01E01.WEB-GRP'],
        videoRelease: makeReleaseInfo({
          nameTokens: ['show', 's01e01', '1080p', 'web', 'grp'],
        }),
      }),
    ).toBe('Show.S01E01.1080p-GRP');
  });

  it('takes the first name without a video release', () => {
    expect(
      pickClosestReleaseName({
        releaseNames: [HDTV_RELEASE, WEB_RELEASE],
        videoRelease: null,
      }),
    ).toBe(HDTV_RELEASE);
  });

  it('takes the first name for a meaningless video release', () => {
    expect(
      pickClosestReleaseName({
        releaseNames: [HDTV_RELEASE, WEB_RELEASE],
        videoRelease: makeReleaseInfo({
          nameTokens: VIDEO_NAME_TOKENS,
          isMeaningless: true,
        }),
      }),
    ).toBe(HDTV_RELEASE);
  });

  it('gives null without release names', () => {
    expect(
      pickClosestReleaseName({
        releaseNames: [],
        videoRelease: makeVideoRelease(),
      }),
    ).toBeNull();
    expect(
      pickClosestReleaseName({releaseNames: [], videoRelease: null}),
    ).toBeNull();
  });
});

describe('mergeDuplicateGroup', () => {
  it('keeps the representative identity', () => {
    const representative = makeRow('rep', {
      subtitleSource: 'subdl',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
    });
    const group = makeGroup(representative, [
      makeRow('other', {
        subtitleSource: 'subsource',
        firstSeenAt: '2026-02-01T00:00:00.000Z',
      }),
    ]);

    const merged = mergeDuplicateGroup({group, videoRelease: null});

    expect(merged.urlCode).toBe('rep');
    expect(merged.subtitleSource).toBe('subdl');
    expect(merged.siteFileId).toBe('site-file-rep');
    expect(merged.firstSeenAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps the representative file facts when they are valid', () => {
    const representativeFacts = makeFileFacts({contentKey: 'key-rep'});
    const group = makeGroup(
      makeRow('rep', {
        fileFacts: representativeFacts,
        referenceComparison: {isSameTimeFamily: false},
      }),
      [
        makeRow('other', {
          fileFacts: makeFileFacts({contentKey: 'key-other'}),
          referenceComparison: {isSameTimeFamily: true},
        }),
      ],
    );

    const merged = mergeDuplicateGroup({group, videoRelease: null});

    expect(merged.fileFacts).toBe(representativeFacts);
    expect(merged.referenceComparison).toEqual({isSameTimeFamily: false});
  });

  it('takes the file facts of a downloaded alias when the representative has none', () => {
    const aliasFacts = makeFileFacts({contentKey: 'key-wyzie'});
    const group = makeGroup(
      makeRow('site', {
        subtitleSource: 'opensubtitles',
        siteFileUrl: 'https://subtitles.example/files/777',
        fileFacts: null,
      }),
      [
        makeRow('invalid', {
          subtitleSource: 'subdl',
          fileFacts: makeFileFacts({
            contentKey: 'key-invalid',
            isFileValid: false,
          }),
          referenceComparison: {isSameTimeFamily: false},
        }),
        makeRow('alias', {
          subtitleSource: 'wyzie',
          aliasOfUrlCode: 'site',
          fileFacts: aliasFacts,
          referenceComparison: {isSameTimeFamily: true},
        }),
      ],
      2,
    );

    const merged = mergeDuplicateGroup({group, videoRelease: null});

    expect(merged.fileFacts).toBe(aliasFacts);
    expect(merged.referenceComparison).toEqual({isSameTimeFamily: true});
    expect(merged).toMatchObject({
      urlCode: 'site',
      subtitleSource: 'opensubtitles',
      siteFileId: 'site-file-site',
      archiveEntryPath: '',
      siteFileUrl: 'https://subtitles.example/files/777',
    });
  });

  it('keeps the representative file facts when no member has a valid file', () => {
    const group = makeGroup(makeRow('rep', {fileFacts: null}), [
      makeRow('other', {
        fileFacts: makeFileFacts({isFileValid: false}),
      }),
    ]);

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).fileFacts,
    ).toBeNull();
  });

  it('joins release names with the representative names first and no repeats', () => {
    const group = makeGroup(
      makeRow('rep', {releaseNames: ['Name.A', 'Name.B']}),
      [
        makeRow('one', {releaseNames: ['Name.B', 'Name.C']}),
        makeRow('two', {releaseNames: ['Name.D', 'Name.A']}),
      ],
    );

    const merged = mergeDuplicateGroup({group, videoRelease: null});

    expect(merged.releaseNames).toEqual([
      'Name.A',
      'Name.B',
      'Name.C',
      'Name.D',
    ]);
  });

  it('joins hash matches without repeats', () => {
    const group = makeGroup(
      makeRow('rep', {hashMatchVideoHashes: ['hash-1']}),
      [
        makeRow('one', {hashMatchVideoHashes: ['hash-2', 'hash-1']}),
        makeRow('two', {hashMatchVideoHashes: []}),
      ],
    );

    const merged = mergeDuplicateGroup({group, videoRelease: null});

    expect(merged.hashMatchVideoHashes).toEqual(['hash-1', 'hash-2']);
  });

  it('sums the site download counts and skips missing ones', () => {
    const group = makeGroup(makeRow('rep', {siteDownloadCount: 10}), [
      makeRow('one', {siteDownloadCount: null}),
      makeRow('two', {siteDownloadCount: 5}),
    ]);

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).siteDownloadCount,
    ).toBe(15);
  });

  it('leaves an alias member download count out of the sum', () => {
    const group = makeGroup(
      makeRow('site', {subtitleSource: 'opensubtitles', siteDownloadCount: 10}),
      [
        makeRow('alias', {
          subtitleSource: 'wyzie',
          aliasOfUrlCode: 'site',
          siteDownloadCount: 7,
        }),
      ],
      2,
    );

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).siteDownloadCount,
    ).toBe(10);
  });

  it('keeps a null download count when only an alias member has one', () => {
    const group = makeGroup(
      makeRow('site', {
        subtitleSource: 'opensubtitles',
        siteDownloadCount: null,
      }),
      [
        makeRow('alias', {
          subtitleSource: 'wyzie',
          aliasOfUrlCode: 'site',
          siteDownloadCount: 7,
        }),
      ],
      2,
    );

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).siteDownloadCount,
    ).toBeNull();
  });

  it('counts one download value per site identity, the largest one', () => {
    const siteIdentity = {
      subtitleSource: 'subdl',
      siteFileId: '777',
      archiveEntryPath: '',
    };
    const group = makeGroup(
      makeRow('rep', {...siteIdentity, siteDownloadCount: 10}),
      [
        makeRow('again', {...siteIdentity, siteDownloadCount: 12}),
        makeRow('unknown', {...siteIdentity, siteDownloadCount: null}),
        makeRow('other', {subtitleSource: 'subsource', siteDownloadCount: 5}),
      ],
      1,
    );

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).siteDownloadCount,
    ).toBe(17);
  });

  it('leaves a representative that is an alias out of the sum and the copy count', () => {
    const group = makeGroup(
      makeRow('alias', {
        subtitleSource: 'wyzie',
        aliasOfUrlCode: 'site',
        siteDownloadCount: 7,
      }),
      [
        makeRow('site', {
          subtitleSource: 'opensubtitles',
          siteDownloadCount: 4,
        }),
      ],
      2,
    );

    const merged = mergeDuplicateGroup({group, videoRelease: null});

    expect(merged.urlCode).toBe('alias');
    expect(merged.siteDownloadCount).toBe(4);
    expect(merged.independentCopyCount).toBe(0);
  });

  it('keeps a null download count when every member lacks one', () => {
    const group = makeGroup(makeRow('rep', {siteDownloadCount: null}), [
      makeRow('one', {siteDownloadCount: null}),
    ]);

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).siteDownloadCount,
    ).toBeNull();
  });

  it('counts each extra subtitle source as one independent copy', () => {
    const group = makeGroup(makeRow('rep', {subtitleSource: 'opensubtitles'}), [
      makeRow('one', {subtitleSource: 'subdl'}),
      makeRow('two', {subtitleSource: 'subsource'}),
    ]);

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).independentCopyCount,
    ).toBe(2);
  });

  it('counts two rows of one subtitle source once', () => {
    const group = makeGroup(makeRow('rep', {subtitleSource: 'subdl'}), [
      makeRow('one', {subtitleSource: 'subdl'}),
    ]);

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).independentCopyCount,
    ).toBe(0);
  });

  it('does not raise the copy count for an alias member', () => {
    const group = makeGroup(
      makeRow('rep', {subtitleSource: 'opensubtitles'}),
      [
        makeRow('one', {subtitleSource: 'subdl'}),
        makeRow('alias', {
          subtitleSource: 'wyzie',
          aliasOfUrlCode: 'rep',
          siteDownloadCount: null,
        }),
      ],
      2,
    );

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).independentCopyCount,
    ).toBe(1);
  });

  it('gives a single-member group no independent copy', () => {
    const representative = makeRow('rep', {subtitleSource: 'subdl'});
    const group = {
      representative,
      members: [representative],
      duplicateTier: null,
    };

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).independentCopyCount,
    ).toBe(0);
  });

  it('names the subtitle file after the release closest to the video', () => {
    const group = makeGroup(makeRow('rep', {releaseNames: [HDTV_RELEASE]}), [
      makeRow('one', {releaseNames: [WEB_RELEASE]}),
    ]);

    const merged = mergeDuplicateGroup({
      group,
      videoRelease: makeVideoRelease(),
    });

    expect(merged.subtitleFileName).toBe(WEB_RELEASE);
  });

  it('names the subtitle file after the representative first name without a video', () => {
    const group = makeGroup(makeRow('rep', {releaseNames: [HDTV_RELEASE]}), [
      makeRow('one', {releaseNames: [WEB_RELEASE]}),
    ]);

    expect(
      mergeDuplicateGroup({group, videoRelease: null}).subtitleFileName,
    ).toBe(HDTV_RELEASE);
  });

  it('gives a null subtitle file name when no member has a release name', () => {
    const group = makeGroup(makeRow('rep'), [makeRow('one')]);

    expect(
      mergeDuplicateGroup({group, videoRelease: makeVideoRelease()})
        .subtitleFileName,
    ).toBeNull();
  });

  it('leaves the group members untouched', () => {
    const representative = makeRow('rep', {
      releaseNames: ['Name.A'],
      siteDownloadCount: 3,
    });
    const other = makeRow('one', {
      releaseNames: ['Name.B'],
      siteDownloadCount: 4,
    });
    const group = makeGroup(representative, [other]);
    const snapshot = structuredClone(group);

    mergeDuplicateGroup({group, videoRelease: null});

    expect(group).toEqual(snapshot);
  });
});
