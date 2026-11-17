/**
 * @typedef {{startMs: number, endMs: number, text: string}} Cue
 */

/**
 * @typedef {{
 *   releaseTitle: string|null,
 *   releaseYear: number|null,
 *   seasonNumbers: number[],
 *   episodeNumbers: number[],
 *   isSeasonPack: boolean,
 *   partNumber: number|null,
 *   releaseGroup: string|null,
 *   releaseSourceFamily: string|null,
 *   isRemux: boolean,
 *   streamingService: string|null,
 *   releaseEdition: string|null,
 *   resolutionHeight: number|null,
 *   audioTags: string[],
 *   frameRate: number|null,
 *   nameTokens: string[],
 *   isMeaningless: boolean,
 * }} ReleaseInfo
 */

/**
 * @typedef {{
 *   videoId: string,
 *   catalogSeason: number|null,
 *   catalogEpisode: number|null,
 *   videoHash: string|null,
 *   videoRelease: ReleaseInfo|null,
 *   catalogDurationMs: number|null,
 * }} VideoContext
 */

/**
 * @typedef {{
 *   contentKey: string,
 *   isFileValid: boolean,
 *   fileInvalidReasons: string[],
 *   cueCount: number,
 *   lastCueEndMs: number,
 *   detectedLanguageCode: string|null,
 *   normalizedCues: Cue[]|null,
 * }} FileFacts
 */

/**
 * @typedef {{
 *   urlCode: string,
 *   subtitleSource: string,
 *   siteFileId: string,
 *   archiveEntryPath: string,
 *   siteFileUrl: string|null,
 *   aliasOfUrlCode: string|null,
 *   languageCode: string,
 *   releaseNames: string[],
 *   isSitePack: boolean,
 *   isHearingImpaired: boolean|null,
 *   isForced: boolean|null,
 *   isMachineTranslated: boolean|null,
 *   isUploaderTrusted: boolean|null,
 *   isQuotaCostly: boolean|null,
 *   siteDownloadCount: number|null,
 *   firstSeenAt: string,
 *   fileExtension: string,
 *   hashMatchVideoHashes: string[],
 *   fileFacts: FileFacts|null,
 *   referenceComparison: {isSameTimeFamily: boolean}|null,
 *   variantReferenceFamilyCount: number,
 *   variantHashMatchCount: number,
 * }} SubtitleCandidate
 */

/**
 * @typedef {{signalState: string, signalMagnitude: number}} SignalReading
 */

/**
 * @typedef {Object<string, SignalReading>} SignalSet
 */

/**
 * @typedef {{
 *   tableName: string,
 *   tableCitations: string[],
 *   tableMode: string,
 *   signalPoints: Object<string, {
 *     matchPoints: number,
 *     conflictPoints: number,
 *     strongConflictPoints?: number,
 *     maxPoints?: number,
 *   }>,
 *   priorityOrder?: string[],
 * }} ScoreTable
 */

/**
 * @typedef {{
 *   totalScore: number,
 *   hardRejectReason: string|null,
 *   signalPoints: Object<string, number>,
 *   bestReleaseIndex: number,
 *   confidenceWord: string|null,
 *   priorityVector: number[]|null,
 * }} ScoreBreakdown
 */

/**
 * @typedef {SubtitleCandidate & {
 *   totalScore: number,
 *   confidenceWord: string|null,
 *   subtitleFileName: string|null,
 * }} RankedRow
 */

export {};
