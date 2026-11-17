import {renderSrtText} from './render-subtitle.js';

const MESSAGE_START_MS = 1000;
const MESSAGE_END_MS = 15000;

export const buildMessageSrt = message =>
  renderSrtText([
    {startMs: MESSAGE_START_MS, endMs: MESSAGE_END_MS, text: message},
  ]);
