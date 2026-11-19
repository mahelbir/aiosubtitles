import {SubtitleSource} from '../constants/subtitle-source.js';

export function listDownloadCredentialKinds(subtitleSource) {
  if (!SubtitleSource.has(subtitleSource)) {
    return [];
  }
  const {downloadCredentialKinds, credentialKinds} =
    SubtitleSource.item(subtitleSource);
  return downloadCredentialKinds ?? credentialKinds;
}
