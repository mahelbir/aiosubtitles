import {sortBy} from 'es-toolkit';
import {tokenizeReleaseName} from '../release-name/name-tokens.js';
import {parseReleaseName} from '../release-name/parse-release-name.js';

const PARTIAL_SUBTITLE_TOKENS = Object.freeze(['sdh', 'hi', 'forced']);

const parseEntryName = entryName =>
  parseReleaseName(entryName, {isArchiveEntry: true});

const readEntryFileName = entryPath => entryPath.split('/').at(-1);

const hasPartialSubtitleMarker = entryPath =>
  tokenizeReleaseName(readEntryFileName(entryPath)).some(nameToken =>
    PARTIAL_SUBTITLE_TOKENS.includes(nameToken),
  );

const readFolderSeasonNumbers = entryPath =>
  entryPath
    .split('/')
    .slice(0, -1)
    .map(folderName => parseEntryName(folderName).seasonNumbers)
    .findLast(seasonNumbers => seasonNumbers.length > 0) ?? [];

const isEntryForVideo = (entryPath, {seasonNumber, episodeNumber}) => {
  const {seasonNumbers, episodeNumbers, partNumber} = parseEntryName(
    readEntryFileName(entryPath),
  );
  if (partNumber != null) {
    return false;
  }
  if (episodeNumber == null) {
    return true;
  }
  const entrySeasonNumbers =
    seasonNumbers.length > 0
      ? seasonNumbers
      : readFolderSeasonNumbers(entryPath);
  return (
    episodeNumbers.includes(episodeNumber) &&
    (entrySeasonNumbers.length === 0 ||
      entrySeasonNumbers.includes(seasonNumber))
  );
};

const isEntryForAlternateEpisode = (entryPath, alternateEpisodeNumber) => {
  const {episodeNumbers, partNumber} = parseEntryName(
    readEntryFileName(entryPath),
  );
  return partNumber == null && episodeNumbers.includes(alternateEpisodeNumber);
};

const listCatalogEntries = ({entryPaths, seasonNumber, episodeNumber}) =>
  entryPaths.filter(entryPath =>
    isEntryForVideo(entryPath, {seasonNumber, episodeNumber}),
  );

export const listArchiveEntriesForVideo = ({
  entryPaths,
  seasonNumber,
  episodeNumber,
  alternateEpisodeNumber = null,
}) => {
  const catalogEntries = listCatalogEntries({
    entryPaths,
    seasonNumber,
    episodeNumber,
  });
  return catalogEntries.length > 0 ||
    episodeNumber == null ||
    alternateEpisodeNumber == null
    ? catalogEntries
    : entryPaths.filter(entryPath =>
        isEntryForAlternateEpisode(entryPath, alternateEpisodeNumber),
      );
};

export const pickArchiveEntryForVideo = ({
  entryPaths,
  seasonNumber,
  episodeNumber,
  alternateEpisodeNumber = null,
}) =>
  sortBy(
    listArchiveEntriesForVideo({
      entryPaths,
      seasonNumber,
      episodeNumber,
      alternateEpisodeNumber,
    }),
    [
      hasPartialSubtitleMarker,
      entryPath => entryPath.length,
      entryPath => entryPath,
    ],
  )[0] ?? null;
