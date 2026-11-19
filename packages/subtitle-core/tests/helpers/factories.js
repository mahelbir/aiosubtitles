import {
  ScoreTableMode,
  ScoringSignal,
  SignalState,
} from '../../src/constants/subtitle-core-enums.js';
import {tokenizeReleaseName} from '../../src/release-name/name-tokens.js';

export const makeReleaseInfo = (overrides = {}) => ({
  releaseTitle: null,
  releaseYear: null,
  seasonNumbers: [],
  episodeNumbers: [],
  isSeasonPack: false,
  partNumber: null,
  releaseGroup: null,
  releaseSourceFamily: null,
  isRemux: false,
  streamingService: null,
  releaseEdition: null,
  resolutionHeight: null,
  audioTags: [],
  frameRate: null,
  nameTokens: [],
  isMeaningless: false,
  ...overrides,
});

export const makeVideo = (overrides = {}) => ({
  videoId: 'tt0000001',
  catalogSeason: null,
  catalogEpisode: null,
  kitsuEpisode: null,
  videoHash: null,
  videoRelease: null,
  catalogDurationMs: null,
  ...overrides,
});

export const makeCandidate = (overrides = {}) => ({
  urlCode: 'url-code-1',
  subtitleSource: 'opensubtitles',
  siteFileId: 'site-file-1',
  archiveEntryPath: '',
  siteFileUrl: null,
  aliasOfUrlCode: null,
  languageCode: 'eng',
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
  siteCueShape: null,
  referenceComparison: null,
  variantReferenceFamilyCount: 0,
  variantHashMatchCount: 0,
  ...overrides,
});

export const makeRankedRow = (overrides = {}) => ({
  ...makeCandidate(),
  totalScore: 0,
  confidenceWord: null,
  subtitleFileName: null,
  ...overrides,
});

export const makeNamedRelease = (releaseName, overrides = {}) =>
  makeReleaseInfo({nameTokens: tokenizeReleaseName(releaseName), ...overrides});

export const makeSignalReading = (overrides = {}) => ({
  signalState: SignalState.MATCH,
  signalMagnitude: 1,
  ...overrides,
});

export const makeSignalSet = (overrides = {}) => ({
  ...Object.fromEntries(
    ScoringSignal.values.map(scoringSignal => [
      scoringSignal,
      makeSignalReading({signalState: SignalState.UNKNOWN, signalMagnitude: 0}),
    ]),
  ),
  ...overrides,
});

export const makeScoreTable = (overrides = {}) => ({
  tableName: 'fixture-table',
  tableCitations: ['tests/helpers/factories.js'],
  tableMode: ScoreTableMode.ADDITIVE,
  signalPoints: {},
  ...overrides,
});
