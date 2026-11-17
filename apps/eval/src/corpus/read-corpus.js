import {readFile} from 'node:fs/promises';
import {createFrozenStore} from './frozen-store.js';
import {parseListUrlIdentity} from './list-url.js';
import {parseRowId} from './parse-row-id.js';
import {atlasPaths} from './atlas-paths.js';

const POOL_LIST_NAME = 'Orion';

export class CorpusShapeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CorpusShapeError';
  }
}

const readJsonFile = async filePath =>
  JSON.parse(await readFile(filePath, 'utf8'));

const readVideoRecords = async atlasRoot => {
  const recordLists = await Promise.all(
    atlasPaths.candidatesData(atlasRoot).map(readJsonFile),
  );
  return new Map(
    recordLists.flat().map(videoRecord => [videoRecord.filename, videoRecord]),
  );
};

const toVideo = ({stream, videoIdentity, videoRecord}) => ({
  catalogId: stream.catalogId,
  videoFilename: stream.fileName,
  videoSizeBytes: stream.sizeBytes,
  videoHash: videoIdentity?.osHash ?? null,
  frameRate: videoRecord?.frameRate ?? null,
  durationSeconds: videoRecord?.durationSeconds ?? null,
});

const toPoolRows = ({caseCode, poolList, orionList, listBlob}) => {
  if (poolList.length !== orionList.rowIds.length) {
    throw new CorpusShapeError(
      `${caseCode}: poolList and the Orion rowIds differ in length.`,
    );
  }
  const listEntryById = new Map(
    listBlob.subtitles.map(listEntry => [listEntry.id, listEntry]),
  );
  return poolList.map((poolEntry, servedIndex) => {
    const rowId = orionList.rowIds[servedIndex];
    const listEntry = listEntryById.get(rowId);
    return {
      servedIndex,
      candidateId: poolEntry.candidateId ?? null,
      rowId,
      label: listEntry?.label ?? null,
      siteIdentity: listEntry ? parseListUrlIdentity(listEntry.url) : null,
    };
  });
};

const toCandidate = ({caseCode, caseCandidate, localCandidate}) => {
  if (!localCandidate) {
    throw new CorpusShapeError(
      `${caseCode}: a case.json candidate is missing from local.json.`,
    );
  }
  return {
    candidateId: caseCandidate.id,
    expectedClass: caseCandidate.expectedClass ?? null,
    rowId: localCandidate.rowId,
    parsedRowId: parseRowId(localCandidate.rowId),
    candidateKey: localCandidate.candidateKey ?? null,
    rawSha256: localCandidate.rawSha256 ?? null,
    trackSha256: localCandidate.trackSha256 ?? null,
    cueCount: localCandidate.cueCount ?? null,
    isValid: localCandidate.isValid ?? null,
    invalidReasons: localCandidate.invalidReasons ?? [],
    duplicateOf: localCandidate.duplicateOf ?? null,
    timeFamily: localCandidate.timeFamily ?? null,
    languageCode: localCandidate.language,
  };
};

const readEvalCase = async ({
  atlasRoot,
  caseCode,
  frozenStore,
  videoIdentities,
  videoRecordByFilename,
}) => {
  const [caseJson, localJson] = await Promise.all([
    readJsonFile(atlasPaths.caseJson(atlasRoot, caseCode)),
    readJsonFile(atlasPaths.localJson(atlasRoot, caseCode)),
  ]);
  const orionList = localJson.lists[POOL_LIST_NAME];
  const listBlob = await frozenStore.readJsonBlob(orionList.sha256);
  return {
    caseCode,
    truthAuditStatus: caseJson.truthAudit.status,
    truthCues: caseJson.truth.cues,
    durationMs: caseJson.durationMs,
    video: toVideo({
      stream: localJson.stream,
      videoIdentity: videoIdentities[caseCode],
      videoRecord: videoRecordByFilename.get(localJson.stream.fileName),
    }),
    poolRows: toPoolRows({
      caseCode,
      poolList: caseJson.poolList,
      orionList,
      listBlob,
    }),
    candidates: caseJson.candidates.map(caseCandidate =>
      toCandidate({
        caseCode,
        caseCandidate,
        localCandidate: localJson.candidates[caseCandidate.id],
      }),
    ),
  };
};

export const readCorpus = async ({atlasRoot}) => {
  const [corpusIndex, identities, videoRecordByFilename] = await Promise.all([
    readJsonFile(atlasPaths.corpusIndex(atlasRoot)),
    readJsonFile(atlasPaths.identities(atlasRoot)),
    readVideoRecords(atlasRoot),
  ]);
  const frozenStore = createFrozenStore(atlasRoot);
  return Promise.all(
    corpusIndex.cases.map(({code}) =>
      readEvalCase({
        atlasRoot,
        caseCode: code,
        frozenStore,
        videoIdentities: identities.videos,
        videoRecordByFilename,
      }),
    ),
  );
};
