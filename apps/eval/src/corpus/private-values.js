import {
  extractListNames,
  readFrozenLists,
  readVideoFilenames,
} from './frozen-lists.js';
import {readCorpus} from './read-corpus.js';

const getCasePrivateValues = evalCase => [
  evalCase.video.videoFilename,
  evalCase.video.videoHash,
  ...evalCase.poolRows.flatMap(poolRow => [poolRow.rowId, poolRow.label]),
  ...evalCase.candidates.flatMap(candidate => [
    candidate.rowId,
    ...candidate.parsedRowId.releaseNames,
    candidate.rawSha256,
    candidate.trackSha256,
    candidate.candidateKey,
  ]),
];

export const getPrivateValues = evalCases => [
  ...new Set(evalCases.flatMap(getCasePrivateValues).filter(Boolean)),
];

const getListPrivateValues = listBlob => [
  ...listBlob.subtitles.flatMap(listEntry => [listEntry.id, listEntry.label]),
  ...extractListNames(listBlob),
];

export const readOwnPrivateValues = async ({atlasRoot}) => {
  const [videoFilenames, listBlobs] = await Promise.all([
    readVideoFilenames(atlasRoot),
    readFrozenLists(atlasRoot),
  ]);
  return [
    ...new Set(
      [...videoFilenames, ...listBlobs.flatMap(getListPrivateValues)].filter(
        privateValue => typeof privateValue === 'string' && privateValue !== '',
      ),
    ),
  ];
};

export const readReportPrivateValues = async ({atlasRoot}) => {
  const [evalCases, ownPrivateValues] = await Promise.all([
    readCorpus({atlasRoot}),
    readOwnPrivateValues({atlasRoot}),
  ]);
  return [...new Set([...getPrivateValues(evalCases), ...ownPrivateValues])];
};
