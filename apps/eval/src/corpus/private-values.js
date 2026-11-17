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
