import {describe, expect, it} from 'vitest';
import {SubtitleMessage} from '../../src/constants/subtitle-core-enums.js';
import {buildMessageSrt} from '../../src/file-format/message-srt.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';

describe('buildMessageSrt', () => {
  it('writes the one-line message SRT', () => {
    expect(buildMessageSrt('Subtitle not found.')).toBe(
      '1\n00:00:01,000 --> 00:00:15,000\nSubtitle not found.\n',
    );
  });

  it('writes a file the SRT reader reads back as one cue', () => {
    const messageText = SubtitleMessage.label('SUBTITLE_DOWNLOAD_FAILED');

    expect(
      parseSubtitleText({text: buildMessageSrt(messageText)}).cues,
    ).toEqual([{startMs: 1000, endMs: 15000, text: messageText}]);
  });
});
