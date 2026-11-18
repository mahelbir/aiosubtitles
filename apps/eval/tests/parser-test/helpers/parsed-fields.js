import {sortBy} from 'es-toolkit';

export const ABSENT_PARSED_FIELDS = {
  releaseGroup: null,
  releaseSourceFamily: null,
  streamingService: null,
  releaseEdition: null,
  seasonNumbers: [],
  episodeNumbers: [],
  releaseTitle: null,
  releaseYear: null,
};

export const buildParsedFields = overrides => ({
  ...ABSENT_PARSED_FIELDS,
  ...overrides,
});

export const sortNameCases = nameCases =>
  Array.isArray(nameCases)
    ? sortBy(nameCases, [nameCase => nameCase.releaseName])
    : nameCases;
