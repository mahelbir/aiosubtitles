import {castArray} from 'es-toolkit/compat';
import {
  lookupSourceFamily,
  normalizeParsedFields,
} from '../normalize-fields.js';

const HD_RIP_PARTS = ['HD', 'Rip'];
const HD_RIP_TOKEN = 'hdrip';

const readOtherSource = otherValues => {
  if (HD_RIP_PARTS.every(hdRipPart => otherValues.includes(hdRipPart))) {
    return HD_RIP_TOKEN;
  }
  return otherValues.find(
    otherValue =>
      typeof otherValue === 'string' && lookupSourceFamily(otherValue) !== null,
  );
};

const readGuessitSource = guessitReading =>
  guessitReading.source ??
  readOtherSource(castArray(guessitReading.other ?? []));

export const toGuessitRawFields = guessitReading => ({
  releaseGroup: guessitReading.release_group,
  releaseSourceFamily: readGuessitSource(guessitReading),
  streamingService: guessitReading.streaming_service,
  releaseEdition: guessitReading.edition,
  seasonNumbers: guessitReading.season,
  episodeNumbers: guessitReading.episode,
  releaseTitle: guessitReading.title,
  releaseYear: guessitReading.year,
});

export const parseWithGuessit = (releaseName, guessitOutput) => {
  if (!Object.hasOwn(guessitOutput.parsedByName, releaseName)) {
    throw new RangeError('The guessit output does not hold a release name.');
  }
  return normalizeParsedFields(
    toGuessitRawFields(guessitOutput.parsedByName[releaseName]),
  );
};
