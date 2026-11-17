import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {SubtitleFileExtension} from '../../src/constants/subtitle-core-enums.js';
import {buildFileFacts} from '../../src/file-format/file-facts.js';
import {renderSubtitleFile} from '../../src/file-format/render-subtitle.js';

const HOSTILE_RUN_LENGTH = 100000;
const RUN_TIME_MAX_MS = 1000;
const SLOW_RUN_TIMEOUT_MS = 120000;

const BLANK_LINES = '\n'.repeat(HOSTILE_RUN_LENGTH);
const OPEN_BRACES = '{'.repeat(HOSTILE_RUN_LENGTH);
const ASS_HEADER =
  '[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const SSA_HEADER =
  '[Script Info]\nScriptType: v4.00\n\n[V4 Styles]\n\n[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const ASS_DIALOGUE_PREFIX =
  'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,';
const SSA_DIALOGUE_PREFIX =
  'Dialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,';

const HOSTILE_TEXTS = [
  ['SRT blank lines', `1\n00:00:01,000 --> 00:00:02,000\nBir${BLANK_LINES}`],
  ['SRT open braces', `1\n00:00:01,000 --> 00:00:02,000\n${OPEN_BRACES}\n`],
  ['VTT blank lines', `WEBVTT\n\n00:01.000 --> 00:02.000\nBir${BLANK_LINES}`],
  ['VTT open braces', `WEBVTT\n\n00:01.000 --> 00:02.000\n${OPEN_BRACES}\n`],
  [
    'ASS blank lines',
    `${ASS_HEADER}${BLANK_LINES}${ASS_DIALOGUE_PREFIX}Bir\n${BLANK_LINES}`,
  ],
  ['ASS open braces', `${ASS_HEADER}${ASS_DIALOGUE_PREFIX}${OPEN_BRACES}\n`],
  [
    'SSA blank lines',
    `${SSA_HEADER}${BLANK_LINES}${SSA_DIALOGUE_PREFIX}Bir\n${BLANK_LINES}`,
  ],
  ['SSA open braces', `${SSA_HEADER}${SSA_DIALOGUE_PREFIX}${OPEN_BRACES}\n`],
  ['MicroDVD blank lines', `{25}{50}Bir${BLANK_LINES}`],
  ['MicroDVD open braces', `{25}{50}${OPEN_BRACES}\n`],
  ['plain blank lines', `Bir${BLANK_LINES}iki`],
  ['plain open braces', OPEN_BRACES],
];

describe('hostile input', () => {
  it.each(HOSTILE_TEXTS)(
    'builds facts and renders %s within the time limit',
    (_, text) => {
      const startedAt = performance.now();
      const {parsedSubtitle, fileFacts} = buildFileFacts({
        bytes: Buffer.from(text, 'utf8'),
        fileNameHint: 'altyazi.srt',
        expectedLanguageCode: SubtitleLanguage.TUR,
      });
      renderSubtitleFile({
        parsedSubtitle,
        fileExtension: SubtitleFileExtension.SRT,
      });
      renderSubtitleFile({
        parsedSubtitle,
        fileExtension: SubtitleFileExtension.ASS,
      });

      expect(fileFacts.isFileValid).toBe(false);
      expect(performance.now() - startedAt).toBeLessThan(RUN_TIME_MAX_MS);
    },
    SLOW_RUN_TIMEOUT_MS,
  );
});
