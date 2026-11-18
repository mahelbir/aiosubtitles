import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';
import {READY_MADE_SCORE_TABLES} from '@repo/subtitle-core/scoring/ready-made-score-tables.js';

export const VIDEO_RELEASE_NAME =
  'Show.S01E01.1080p.AMZN.WEB-DL.DDP5.1.H.264-GRP';

export const RELEASE_NAMES = {
  strong: 'Show.S01E01.1080p.AMZN.WEB-DL.x264-GRP',
  medium: 'Show.S01E01.720p.WEB-DL.x264-OTHER',
  serviceSourceResolution: 'Show.S01E01.1080p.AMZN.WEB-DL.x264-OTHER',
  groupOnly: 'Show.S01E01.720p.HDTV.x264-GRP',
  negative: 'Show.S01E01.720p.BluRay.x264-OTHER',
  wrongEpisode: 'Show.S01E02.1080p.AMZN.WEB-DL.x264-GRP',
  wrongSeason: 'Show.S02E01.1080p.AMZN.WEB-DL.x264-GRP',
  groupAndResolution: 'Show.S01E01.1080p.WEB-DL.x264-GRP',
  serviceOnly: 'Show.S01E01.720p.AMZN.WEB-DL.x264-OTHER',
};

export const findReadyMadeTable = tableName =>
  READY_MADE_SCORE_TABLES.find(
    scoreTable => scoreTable.tableName === tableName,
  );

export const makeEpisodeVideo = () => ({
  videoId: 'tt0000001:1:1',
  catalogSeason: 1,
  catalogEpisode: 1,
  videoHash: null,
  videoRelease: parseReleaseName(VIDEO_RELEASE_NAME),
  catalogDurationMs: null,
});

export const makeSubtitleCandidate = (overrides = {}) => ({
  urlCode: 'url-code-1',
  subtitleSource: 'opensubtitles',
  siteFileId: 'site-file-1',
  archiveEntryPath: '',
  siteFileUrl: null,
  aliasOfUrlCode: null,
  languageCode: 'tur',
  releaseNames: [],
  isSitePack: false,
  isHearingImpaired: null,
  isForced: null,
  isMachineTranslated: null,
  isUploaderTrusted: null,
  isQuotaCostly: null,
  siteDownloadCount: null,
  firstSeenAt: '2026-01-01T00:00:00.000Z',
  fileExtension: 'srt',
  hashMatchVideoHashes: [],
  fileFacts: null,
  referenceComparison: null,
  variantReferenceFamilyCount: 0,
  variantHashMatchCount: 0,
  ...overrides,
});

export const makeMember = ({
  releaseNames = [],
  servedIndex = 0,
  candidateOverrides = {},
} = {}) => ({
  servedIndex,
  candidate: makeSubtitleCandidate({releaseNames, ...candidateOverrides}),
  candidateReleases: releaseNames.map(releaseName =>
    parseReleaseName(releaseName),
  ),
  video: makeEpisodeVideo(),
});

export const makeGroup = ({groupClass = null, isValid = true, members}) => ({
  groupClass,
  isValid,
  members,
});

export const makeNamedGroup = (releaseNames, groupOptions = {}) =>
  makeGroup({
    ...groupOptions,
    members: releaseNames.map((releaseName, servedIndex) =>
      makeMember({
        releaseNames: releaseName === null ? [] : [releaseName],
        servedIndex,
      }),
    ),
  });
