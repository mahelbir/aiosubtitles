import {groupBy} from 'es-toolkit';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {readSiteIdentityKey} from '@repo/subtitle-core/deduplication/duplicate-evidence.js';
import {groupDuplicates} from '@repo/subtitle-core/deduplication/group-duplicates.js';
import {buildFileFacts} from '@repo/subtitle-core/file-format/file-facts.js';
import {parseReleaseName} from '@repo/subtitle-core/release-name/parse-release-name.js';

const CATALOG_ID_SEPARATOR = ':';
const UNKNOWN_FIRST_SEEN_AT = new Date(0).toISOString();
const LIST_FILE_EXTENSION = 'srt';

const SUBTITLE_SOURCE_BY_LABEL = new Map(
  SubtitleSource.toList().map(({value, label}) => [label, value]),
);

export class UnknownSubtitleSourceError extends Error {
  constructor(message = 'A pool row has no known subtitle source.') {
    super(message);
    this.name = 'UnknownSubtitleSourceError';
  }
}

const readCatalogNumber = catalogPart =>
  catalogPart === undefined ? null : Number(catalogPart);

export const buildEvalVideoContext = evalCase => {
  const {catalogId, videoFilename} = evalCase.video;
  const [, seasonPart, episodePart] = catalogId.split(CATALOG_ID_SEPARATOR);
  return {
    videoId: catalogId,
    catalogSeason: readCatalogNumber(seasonPart),
    catalogEpisode: readCatalogNumber(episodePart),
    videoHash: null,
    videoRelease: parseReleaseName(videoFilename),
    catalogDurationMs: null,
  };
};

const readSubtitleSource = ({parsedRowId, siteIdentity}) => {
  const subtitleSource = parsedRowId.isOfficialAddon
    ? siteIdentity?.subtitleSource
    : SUBTITLE_SOURCE_BY_LABEL.get(parsedRowId.subtitleSourceName);
  if (subtitleSource === undefined) {
    throw new UnknownSubtitleSourceError();
  }
  return subtitleSource;
};

const readFileFacts = async ({corpusCandidate, frozenStore}) => {
  if (corpusCandidate.rawSha256 === null) {
    return null;
  }
  const {fileFacts} = buildFileFacts({
    bytes: await frozenStore.readBlob(corpusCandidate.rawSha256),
    fileNameHint: null,
    expectedLanguageCode: corpusCandidate.languageCode,
    fallbackFrameRate: null,
  });
  return fileFacts;
};

const buildEvalCandidate = async ({poolRow, corpusCandidate, frozenStore}) => {
  const {parsedRowId} = corpusCandidate;
  return {
    urlCode: corpusCandidate.candidateId,
    subtitleSource: readSubtitleSource({
      parsedRowId,
      siteIdentity: poolRow.siteIdentity,
    }),
    siteFileId: poolRow.siteIdentity?.siteFileId ?? null,
    archiveEntryPath: '',
    siteFileUrl: null,
    aliasOfUrlCode: null,
    languageCode: corpusCandidate.languageCode,
    releaseNames: parsedRowId.releaseNames,
    isSitePack: false,
    isHearingImpaired: parsedRowId.isHearingImpaired,
    isForced: parsedRowId.isForced,
    isMachineTranslated: null,
    isUploaderTrusted: null,
    isQuotaCostly: parsedRowId.isQuotaCostly,
    siteDownloadCount: null,
    firstSeenAt: UNKNOWN_FIRST_SEEN_AT,
    fileExtension: LIST_FILE_EXTENSION,
    hashMatchVideoHashes: [],
    fileFacts: await readFileFacts({corpusCandidate, frozenStore}),
    referenceComparison: null,
    variantReferenceFamilyCount: 0,
    variantHashMatchCount: 0,
  };
};

export const buildEvalCandidates = async ({evalCase, frozenStore}) => {
  const corpusCandidateById = new Map(
    evalCase.candidates.map(candidate => [candidate.candidateId, candidate]),
  );
  return Promise.all(
    evalCase.poolRows
      .filter(poolRow => poolRow.candidateId !== null)
      .map(poolRow =>
        buildEvalCandidate({
          poolRow,
          corpusCandidate: corpusCandidateById.get(poolRow.candidateId),
          frozenStore,
        }),
      ),
  );
};

export const readTierOneKey = candidate =>
  candidate.siteFileId === null ? null : readSiteIdentityKey(candidate);

export const groupDuplicatesPerLanguage = ({candidates, textSimilarityMin}) =>
  Object.values(
    groupBy(candidates, candidate => candidate.languageCode),
  ).flatMap(languageCandidates =>
    groupDuplicates({candidates: languageCandidates, textSimilarityMin}),
  );
