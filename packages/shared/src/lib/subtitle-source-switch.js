import {GlobalSwitchState} from '../constants/subtitle-source.js';

function isSwitchOn(switchStates, subtitleSource) {
  return switchStates[subtitleSource] ?? true;
}

export function readGlobalSwitchState({switchStates, subtitleSources}) {
  if (
    subtitleSources.every(subtitleSource =>
      isSwitchOn(switchStates, subtitleSource),
    )
  ) {
    return GlobalSwitchState.ON;
  }
  const isEverySourceOff = subtitleSources.every(
    subtitleSource => !isSwitchOn(switchStates, subtitleSource),
  );
  return isEverySourceOff ? GlobalSwitchState.OFF : GlobalSwitchState.MIXED;
}

export function applyGlobalSwitch({switchStates, subtitleSources}) {
  const isTurningOn =
    readGlobalSwitchState({switchStates, subtitleSources}) !==
    GlobalSwitchState.ON;
  return {
    ...switchStates,
    ...Object.fromEntries(
      subtitleSources.map(subtitleSource => [subtitleSource, isTurningOn]),
    ),
  };
}
