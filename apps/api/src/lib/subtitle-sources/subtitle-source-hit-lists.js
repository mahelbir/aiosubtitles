import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from './subtitle-source-errors.js';

const SEARCH_ERROR_PRECEDENCE = [
  SourceRateLimitError,
  SourceCredentialError,
  SourceUnavailableError,
];

function findSearchError(searchErrors, SearchError) {
  return searchErrors.find(searchError => searchError instanceof SearchError);
}

function pickSearchError(searchErrors) {
  return (
    SEARCH_ERROR_PRECEDENCE.map(SearchError =>
      findSearchError(searchErrors, SearchError),
    ).find(Boolean) ?? searchErrors[0]
  );
}

export function readSettledHitLists(
  settledResults,
  {isPartialKept = false, isEveryCallRequired = false} = {},
) {
  const searchErrors = settledResults
    .filter(({status}) => status === 'rejected')
    .map(({reason}) => reason);
  const hitLists = settledResults
    .filter(({status}) => status === 'fulfilled')
    .map(({value}) => value);
  const rateLimitError = findSearchError(searchErrors, SourceRateLimitError);
  if (rateLimitError && !(isPartialKept && hitLists.length > 0)) {
    throw rateLimitError;
  }
  if (
    searchErrors.length > 0 &&
    (isEveryCallRequired || hitLists.length === 0)
  ) {
    throw pickSearchError(searchErrors);
  }
  return hitLists;
}
