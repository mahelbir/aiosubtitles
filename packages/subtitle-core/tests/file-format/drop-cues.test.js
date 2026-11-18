import iconv from 'iconv-lite';
import {describe, expect, it} from 'vitest';
import {decodeSubtitleBytes} from '../../src/file-format/decode-text.js';
import {dropCues} from '../../src/file-format/drop-cues.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';
import {
  toCrlf,
  turkishSrtFixture,
  utf16leWithBom,
} from '../helpers/file-format-fixtures.js';

const DROPPED_TEXT = 'Drop this line, it only advertises the free plan.';
const TURKISH_CUE =
  "1\n00:00:07,000 --> 00:00:09,000\nŞişli'de ığdır İstanbul\n";
const isDroppedCue = ({startMs, text}) =>
  startMs < 6000 && text === DROPPED_TEXT;

const readCueTexts = (fileBytes, languageCodeHint) =>
  parseSubtitleText({
    text: decodeSubtitleBytes(fileBytes, {languageCodeHint}).text,
  }).cues.map(({text}) => text);

const withLeadingSrtCue = srtText =>
  `0\n00:00:00,500 --> 00:00:00,900\n${DROPPED_TEXT}\n\n${srtText}`;

describe('dropCues', () => {
  it('returns the same bytes when no cue matches', () => {
    const fileBytes = iconv.encode(turkishSrtFixture(), 'win1254');
    expect(
      dropCues({
        bytes: fileBytes,
        isCueDropped: isDroppedCue,
        languageCodeHint: 'tur',
      }),
    ).toBe(fileBytes);
  });

  it('drops a matching srt block and keeps every other cue', () => {
    const fileBytes = new TextEncoder().encode(
      toCrlf(withLeadingSrtCue(turkishSrtFixture())),
    );
    const cueTexts = readCueTexts(
      dropCues({bytes: fileBytes, isCueDropped: isDroppedCue}),
    );
    expect(cueTexts).not.toContain(DROPPED_TEXT);
    expect(cueTexts[0]).toBe('Günaydın, bugün hava çok güzel.');
  });

  it('cuts a legacy encoded file in its own encoding, so every other byte stays', () => {
    const fileBytes = iconv.encode(withLeadingSrtCue(TURKISH_CUE), 'win1254');
    const keptBytes = dropCues({
      bytes: fileBytes,
      isCueDropped: isDroppedCue,
      languageCodeHint: 'tur',
    });
    expect(
      Buffer.from(keptBytes).equals(iconv.encode(TURKISH_CUE, 'win1254')),
    ).toBe(true);
    expect(readCueTexts(keptBytes, 'tur')).toEqual(["Şişli'de ığdır İstanbul"]);
  });

  it('writes a utf-16 file back as utf-8 text', () => {
    const keptBytes = dropCues({
      bytes: utf16leWithBom(withLeadingSrtCue(TURKISH_CUE)),
      isCueDropped: isDroppedCue,
    });
    expect(readCueTexts(keptBytes)).toEqual(["Şişli'de ığdır İstanbul"]);
  });

  it('drops a matching ass line under the file own event format', () => {
    const assText = [
      '[Script Info]',
      'ScriptType: v4.00+',
      '',
      '[Events]',
      'Format: Layer, Style, Start, End, Name, MarginL, MarginR, MarginV, Effect, Text',
      `Dialogue: 0,Default,0:00:00.50,0:00:05.00,,0,0,0,,${DROPPED_TEXT}`,
      'Dialogue: 0,Default,0:00:07.00,0:00:09.00,,0,0,0,,Hello.',
      '',
    ].join('\r\n');
    expect(
      readCueTexts(
        dropCues({
          bytes: new TextEncoder().encode(assText),
          isCueDropped: isDroppedCue,
        }),
      ),
    ).toEqual(['Hello.']);
  });
});
