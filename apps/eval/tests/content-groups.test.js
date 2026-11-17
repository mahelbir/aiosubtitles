import {describe, expect, it} from 'vitest';
import {getContentGroups} from '../src/corpus/content-groups.js';

const makeCandidate = (candidateId, candidateKey, isValid, expectedClass) => ({
  candidateId,
  candidateKey,
  isValid,
  expectedClass,
});

const makePoolRow = (servedIndex, candidateId) => ({servedIndex, candidateId});

describe('getContentGroups', () => {
  const evalCase = {
    candidates: [
      makeCandidate('V1/c1', 'k1', true, 'fits'),
      makeCandidate('V1/c2', 'k1', true, null),
      makeCandidate('V1/c3', 'k2', true, null),
      makeCandidate('V1/c4', 'k3', false, null),
      makeCandidate('V1/c5', null, null, null),
    ],
    poolRows: [
      makePoolRow(0, 'V1/c3'),
      makePoolRow(1, 'V1/c2'),
      makePoolRow(2, 'V1/c4'),
      makePoolRow(3, null),
      makePoolRow(4, 'V1/c5'),
      makePoolRow(5, 'V1/c1'),
    ],
  };

  it('groups valid pool rows by key in served order', () => {
    expect(
      getContentGroups(evalCase).map(({candidateKey, poolRows}) => [
        candidateKey,
        poolRows.map(poolRow => poolRow.servedIndex),
      ]),
    ).toEqual([
      ['k2', [0]],
      ['k1', [1, 5]],
    ]);
  });

  it('leaves a group without a classed candidate unclassed', () => {
    expect(
      getContentGroups(evalCase).map(({groupClass}) => groupClass),
    ).toEqual([null, 'fits']);
  });
});
