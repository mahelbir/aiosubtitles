import {uniq} from 'es-toolkit';
import {
  extractListNames,
  readFrozenLists,
  readVideoFilenames,
} from '../../corpus/frozen-lists.js';

export {extractListNames};

export const readOwnNameSources = async ({atlasRoot}) => {
  const [videoFilenames, listBlobs] = await Promise.all([
    readVideoFilenames(atlasRoot),
    readFrozenLists(atlasRoot),
  ]);
  const subtitleReleaseNames = uniq(listBlobs.flatMap(extractListNames));
  return {
    ownNames: uniq([...videoFilenames, ...subtitleReleaseNames]).toSorted(),
    subtitleReleaseNameCount: subtitleReleaseNames.length,
    videoFilenameCount: videoFilenames.length,
  };
};

export const readOwnNames = async ({atlasRoot}) =>
  (await readOwnNameSources({atlasRoot})).ownNames;
