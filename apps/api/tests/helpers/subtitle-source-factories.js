import crypto from 'node:crypto';
import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';

let siteFileSequence = 0;

export function makeSubtitleSourceHit(overrides = {}) {
  siteFileSequence += 1;
  return {
    subtitleSource: SubtitleSource.THESUBTITLEDB,
    siteFileId: `site-file-${siteFileSequence}`,
    languageCode: 'tur',
    releaseNames: ['Fixture.Movie.2024.1080p.WEB-DL.x264-GROUP'],
    fileExtension: SubtitleFileExtension.SRT,
    isSitePack: false,
    isHearingImpaired: null,
    isForced: null,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: null,
    siteDownloadCount: null,
    siteFps: null,
    siteFileUrl: null,
    siteCueCount: null,
    siteDurationMs: null,
    hashMatchVideoHashes: [],
    subtitleAliases: [],
    ...overrides,
  };
}

export function makeSearchQuery(overrides = {}) {
  return {
    videoId: 'tt0111161',
    videoType: 'movie',
    imdbId: 'tt0111161',
    kitsuId: null,
    catalogSeason: null,
    catalogEpisode: null,
    kitsuEpisode: null,
    tvdbId: null,
    catalogTitle: null,
    catalogYear: null,
    languageCodes: ['tur', 'eng'],
    videoHash: null,
    videoSizeBytes: null,
    videoFilename: null,
    ...overrides,
  };
}

export function makeSubtitleSourceCredential(overrides = {}) {
  return {
    credentialId: crypto.randomUUID(),
    credentialKind: CredentialKind.API_KEY,
    apiKey: 'fixture-api-key',
    ...overrides,
  };
}
