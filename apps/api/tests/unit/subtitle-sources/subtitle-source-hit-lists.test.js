import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from '../../../src/lib/subtitle-sources/subtitle-source-errors.js';
import {readSettledHitLists} from '../../../src/lib/subtitle-sources/subtitle-source-hit-lists.js';
import {catchError} from '../../helpers/caught-error.js';

const subtitleSource = SubtitleSource.SUBSOURCE;
const hitList = [{siteFileId: '1'}];
const otherHitList = [{siteFileId: '2'}];
const unavailableError = new SourceUnavailableError({
  subtitleSource,
  cause: new Error('Status 503.'),
});
const credentialError = new SourceCredentialError({
  subtitleSource,
  credentialId: 'fixture-credential',
});
const rateLimitError = new SourceRateLimitError({
  subtitleSource,
  retryAfterMs: 60000,
  credentialId: 'fixture-credential',
});
const otherError = new TypeError('Unexpected.');

function toFulfilled(value) {
  return {status: 'fulfilled', value};
}

function toRejected(reason) {
  return {status: 'rejected', reason};
}

describe('readSettledHitLists', () => {
  it('gives the lists of every call when all answered', () => {
    expect(
      readSettledHitLists([toFulfilled(hitList), toFulfilled(otherHitList)]),
    ).toEqual([hitList, otherHitList]);
  });

  it('gives no lists when no call was made', () => {
    expect(readSettledHitLists([])).toEqual([]);
  });

  it.each([
    ['an unavailable source', unavailableError],
    ['a rejected key', credentialError],
    ['an unexpected error', otherError],
  ])(
    'keeps the lists of the calls that answered and drops %s',
    (_, searchError) => {
      expect(
        readSettledHitLists([
          toFulfilled(hitList),
          toRejected(searchError),
          toFulfilled(otherHitList),
        ]),
      ).toEqual([hitList, otherHitList]);
    },
  );

  it('throws a rate limit even when other calls answered', () => {
    expect(
      catchError(() =>
        readSettledHitLists([
          toFulfilled(hitList),
          toRejected(unavailableError),
          toRejected(rateLimitError),
        ]),
      ),
    ).toBe(rateLimitError);
  });

  it('keeps the answered lists over a rate limit when a partial result is kept', () => {
    expect(
      readSettledHitLists([toFulfilled(hitList), toRejected(rateLimitError)], {
        isPartialKept: true,
      }),
    ).toEqual([hitList]);
  });

  it('still throws a rate limit first when a kept partial result has no answer', () => {
    expect(
      catchError(() =>
        readSettledHitLists(
          [toRejected(unavailableError), toRejected(rateLimitError)],
          {isPartialKept: true},
        ),
      ),
    ).toBe(rateLimitError);
  });

  it('gives the lists of every call when every call is required and all answered', () => {
    expect(
      readSettledHitLists([toFulfilled(hitList), toFulfilled(otherHitList)], {
        isEveryCallRequired: true,
      }),
    ).toEqual([hitList, otherHitList]);
  });

  it.each([
    [
      'a rate limit before a rejected key',
      [unavailableError, credentialError, rateLimitError],
      rateLimitError,
    ],
    [
      'a rejected key before an unavailable source',
      [otherError, unavailableError, credentialError],
      credentialError,
    ],
    [
      'an unavailable source before an unexpected error',
      [otherError, unavailableError],
      unavailableError,
    ],
    ['an unexpected error last', [otherError], otherError],
  ])(
    'throws %s over answered calls when every call is required',
    (_, searchErrors, expectedError) => {
      expect(
        catchError(() =>
          readSettledHitLists(
            [
              toFulfilled(hitList),
              ...searchErrors.map(toRejected),
              toFulfilled(otherHitList),
            ],
            {isEveryCallRequired: true},
          ),
        ),
      ).toBe(expectedError);
    },
  );

  it('throws a rate limit before a rejected key when every call failed', () => {
    expect(
      catchError(() =>
        readSettledHitLists([
          toRejected(credentialError),
          toRejected(rateLimitError),
        ]),
      ),
    ).toBe(rateLimitError);
  });

  it.each([
    [
      'a rejected key before an unavailable source',
      [otherError, unavailableError, credentialError],
      credentialError,
    ],
    [
      'an unavailable source before an unexpected error',
      [otherError, unavailableError],
      unavailableError,
    ],
    ['an unexpected error last', [otherError], otherError],
  ])('throws %s when every call failed', (_, searchErrors, expectedError) => {
    expect(
      catchError(() => readSettledHitLists(searchErrors.map(toRejected))),
    ).toBe(expectedError);
  });
});
