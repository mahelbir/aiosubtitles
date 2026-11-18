import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

export function makeSwitchStatesOnly(subtitleSources) {
  return Object.fromEntries(
    SubtitleSource.values.map(subtitleSource => [
      subtitleSource,
      subtitleSources.includes(subtitleSource),
    ]),
  );
}
