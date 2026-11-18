import {tokenizeReleaseName} from './name-tokens.js';

const URL_PARAMETER_PATTERN = /[?#&][^\s?#&=]+=/u;
const URL_SUFFIX_PATTERN = /[?#].*$/su;
const HEX_DIGEST_PATTERN = /^(?:[\da-f]{32}|[\da-f]{40}|[\da-f]{64})$/u;
const FILLER_TOKEN_PATTERN = /^(?:\d{1,3}|part\d{1,3}|[\da-f]{16,})$/u;
const MIN_NAME_TOKEN_COUNT = 2;
const GENERIC_NAME_TOKENS = new Set([
  'video',
  'stream',
  'index',
  'playlist',
  'master',
  'file',
  'download',
  'media',
  'm3u8',
  'mpd',
  'ts',
]);

const isFillerToken = nameToken =>
  GENERIC_NAME_TOKENS.has(nameToken) || FILLER_TOKEN_PATTERN.test(nameToken);

const MIN_LINK_SLASH_COUNT = 2;

const isLinkName = releaseName =>
  releaseName.includes('://') ||
  releaseName.startsWith('/') ||
  releaseName.split('/').length > MIN_LINK_SLASH_COUNT;

export const reduceReleaseName = releaseName =>
  isLinkName(releaseName)
    ? releaseName.replace(URL_SUFFIX_PATTERN, '').split('/').at(-1)
    : releaseName;

export const isMeaninglessName = releaseName => {
  const reducedName = reduceReleaseName(releaseName);
  if (URL_PARAMETER_PATTERN.test(reducedName)) {
    return true;
  }
  const nameTokens = tokenizeReleaseName(reducedName);
  return (
    nameTokens.length < MIN_NAME_TOKEN_COUNT ||
    HEX_DIGEST_PATTERN.test(nameTokens.join('')) ||
    nameTokens.every(isFillerToken)
  );
};
