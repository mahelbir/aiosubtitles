import {describe, expect, it} from 'vitest';
import {SubtitleFileFormat} from '../../src/constants/subtitle-core-enums.js';
import {normalizeCueText} from '../../src/file-format/normalize-cue-text.js';
import {
  MICRODVD_OPEN_CUE_DURATION_MS,
  parseSubtitleText,
} from '../../src/file-format/parse-subtitle.js';
import {
  readFileFormatFixture,
  toCrlf,
  turkishSrtFixture,
} from '../helpers/file-format-fixtures.js';

const MICRODVD_DEFAULT_FRAME_RATE = 23.976;

const toNormalizedCues = cues =>
  cues.map(({startMs, endMs, text}) => ({
    startMs,
    endMs,
    text: normalizeCueText(text),
  }));

const TWIN_CUES = [
  {startMs: 1500, endMs: 3250, text: 'Merhaba, nasılsın?'},
  {startMs: 4000, endMs: 6120, text: 'İyiyim, teşekkürler. Sen nasılsın?'},
  {startMs: 7350, endMs: 9000, text: 'Bu gece şehirde, yağmur var.'},
  {startMs: 62040, endMs: 65990, text: 'Görüşürüz, ağabey.'},
];

const SAMPLE_TEXTS = [
  'Merhaba, nasılsın?',
  'İyiyim, teşekkürler. Sen nasılsın?',
  'Görüşürüz.',
];

const expectCuesNear = (cues, expectedCues, toleranceMs) => {
  expect(cues).toHaveLength(expectedCues.length);
  cues.forEach((cue, cueIndex) => {
    const expectedCue = expectedCues[cueIndex];
    expect(Math.abs(cue.startMs - expectedCue.startMs)).toBeLessThanOrEqual(
      toleranceMs,
    );
    expect(Math.abs(cue.endMs - expectedCue.endMs)).toBeLessThanOrEqual(
      toleranceMs,
    );
    expect(normalizeCueText(cue.text)).toBe(expectedCue.text);
  });
};

