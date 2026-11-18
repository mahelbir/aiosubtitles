import {parse} from 'parsium-media';
import {normalizeParsedFields} from '../normalize-fields.js';

export const parseWithParsium = releaseName => {
  const parsedName = parse(releaseName);
  return normalizeParsedFields({
    releaseGroup: parsedName.releaseGroup,
    releaseSourceFamily: parsedName.source,
    streamingService: parsedName.streamingService,
    releaseEdition: parsedName.editions,
    seasonNumbers: parsedName.seasons,
    episodeNumbers: parsedName.episodes,
    releaseTitle: parsedName.title,
    releaseYear: parsedName.year,
  });
};
