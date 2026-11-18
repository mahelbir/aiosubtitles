import {
  SourceCredentialError,
  SourceRateLimitError,
  SourceUnavailableError,
} from './subtitle-source-errors.js';

const SEARCH_ERROR_PRECEDENCE = [SourceCredentialError, SourceUnavailableError];

function findSearchError(searchErrors, SearchError) {
  return searchErrors.find(searchError => searchError instanceof SearchError);
}

export function readSettledHitLists(settledResults) {
  const searchErrors = settledResults
    .filter(({status}) => status === 'rejected')
    .map(({reason}) => reason);
  const rateLimitError = findSearchError(searchErrors, SourceRateLimitError);
  if (rateLimitError) {
    throw rateLimitError;
  }
  if (
    searchErrors.length > 0 &&
    searchErrors.length === settledResults.length
  ) {
    throw (
      SEARCH_ERROR_PRECEDENCE.map(SearchError =>
        findSearchError(searchErrors, SearchError),
      ).find(Boolean) ?? searchErrors[0]
    );
  }
  return settledResults
    .filter(({status}) => status === 'fulfilled')
    .map(({value}) => value);
}
