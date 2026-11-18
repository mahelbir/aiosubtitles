import {GlobalSwitchState} from '../constants/subtitle-source.js';

export function isSubtitleSourceSwitchLocked({credentials}) {
  return credentials.length > 0;
}

export function applySubtitleSourceSwitchLocks({switchStates, credentials}) {
  const lockedOffSubtitleSources = credentials
    .map(({subtitleSource}) => subtitleSource)
    .filter(subtitleSource => switchStates[subtitleSource] === false);
  if (lockedOffSubtitleSources.length === 0) {
    return switchStates;
  }
  return {
    ...switchStates,
    ...Object.fromEntries(
      lockedOffSubtitleSources.map(subtitleSource => [subtitleSource, true]),
    ),
  };
}

function isSwitchOn({switchStates, lockedSubtitleSources}, subtitleSource) {
  return (
    lockedSubtitleSources.includes(subtitleSource) ||
    (switchStates[subtitleSource] ?? true)
  );
}

export function readGlobalSwitchState({
  switchStates,
  lockedSubtitleSources,
  subtitleSources,
}) {
  const switches = {switchStates, lockedSubtitleSources};
  if (
    subtitleSources.every(subtitleSource =>
      isSwitchOn(switches, subtitleSource),
    )
  ) {
    return GlobalSwitchState.ON;
  }
  const [locked, unlocked] = [true, false].map(isLocked =>
    subtitleSources.filter(
      subtitleSource =>
        lockedSubtitleSources.includes(subtitleSource) === isLocked,
    ),
  );
  const isEveryUnlockedOff = unlocked.every(
    subtitleSource => !isSwitchOn(switches, subtitleSource),
  );
  return isEveryUnlockedOff && locked.length === 0
    ? GlobalSwitchState.OFF
    : GlobalSwitchState.MIXED;
}

export function applyGlobalSwitch({
  switchStates,
  lockedSubtitleSources,
  subtitleSources,
}) {
  const isTurningOff =
    readGlobalSwitchState({
      switchStates,
      lockedSubtitleSources,
      subtitleSources,
    }) === GlobalSwitchState.ON;
  return {
    ...switchStates,
    ...Object.fromEntries(
      subtitleSources.map(subtitleSource => [
        subtitleSource,
        !isTurningOff || lockedSubtitleSources.includes(subtitleSource),
      ]),
    ),
  };
}
