import {hasValidFile} from '@repo/subtitle-core/deduplication/duplicate-evidence.js';

const hasCues = candidate => candidate.fileFacts?.normalizedCues?.length > 0;

export const readGroupFileFacts = ({rows}) => {
  const candidates = rows.map(({candidate}) => candidate);
  return (
    (candidates.find(hasValidFile) ?? candidates.find(hasCues))?.fileFacts ??
    null
  );
};
