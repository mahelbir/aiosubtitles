import {ConfidenceWord} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {SubtitleNote} from './stremio-row-enums.js';

export const LABEL_SEPARATOR = ' · ';

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
    confidenceWord === null ? null : ConfidenceWord.label(confidenceWord),
    subtitleSourceName,
    ...subtitleNoteList
      .filter(({noteFlagName}) => noteFlags[noteFlagName])
      .map(({label}) => label),
    getPresentReleaseName(releaseName),
  ]
    .filter(labelPart => labelPart !== null)
    .join(LABEL_SEPARATOR);
