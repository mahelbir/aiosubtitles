import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chunk, isPlainObject, uniq} from 'es-toolkit';
import {readJsonFile} from '../json-file.js';
import {atlasPaths} from './atlas-paths.js';

const NAMES_START = ' | ';
const RELEASE_NAME_SEPARATOR = ' _ ';
const LIST_KEY = 'subtitles';
const JSON_OBJECT_START = '{';
const READ_BATCH_SIZE = 64;

export const getLabelReleaseNames = label => {
  const namesStart = label.indexOf(NAMES_START);
  if (namesStart < 0) {
    return [];
  }
  return label
    .slice(namesStart + NAMES_START.length)
    .split(RELEASE_NAME_SEPARATOR)
    .map(releaseName => releaseName.trim())
    .filter(releaseName => releaseName !== '');
};

export const extractListNames = listBlob =>
  uniq(
    listBlob.subtitles.flatMap(listEntry =>
      typeof listEntry.label === 'string'
        ? getLabelReleaseNames(listEntry.label)
        : [],
    ),
  );

const isListBlob = blobJson =>
  isPlainObject(blobJson) &&
  Object.keys(blobJson).length === 1 &&
  Array.isArray(blobJson[LIST_KEY]);

const parseListBlob = blobText => {
  if (!blobText.trimStart().startsWith(JSON_OBJECT_START)) {
    return null;
  }
  try {
    const blobJson = JSON.parse(blobText);
    return isListBlob(blobJson) ? blobJson : null;
  } catch {
    return null;
  }
};

export const readFrozenLists = async atlasRoot => {
  const frozenRoot = atlasPaths.frozenRoot(atlasRoot);
  const blobPaths = (
    await readdir(frozenRoot, {recursive: true, withFileTypes: true})
  )
    .filter(directoryEntry => directoryEntry.isFile())
    .map(directoryEntry => join(directoryEntry.parentPath, directoryEntry.name))
    .toSorted();
  const listBlobs = [];
  for (const blobPathBatch of chunk(blobPaths, READ_BATCH_SIZE)) {
    const blobTexts = await Promise.all(
      blobPathBatch.map(blobPath => readFile(blobPath, 'utf8')),
    );
    listBlobs.push(...blobTexts.map(parseListBlob).filter(Boolean));
  }
  return listBlobs;
};

export const readVideoFilenames = async atlasRoot => {
  const [identities, ...recordLists] = await Promise.all([
    readJsonFile(atlasPaths.identities(atlasRoot)),
    ...atlasPaths.candidatesData(atlasRoot).map(readJsonFile),
  ]);
  return uniq([
    ...Object.values(identities.videos).map(
      videoIdentity => videoIdentity.fileName,
    ),
    ...recordLists.flat().map(videoRecord => videoRecord.filename),
  ]).filter(Boolean);
};
