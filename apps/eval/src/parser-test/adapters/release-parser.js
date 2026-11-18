import {parseTorrentTitle} from '@aiostreams/release-parser';
import {normalizeParsedFields} from '../normalize-fields.js';

const EDITION_FLAG_NAMES = {extended: 'Extended', unrated: 'Unrated'};

export const parseWithReleaseParser = releaseName => {
  const parsedTitle = parseTorrentTitle(releaseName);
  return normalizeParsedFields({
    releaseGroup: parsedTitle.group,
    releaseSourceFamily: parsedTitle.quality,
    streamingService: parsedTitle.network,
    releaseEdition: [
      ...(parsedTitle.editions ?? []),
      ...Object.entries(EDITION_FLAG_NAMES)
        .filter(([flagName]) => parsedTitle[flagName] === true)
        .map(([, editionName]) => editionName),
    ],
    seasonNumbers: parsedTitle.seasons,
    episodeNumbers: parsedTitle.episodes,
    releaseTitle: parsedTitle.title,
    releaseYear: parsedTitle.year,
  });
};
