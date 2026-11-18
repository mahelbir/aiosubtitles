import {filenameParse} from '@ctrl/video-filename-parser';
import {normalizeParsedFields} from '../normalize-fields.js';

const YEAR_EPISODE_DIGITS = 2;

const isYearReadAsEpisode = ({tvReading, movieReading}) =>
  movieReading.year !== null &&
  tvReading.seasons.length === 1 &&
  tvReading.episodeNumbers.length === 1 &&
  `${tvReading.seasons[0]}${String(tvReading.episodeNumbers[0]).padStart(YEAR_EPISODE_DIGITS, '0')}` ===
    movieReading.year;

export const chooseVideoFilenameReading = releaseName => {
  const tvReading = filenameParse(releaseName, true);
  const movieReading = filenameParse(releaseName, false);
  return tvReading.isTv === true &&
    !isYearReadAsEpisode({tvReading, movieReading})
    ? tvReading
    : movieReading;
};

export const parseWithVideoFilenameParser = releaseName => {
  const parsedName = chooseVideoFilenameReading(releaseName);
  return normalizeParsedFields({
    releaseGroup: parsedName.group,
    releaseSourceFamily: parsedName.sources,
    releaseEdition: Object.keys(parsedName.edition).filter(
      editionFlagName => parsedName.edition[editionFlagName] === true,
    ),
    seasonNumbers: parsedName.seasons,
    episodeNumbers: parsedName.episodeNumbers,
    releaseTitle: parsedName.title,
    releaseYear: parsedName.year,
  });
};
