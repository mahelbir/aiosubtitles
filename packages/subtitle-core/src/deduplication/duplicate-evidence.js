export const readSiteIdentityKey = candidate =>
  JSON.stringify([
    candidate.subtitleSource,
    candidate.siteFileId,
    candidate.archiveEntryPath,
  ]);

export const hasValidFile = candidate =>
  candidate.fileFacts?.isFileValid === true;