describe('parseSubtitleText: SRT', () => {
  it('reads the cues of a plain SRT file', () => {
    const parsedSubtitle = parseSubtitleText({text: turkishSrtFixture()});

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.SRT);
    expect(parsedSubtitle.cues).toHaveLength(12);
    expect(parsedSubtitle.cues[0]).toEqual({
      startMs: 1000,
      endMs: 3500,
      text: 'Günaydın, bugün hava çok güzel.',
    });
    expect(parsedSubtitle.cues[11]).toEqual({
      startMs: 37000,
      endMs: 40000,
      text: 'Hoşça kal, kendine iyi bak.',
    });
    expect(parsedSubtitle.frameRate).toBeNull();
  });

  it('keeps the two lines of a cue apart with one line break', () => {
    const parsedSubtitle = parseSubtitleText({text: turkishSrtFixture()});

    expect(parsedSubtitle.cues).toHaveLength(12);
    expect(parsedSubtitle.cues[3].text).toBe(
      'Çocuklar arka koltukta şarkı söylüyordu.\nÖğretmenleri de onlara eşlik ediyordu.',
    );
  });

  it('keeps the source text', () => {
    const text = turkishSrtFixture();

    expect(parseSubtitleText({text}).sourceText).toBe(text);
  });

  it('reads SRT with CRLF, a byte-order mark, index gaps and no trailing blank line', () => {
    const text = toCrlf(
      '﻿3\n00:00:01,000 --> 00:00:02,500\nBirinci satır.\n\n7\n00:00:03,000 --> 00:00:04,250\nİkinci satır.\nDevamı.\n\n12\n00:01:05,040 --> 00:01:07,000\nÜçüncü satır.',
    );
    const parsedSubtitle = parseSubtitleText({text});

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.SRT);
    expect(parsedSubtitle.cues).toEqual([
      {startMs: 1000, endMs: 2500, text: 'Birinci satır.'},
      {startMs: 3000, endMs: 4250, text: 'İkinci satır.\nDevamı.'},
      {startMs: 65040, endMs: 67000, text: 'Üçüncü satır.'},
    ]);
  });

  it('reads SRT with a dot before the milliseconds and extra blank lines', () => {
    const text =
      '\n\n1\n00:00:01.000 --> 00:00:02.000\nBirinci.\n\n\n\n2\n00:00:03,000 --> 00:00:04,000\nİkinci.\n\n\n';

    expect(toNormalizedCues(parseSubtitleText({text}).cues)).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci.'},
      {startMs: 3000, endMs: 4000, text: 'İkinci.'},
    ]);
  });

  it('drops SRT cues that end before or when they start', () => {
    const text =
      '1\n00:00:01,000 --> 00:00:02,000\nBirinci.\n\n2\n00:12:10,500 --> 00:00:00,000\n--> 00:12:13,250\nBozuk.\n\n3\n00:00:05,000 --> 00:00:05,000\nSıfır.\n\n4\n00:00:07,000 --> 00:00:08,000\nİkinci.\n';

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci.'},
      {startMs: 7000, endMs: 8000, text: 'İkinci.'},
    ]);
  });

  it('reads SRT cues with no blank line between them', () => {
    const text =
      '1\n00:00:01,000 --> 00:00:02,000\nBirinci.\n2\n00:00:03,000 --> 00:00:04,000\nİkinci.\n';

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci.'},
      {startMs: 3000, endMs: 4000, text: 'İkinci.'},
    ]);
  });

  it('reads SRT times with short fractions, no hours and trailing coordinates', () => {
    const text = '1\n00:01,5 --> 00:02,25 X1:10 X2:20 Y1:30 Y2:40\nBirinci.\n';

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1500, endMs: 2250, text: 'Birinci.'},
    ]);
  });

  it('keeps a number as the last line of the last cue', () => {
    const text = '1\n00:00:01,000 --> 00:00:02,000\nSayı:\n42';

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Sayı:\n42'},
    ]);
  });

  it('sorts SRT cues listed out of order', () => {
    const text =
      '1\n00:00:03,000 --> 00:00:04,000\nİkinci.\n\n2\n00:00:01,000 --> 00:00:02,000\nBirinci.\n';

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci.'},
      {startMs: 3000, endMs: 4000, text: 'İkinci.'},
    ]);
  });

  it('detects SRT by content when the file name says otherwise', () => {
    const parsedSubtitle = parseSubtitleText({
      text: turkishSrtFixture(),
      fileNameHint: 'Film.2024.1080p.WEB-DL.txt',
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.SRT);
    expect(parsedSubtitle.cues).toHaveLength(12);
  });
});

describe('parseSubtitleText: VTT', () => {
  it('reads WebVTT with a header, notes, styles, cue ids and cue settings', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('sample.vtt'),
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.VTT);
    expect(toNormalizedCues(parsedSubtitle.cues)).toEqual([
      {startMs: 1000, endMs: 3500, text: SAMPLE_TEXTS[0]},
      {startMs: 4000, endMs: 6120, text: SAMPLE_TEXTS[1]},
      {startMs: 3723004, endMs: 3725000, text: SAMPLE_TEXTS[2]},
    ]);
    expect(parsedSubtitle.frameRate).toBeNull();
  });
});

describe('parseSubtitleText: VTT character references', () => {
  it('decodes named and numeric character references in cue text', () => {
    const text =
      'WEBVTT\n\n00:01.000 --> 00:02.000\n&lrm;Tom &amp; Jerry&nbsp;geldi &#233;&#x15F;&rlm;\n';
    const [cue] = parseSubtitleText({text}).cues;

    expect(cue.text).toBe(
      `${String.fromCharCode(0x200e)}Tom & Jerry${String.fromCharCode(0xa0)}geldi éş${String.fromCharCode(0x200f)}`,
    );
    expect(normalizeCueText(cue.text)).toContain('Tom & Jerry geldi éş');
  });
});

