import {compact, uniq} from 'es-toolkit';
import {ReleaseSourceFamily} from '../constants/subtitle-core-enums.js';

const AUDIO_TAG_SOURCE_HINTS = Object.freeze([
  {
    audioTagStart: /^(truehd|dts-?hd|atmos)/i,
    sourceFamily: ReleaseSourceFamily.BLURAY,
  },
  {
    audioTagStart: /^(ddp|dd\+|e-?ac-?3)/i,
    sourceFamily: ReleaseSourceFamily.WEB,
  },
]);

const readAudioTagSourceFamily = audioTag =>
  AUDIO_TAG_SOURCE_HINTS.find(({audioTagStart}) => audioTagStart.test(audioTag))
    ?.sourceFamily;

export const inferReleaseSourceFamilyFromAudio = audioTags => {
  const hintedFamilies = uniq(compact(audioTags.map(readAudioTagSourceFamily)));
  return hintedFamilies.length === 1 ? hintedFamilies[0] : null;
};
