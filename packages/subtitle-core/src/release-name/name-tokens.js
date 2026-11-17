import {compact, intersection, union, uniq} from 'es-toolkit';

export const RELEASE_FILE_EXTENSIONS = Object.freeze([
  'srt',
  'ass',
  'ssa',
  'vtt',
  'sub',
  'smi',
  'txt',
  'mkv',
  'mp4',
  'avi',
  'm4v',
  'webm',
  'mov',
]);

const RELEASE_FILE_EXTENSION_SET = new Set(RELEASE_FILE_EXTENSIONS);
const COMBINING_DOT_ABOVE = String.fromCodePoint(0x0307);
const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

const dropFileExtension = releaseName => {
  const extensionStart = releaseName.lastIndexOf('.');
  const fileExtension = releaseName.slice(extensionStart + 1);
  return extensionStart >= 0 && RELEASE_FILE_EXTENSION_SET.has(fileExtension)
    ? releaseName.slice(0, extensionStart)
    : releaseName;
};

export const tokenizeReleaseName = releaseName => {
  const lowerName = releaseName
    .normalize('NFC')
    .toLowerCase()
    .replaceAll(COMBINING_DOT_ABOVE, '');
  return compact(dropFileExtension(lowerName).split(TOKEN_SEPARATOR));
};

export const measureNameOverlap = (tokensA, tokensB) => {
  const allTokens = union(tokensA, tokensB);
  if (allTokens.length === 0) {
    return 0;
  }
  return intersection(uniq(tokensA), tokensB).length / allTokens.length;
};