describe('parseSubtitleText: ASS events', () => {
  const ASS_SCRIPT_START = '[Script Info]\nScriptType: v4.00+\n\n[Events]\n';
  const ASS_FORMAT_LINE =
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  it('reads times with no fraction and skips events with a bad time', () => {
    const text = `${ASS_SCRIPT_START}${ASS_FORMAT_LINE}Dialogue: 0,0:00:01,0:00:02,Default,,0,0,0,,Birinci\nDialogue: 0,bozuk,0:00:04.00,Default,,0,0,0,,Bozuk\n`;

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci'},
    ]);
  });

  it('skips events when the format has no start field', () => {
    const text = `${ASS_SCRIPT_START}Format: Layer, End, Style, Name, MarginL, MarginR, MarginV, Effect, Extra, Text\nDialogue: 0,0:00:02.00,Default,,0,0,0,,x,Birinci\n`;

    expect(parseSubtitleText({text}).cues).toEqual([]);
  });

  it('reads no event when the format does not end with the text field', () => {
    const text = `${ASS_SCRIPT_START}Format: Layer, Start, End, Text, Style\nDialogue: 0,0:00:01.00,0:00:02.00,Birinci,Default\n`;

    expect(parseSubtitleText({text}).cues).toEqual([]);
  });

  it('reads a section header with a trailing comment', () => {
    const text =
      '[Script Info] ; başlık\nScriptType: v4.00+\n\n[Events] ; not\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Birinci\n';
    const parsedSubtitle = parseSubtitleText({text});

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.ASS);
    expect(parsedSubtitle.cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci'},
    ]);
  });

  it('reads dialogue only inside the events section', () => {
    const text =
      '[Script Info]\nScriptType: v4.00+\nDialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Dışarıda\n\n[Events]\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,İçeride\n';

    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'İçeride'},
    ]);
  });
});

describe('parseSubtitleText: ASS and SSA', () => {
  it('reads ASS dialogue with commas, override blocks and \\N', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('twin.ass'),
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.ASS);
    expect(
      toNormalizedCues(parsedSubtitle.cues).filter(cue => cue.text !== ''),
    ).toEqual(TWIN_CUES);
    expect(parsedSubtitle.frameRate).toBeNull();
  });

  it('skips ASS comment lines', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('twin.ass'),
    });

    const cueTexts = parsedSubtitle.cues.map(cue => normalizeCueText(cue.text));

    expect(cueTexts).toContain('Merhaba, nasılsın?');
    expect(cueTexts).not.toContain('Bu satır yorumdur.');
  });

  it('reads SSA v4 dialogue', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('sample.ssa'),
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.SSA);
    expect(toNormalizedCues(parsedSubtitle.cues)).toEqual([
      {startMs: 1000, endMs: 3500, text: SAMPLE_TEXTS[0]},
      {startMs: 4000, endMs: 6120, text: SAMPLE_TEXTS[1]},
      {startMs: 3723000, endMs: 3725000, text: SAMPLE_TEXTS[2]},
    ]);
  });

  it('sorts ASS events by start, then end, keeping ties in file order', () => {
    const assHeader = readFileFormatFixture('twin.ass').split('Dialogue:')[0];
    const dialogueLines = [
      '0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Üçüncü',
      '0,0:00:01.00,0:00:04.00,Default,,0,0,0,,İkinci',
      '0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Birinci',
      '0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Dördüncü',
    ].map(dialogueLine => `Dialogue: ${dialogueLine}\n`);

    expect(
      parseSubtitleText({text: assHeader + dialogueLines.join('')}).cues,
    ).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Birinci'},
      {startMs: 1000, endMs: 4000, text: 'İkinci'},
      {startMs: 5000, endMs: 6000, text: 'Üçüncü'},
      {startMs: 5000, endMs: 6000, text: 'Dördüncü'},
    ]);
  });

  it('gives ASS dialogue text with \\N as a line break and no override block', () => {
    const cueTexts = parseSubtitleText({
      text: readFileFormatFixture('twin.ass'),
    }).cues.map(cue => cue.text);

    expect(cueTexts).toContain('İyiyim, teşekkürler.\nSen nasılsın?');
    expect(cueTexts).toContain('Bu gece şehirde, yağmur var.');
  });

  it('drops a drawing-only ASS event from the cues', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('twin.ass'),
    });

    expect(parsedSubtitle.cues).toHaveLength(4);
  });

  it('takes the file name hint for a script with no version marker', () => {
    const text =
      '[Script Info]\nTitle: Sürümsüz\n\n[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Merhaba\n';

    expect(
      parseSubtitleText({text, fileNameHint: 'altyazi.ssa'}).subtitleFileFormat,
    ).toBe(SubtitleFileFormat.SSA);
    expect(
      parseSubtitleText({text, fileNameHint: 'altyazi.ass'}).subtitleFileFormat,
    ).toBe(SubtitleFileFormat.ASS);
    expect(parseSubtitleText({text}).cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Merhaba'},
    ]);
  });

  it('reads ASS with CRLF line endings', () => {
    const parsedSubtitle = parseSubtitleText({
      text: toCrlf(readFileFormatFixture('twin.ass')),
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.ASS);
    expect(
      toNormalizedCues(parsedSubtitle.cues).filter(cue => cue.text !== ''),
    ).toEqual(TWIN_CUES);
  });
});

