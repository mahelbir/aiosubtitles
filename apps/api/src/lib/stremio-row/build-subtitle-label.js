import {ConfidenceWord} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {SubtitleNote} from './stremio-row-enums.js';

export const LABEL_SEPARATOR = ' · ';

const QUOTA_COSTLY_MARK = '$';

const subtitleNoteList = SubtitleNote.toList({
  extra: note => ({noteFlagName: note.raw.noteFlagName}),
});

export const getPresentReleaseName = releaseName =>
  releaseName?.trim() ? releaseName : null;

export const buildSubtitleLabel = ({
  confidenceWord,
  subtitleSourceName,
  noteFlags,
  releaseName,
}) =>
  [
    noteFlags.isQuotaCostly ? QUOTA_COSTLY_MARK : null,
    confidenceWord === null ? null : ConfidenceWord.label(confidenceWord),
    subtitleSourceName,
    ...subtitleNoteList
      .filter(({noteFlagName}) => noteFlags[noteFlagName])
      .map(({label}) => label),
    getPresentReleaseName(releaseName),
  ]
    .filter(labelPart => labelPart !== null)
    .join(LABEL_SEPARATOR);
