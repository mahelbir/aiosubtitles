import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {computeUrlCode} from '@repo/subtitle-core/stremio-row/url-code.js';
import {SubtitleAlias} from '../../src/db/models/subtitle-alias.js';
import {SubtitleHashMatch} from '../../src/db/models/subtitle-hash-match.js';
import {SubtitleVideoCandidate} from '../../src/db/models/subtitle-video-candidate.js';
import {Subtitle} from '../../src/db/models/subtitle.js';
import {SubtitleAliasSource} from '../../src/lib/subtitle-sources/subtitle-alias-source.js';
import {persistSearchHits} from '../../src/lib/subtitle-store/persist-search-hits.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';

const VIDEO_ID = 'tt0111161';
const VIDEO_HASH = '0123456789abcdef';
const FIRST_SEEN_AT = new Date('2026-11-18T10:00:00.000Z');
const LATER_SEEN_AT = new Date('2026-11-18T11:00:00.000Z');

function readSubtitles() {
  return Subtitle.findAll({
    attributes: [
      'id',
      'urlCode',
      'fileExtension',
      'releaseNames',
      'siteDownloadCount',
      'firstSeenAt',
      'siteMetadataUpdatedAt',
    ],
    raw: true,
  });
}

function readCandidates() {
  return SubtitleVideoCandidate.findAll({
    attributes: [
      'videoId',
      'subtitleId',
      'candidateFirstSeenAt',
      'candidateLastSeenAt',
    ],
    raw: true,
  });
}

describe('persistSearchHits', () => {
  it('persists one subtitle row when two searches store the same hit at once', async () => {
    const searchHit = makeSubtitleSourceHit();

    await Promise.all([
      persistSearchHits({videoId: VIDEO_ID, searchHits: [searchHit]}),
      persistSearchHits({videoId: VIDEO_ID, searchHits: [searchHit]}),
    ]);

    const subtitles = await readSubtitles();
    expect(subtitles).toHaveLength(1);
    expect(subtitles[0].urlCode).toBe(
      computeUrlCode({...searchHit, archiveEntryPath: ''}),
    );
    const candidates = await readCandidates();
    expect(candidates).toEqual([
      expect.objectContaining({
        videoId: VIDEO_ID,
        subtitleId: subtitles[0].id,
      }),
    ]);
  });

  it('keeps the first file extension when a later hit says ass', async () => {
    const searchHit = makeSubtitleSourceHit({
      fileExtension: SubtitleFileExtension.SRT,
    });

    await persistSearchHits({
      videoId: VIDEO_ID,
      searchHits: [searchHit],
      seenAt: FIRST_SEEN_AT,
    });
    await persistSearchHits({
      videoId: VIDEO_ID,
      searchHits: [
        {
          ...searchHit,
          fileExtension: SubtitleFileExtension.ASS,
          releaseNames: ['Fixture.Movie.2024.2160p.WEB-DL.x265-OTHER'],
          siteDownloadCount: 7,
        },
      ],
      seenAt: LATER_SEEN_AT,
    });

    const [subtitle] = await readSubtitles();
    expect(subtitle).toMatchObject({
      urlCode: computeUrlCode({...searchHit, archiveEntryPath: ''}),
      fileExtension: SubtitleFileExtension.SRT,
      releaseNames: ['Fixture.Movie.2024.2160p.WEB-DL.x265-OTHER'],
      siteDownloadCount: 7,
      firstSeenAt: FIRST_SEEN_AT,
      siteMetadataUpdatedAt: LATER_SEEN_AT,
    });
    expect(await readCandidates()).toEqual([
      {
        videoId: VIDEO_ID,
        subtitleId: subtitle.id,
        candidateFirstSeenAt: FIRST_SEEN_AT,
        candidateLastSeenAt: LATER_SEEN_AT,
      },
    ]);
  });

  it('writes a hash match and both OpenSubtitles aliases once', async () => {
    const searchHit = makeSubtitleSourceHit({
      subtitleSource: SubtitleSource.OPENSUBTITLES,
      hashMatchVideoHashes: [VIDEO_HASH],
      subtitleAliases: [
        {
          aliasSource: SubtitleAliasSource.OPENSUBTITLES_V3,
          aliasSiteFileId: 'v3-file-1',
        },
        {
          aliasSource: SubtitleAliasSource.OPENSUBTITLES_LEGACY,
          aliasSiteFileId: 'legacy-file-1',
        },
      ],
    });

    await persistSearchHits({
      videoId: VIDEO_ID,
      searchHits: [searchHit],
      seenAt: FIRST_SEEN_AT,
    });
    await persistSearchHits({
      videoId: VIDEO_ID,
      searchHits: [searchHit],
      seenAt: LATER_SEEN_AT,
    });

    const [subtitle] = await readSubtitles();
    expect(subtitle).toBeDefined();
    const [hashMatches, aliases] = await Promise.all([
      SubtitleHashMatch.findAll({
        attributes: ['subtitleId', 'videoHash', 'matchSeenAt'],
        raw: true,
      }),
      SubtitleAlias.findAll({
        attributes: ['subtitleId', 'aliasSource', 'aliasSiteFileId'],
        order: [['aliasSource', 'ASC']],
        raw: true,
      }),
    ]);
    expect(hashMatches).toEqual([
      {
        subtitleId: subtitle.id,
        videoHash: VIDEO_HASH,
        matchSeenAt: FIRST_SEEN_AT,
      },
    ]);
    expect(aliases).toEqual([
      {
        subtitleId: subtitle.id,
        aliasSource: SubtitleAliasSource.OPENSUBTITLES_LEGACY,
        aliasSiteFileId: 'legacy-file-1',
      },
      {
        subtitleId: subtitle.id,
        aliasSource: SubtitleAliasSource.OPENSUBTITLES_V3,
        aliasSiteFileId: 'v3-file-1',
      },
    ]);
  });

  it('updates the season pack flag when the site changes it', async () => {
    const searchHit = makeSubtitleSourceHit({isSitePack: false});

    await persistSearchHits({videoId: VIDEO_ID, searchHits: [searchHit]});
    await persistSearchHits({
      videoId: VIDEO_ID,
      searchHits: [{...searchHit, isSitePack: true}],
    });

    await expect(
      Subtitle.findAll({attributes: ['isSitePack'], raw: true}),
    ).resolves.toEqual([{isSitePack: true}]);
  });

  it('stores nothing when one hit names an unknown alias source', async () => {
    const searchHits = [
      makeSubtitleSourceHit(),
      makeSubtitleSourceHit({
        subtitleAliases: [
          {aliasSource: 'unknown-source', aliasSiteFileId: 'file-1'},
        ],
      }),
    ];

    await expect(
      persistSearchHits({videoId: VIDEO_ID, searchHits}),
    ).rejects.toThrow();
    expect(await Subtitle.count()).toBe(0);
    expect(await SubtitleAlias.count()).toBe(0);
  });
});