describe('parseSubtitleText: MicroDVD', () => {
  it('uses the frame rate of the {1}{1} header', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('microdvd-with-fps.sub'),
      fallbackFrameRate: 23.976,
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.MICRODVD);
    expect(parsedSubtitle.frameRate).toBe(25);
    expect(toNormalizedCues(parsedSubtitle.cues)).toEqual([
      {startMs: 1000, endMs: 2000, text: SAMPLE_TEXTS[0]},
      {startMs: 4000, endMs: 6120, text: SAMPLE_TEXTS[1]},
      {startMs: 60000, endMs: 63000, text: SAMPLE_TEXTS[2]},
    ]);
  });

  it('uses the fallback frame rate when the file has no header', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('microdvd-without-fps.sub'),
      fallbackFrameRate: 25,
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.MICRODVD);
    expectCuesNear(
      parsedSubtitle.cues,
      [
        {startMs: 960, endMs: 1920, text: SAMPLE_TEXTS[0]},
        {startMs: 3840, endMs: 5760, text: SAMPLE_TEXTS[1]},
        {startMs: 57560, endMs: 60440, text: SAMPLE_TEXTS[2]},
      ],
      1,
    );
  });

  it('uses 23.976 fps and a null frame rate without a header or fallback', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('microdvd-without-fps.sub'),
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.MICRODVD);
    expect(parsedSubtitle.frameRate).toBeNull();
    expectCuesNear(
      parsedSubtitle.cues,
      [
        {
          startMs: (24 / MICRODVD_DEFAULT_FRAME_RATE) * 1000,
          endMs: (48 / MICRODVD_DEFAULT_FRAME_RATE) * 1000,
          text: SAMPLE_TEXTS[0],
        },
        {
          startMs: (96 / MICRODVD_DEFAULT_FRAME_RATE) * 1000,
          endMs: (144 / MICRODVD_DEFAULT_FRAME_RATE) * 1000,
          text: SAMPLE_TEXTS[1],
        },
        {
          startMs: (1439 / MICRODVD_DEFAULT_FRAME_RATE) * 1000,
          endMs: (1511 / MICRODVD_DEFAULT_FRAME_RATE) * 1000,
          text: SAMPLE_TEXTS[2],
        },
      ],
      1,
    );
  });

  it('reads MicroDVD with CRLF line endings', () => {
    const parsedSubtitle = parseSubtitleText({
      text: toCrlf(readFileFormatFixture('microdvd-with-fps.sub')),
    });

    expect(parsedSubtitle.frameRate).toBe(25);
    expect(parsedSubtitle.cues.map(cue => cue.text)).toEqual([
      'Merhaba, nasılsın?',
      'İyiyim, teşekkürler.\nSen nasılsın?',
      'Görüşürüz.',
    ]);
  });

  it('gives a null frame rate when the fallback timed the cues', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('microdvd-without-fps.sub'),
      fallbackFrameRate: 25,
    });

    expect(parsedSubtitle.frameRate).toBeNull();
  });

  it('turns | into a line break and drops control codes', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('microdvd-with-fps.sub'),
    });

    expect(parsedSubtitle.cues[1].text).toBe(
      'İyiyim, teşekkürler.\nSen nasılsın?',
    );
  });

  it('treats a header of zero frames per second as no header', () => {
    const parsedSubtitle = parseSubtitleText({
      text: '{1}{1}0\n{25}{50}Merhaba\n',
      fallbackFrameRate: 25,
    });

    expect(parsedSubtitle.frameRate).toBeNull();
    expect(parsedSubtitle.cues).toEqual([
      {startMs: 1000, endMs: 2000, text: 'Merhaba'},
    ]);
  });

  it('gives a line with an empty end frame a fixed duration', () => {
    const parsedSubtitle = parseSubtitleText({
      text: '{1}{1}25\n{25}{}Merhaba\n',
    });

    expect(parsedSubtitle.cues).toEqual([
      {
        startMs: 1000,
        endMs: 1000 + MICRODVD_OPEN_CUE_DURATION_MS,
        text: 'Merhaba',
      },
    ]);
  });

  it('strips the / italic marker from each line', () => {
    const parsedSubtitle = parseSubtitleText({
      text: '{1}{1}25\n{25}{50}/Merhaba|/nasılsın?\n',
    });

    expect(parsedSubtitle.cues[0].text).toBe('Merhaba\nnasılsın?');
  });

  it('gives whole-millisecond cue times', () => {
    const parsedSubtitle = parseSubtitleText({
      text: readFileFormatFixture('microdvd-without-fps.sub'),
    });

    expect(parsedSubtitle.cues).toHaveLength(3);
    expect(
      parsedSubtitle.cues.every(
        cue => Number.isInteger(cue.startMs) && Number.isInteger(cue.endMs),
      ),
    ).toBe(true);
  });
});

