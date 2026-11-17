export const getContentGroups = evalCase => {
  const candidateById = new Map(
    evalCase.candidates.map(candidate => [candidate.candidateId, candidate]),
  );
  const classByCandidateKey = new Map(
    evalCase.candidates
      .filter(
        candidate =>
          candidate.candidateKey !== null && candidate.expectedClass !== null,
      )
      .map(candidate => [candidate.candidateKey, candidate.expectedClass]),
  );
  const rankedPoolRows = evalCase.poolRows.filter(
    poolRow => candidateById.get(poolRow.candidateId)?.isValid === true,
  );
  const poolRowsByCandidateKey = Map.groupBy(
    rankedPoolRows,
    poolRow => candidateById.get(poolRow.candidateId).candidateKey,
  );
  return [...poolRowsByCandidateKey].map(([candidateKey, poolRows]) => ({
    candidateKey,
    groupClass: classByCandidateKey.get(candidateKey) ?? null,
    poolRows,
  }));
};
