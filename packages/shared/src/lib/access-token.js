import {SubtitleSource} from '../constants/subtitle-source.js';

const STREMIO_COMMUNITY_SUBTITLES_TOKEN_PATTERN = /^[\w-]{20,64}$/;
const STREMIO_COMMUNITY_SUBTITLES_LINK_PATTERN =
  /^(?:(?:https?|stremio):\/\/)?stremio-community-subtitles\.top\/([\w-]{20,64})\/manifest\.json$/i;

function readStremioCommunitySubtitlesToken(accessTokenInput) {
  const trimmedInput = accessTokenInput.trim();
  if (STREMIO_COMMUNITY_SUBTITLES_TOKEN_PATTERN.test(trimmedInput)) {
    return trimmedInput;
  }
  return (
    STREMIO_COMMUNITY_SUBTITLES_LINK_PATTERN.exec(trimmedInput)?.[1] ?? null
  );
}

const ACCESS_TOKEN_READERS = new Map([
  [
    SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
    readStremioCommunitySubtitlesToken,
  ],
]);

export function readAccessToken(subtitleSource, accessTokenInput) {
  const readToken = ACCESS_TOKEN_READERS.get(subtitleSource);
  return readToken ? readToken(accessTokenInput) : accessTokenInput;
}
