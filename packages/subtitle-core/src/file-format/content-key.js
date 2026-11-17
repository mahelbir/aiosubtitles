import {createHash} from 'node:crypto';
import {normalizeCueText} from './normalize-cue-text.js';

export const computeContentKey = cues =>
  createHash('sha256')
    .update(
      cues
        .map(({startMs, endMs, text}) => ({
          startMs,
          endMs,
          text: normalizeCueText(text),
        }))
        .filter(({text}) => text !== '')
        .map(({startMs, endMs, text}) => `${startMs}\t${endMs}\t${text}`)
        .join('\n'),
    )
    .digest('hex');
