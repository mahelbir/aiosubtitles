import {sha256} from 'melperjs/node';

export const computeUrlCode = ({
  subtitleSource,
  siteFileId,
  archiveEntryPath,
}) => sha256(`${subtitleSource}\n${siteFileId}\n${archiveEntryPath ?? ''}`);