describe('parseSubtitleText: unreadable text', () => {
  it('marks text with no subtitle format as OTHER with no cues', () => {
    const parsedSubtitle = parseSubtitleText({
      text: 'Bu bir altyazı dosyası değil.\nSadece düz metin.\n',
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.OTHER);
    expect(parsedSubtitle.cues).toEqual([]);
    expect(parsedSubtitle.frameRate).toBeNull();
  });

  it('marks an HTML page as OTHER with no cues', () => {
    const parsedSubtitle = parseSubtitleText({
      text: '<!DOCTYPE html>\n<html><head><title>404</title></head><body>Not found</body></html>\n',
      fileNameHint: 'altyazi.srt',
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.OTHER);
    expect(parsedSubtitle.cues).toEqual([]);
  });

  it('gives a broken ASS script no cues instead of throwing', () => {
    const parsedSubtitle = parseSubtitleText({
      text: '[Script Info]\nScriptType: v4.00+\n\n[Events]\nDialogue: bozuk satır\n',
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.ASS);
    expect(parsedSubtitle.cues).toEqual([]);
  });

  it('marks empty text as OTHER with no cues', () => {
    const parsedSubtitle = parseSubtitleText({text: ''});

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.OTHER);
    expect(parsedSubtitle.cues).toEqual([]);
  });
});
