import {isNil, omitBy} from 'es-toolkit';
import {SubtitleSource} from '../constants/subtitle-source.js';
import {listDownloadCredentialKinds} from './download-credential-kinds.js';

export function hasListImprovementSwitch(subtitleSource) {
  return (
    SubtitleSource.has(subtitleSource) &&
    !isNil(SubtitleSource.item(subtitleSource).isListImprovementOnByDefault)
  );
}

export const LIST_IMPROVEMENT_SUBTITLE_SOURCES = Object.freeze(
  SubtitleSource.values.filter(hasListImprovementSwitch),
);

export function isListImprovementCredential({subtitleSource, credentialKind}) {
  return (
    hasListImprovementSwitch(subtitleSource) &&
    listDownloadCredentialKinds(subtitleSource).includes(credentialKind)
  );
}

export function isListImprovementOn({
  listImprovementSwitchStates = {},
  subtitleSource,
}) {
  return (
    hasListImprovementSwitch(subtitleSource) &&
    (listImprovementSwitchStates[subtitleSource] ??
      SubtitleSource.item(subtitleSource).isListImprovementOnByDefault)
  );
}

export function omitDefaultListImprovementStates(listImprovementSwitchStates) {
  return omitBy(
    listImprovementSwitchStates,
    (isOn, subtitleSource) =>
      isOn === SubtitleSource.item(subtitleSource).isListImprovementOnByDefault,
  );
}
