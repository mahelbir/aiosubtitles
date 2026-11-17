import {describe, expect, it} from 'vitest';
import {
  SubtitleFileExtension,
  SubtitleFileFormat,
} from '../../src/constants/subtitle-core-enums.js';
import {normalizeCueText} from '../../src/file-format/normalize-cue-text.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';
import {renderSubtitleFile} from '../../src/file-format/render-subtitle.js';
import {
  readFileFormatFixture,
  turkishSrtFixture,
} from '../helpers/file-format-fixtures.js';

const CENTISECOND_MS = 10;

const toNormalizedCues = cues =>
  cues
    .map(({startMs, endMs, text}) => ({
      startMs,
      endMs,
      text: normalizeCueText(text),
    }))
    .filter(cue => cue.text !== '');

const renderAs = (text, fileExtension) =>
  renderSubtitleFile({
    parsedSubtitle: parseSubtitleText({text}),
    fileExtension,
  });

const expectSameCues = (cues, expectedCues, toleranceMs) => {
  expect(expectedCues.length).toBeGreaterThan(0);
  expect(cues).toHaveLength(expectedCues.length);
  cues.forEach((cue, cueIndex) => {
    const expectedCue = expectedCues[cueIndex];
    expect(Math.abs(cue.startMs - expectedCue.startMs)).toBeLessThanOrEqual(
      toleranceMs,
    );
    expect(Math.abs(cue.endMs - expectedCue.endMs)).toBeLessThanOrEqual(
      toleranceMs,
    );
    expect(cue.text).toBe(expectedCue.text);
  });
};

describe('renderSubtitleFile: SRT', () => {
  it('writes numbered SRT blocks from 1 with comma milliseconds', () => {
    const text =
      '4\n00:00:01,000 --> 00:00:02,500\nBirinci.\n\n9\n01:02:03,004 --> 01:02:05,000\nİkinci satır.\nDevamı.\n';

    expect(renderAs(text, SubtitleFileExtension.SRT)).toBe(
      '1\n00:00:01,000 --> 00:00:02,500\nBirinci.\n\n2\n01:02:03,004 --> 01:02:05,000\nİkinci satır.\nDevamı.\n',
    );
  });

  it('writes SRT that reads back to the same cues', () => {
    const srt = turkishSrtFixture();
    const parsedSubtitle = parseSubtitleText({text: srt});
    const renderedSrt = renderAs(srt, SubtitleFileExtension.SRT);

    expect(parsedSubtitle.cues).toHaveLength(12);
    expect(parseSubtitleText({text: renderedSrt}).cues).toEqual(
      parsedSubtitle.cues,
    );
  });

  it.each([
    ['ASS', 'twin.ass'],
    ['SSA', 'sample.ssa'],
    ['VTT', 'sample.vtt'],
    ['MicroDVD', 'microdvd-with-fps.sub'],
  ])(
    'writes SRT from %s that reads back to the same text',
    (_, fixtureName) => {
      const sourceText = readFileFormatFixture(fixtureName);
      const renderedSrt = renderAs(sourceText, SubtitleFileExtension.SRT);
      const renderedSubtitle = parseSubtitleText({text: renderedSrt});

      expect(renderedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.SRT);
      expectSameCues(
        toNormalizedCues(renderedSubtitle.cues),
        toNormalizedCues(parseSubtitleText({text: sourceText}).cues),
        0,
      );
    },
  );

  it.each([
    [
      'ASS',
      `${readFileFormatFixture('twin.ass').split('Dialogue:')[0]}Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Birinci\\N\\N{\\i1}{\\i0}\\NAlt satır\n`,
    ],
    ['MicroDVD', '{1}{1}25.000\n{25}{50}Birinci||Alt satır\n'],
    [
      'VTT',
      'WEBVTT\n\n00:01.000 --> 00:02.000\n<c.yellow></c>\nBirinci\n<v Ayşe></v>\nAlt satır\n',
    ],
  ])(
    'writes no blank line inside an SRT cue written from %s',
    (_, sourceText) => {
      const renderedSrt = renderAs(sourceText, SubtitleFileExtension.SRT);

      expect(renderedSrt).toBe(
        '1\n00:00:01,000 --> 00:00:02,000\nBirinci\nAlt satır\n',
      );
      expect(parseSubtitleText({text: renderedSrt}).cues).toEqual([
        {startMs: 1000, endMs: 2000, text: 'Birinci\nAlt satır'},
      ]);
    },
  );

  it('leaves no ASS override block in SRT written from ASS', () => {
    const renderedSrt = renderAs(
      readFileFormatFixture('twin.ass'),
      SubtitleFileExtension.SRT,
    );

    expect(renderedSrt).toContain('Bu gece şehirde, yağmur var.');
    expect(renderedSrt).not.toMatch(/\{\\/);
    expect(renderedSrt).not.toContain('\\N');
  });
});

describe('renderSubtitleFile: other extensions', () => {
  it('rejects an extension it cannot write', () => {
    expect(() => renderAs(turkishSrtFixture(), 'vtt')).toThrow(
      'Unsupported subtitle file extension: vtt.',
    );
  });
});

describe('renderSubtitleFile: ASS', () => {
  it.each([['twin.ass'], ['sample.ssa']])(
    'returns the source text of %s unchanged',
    fixtureName => {
      const sourceText = readFileFormatFixture(fixtureName);

      expect(renderAs(sourceText, SubtitleFileExtension.ASS)).toBe(sourceText);
    },
  );

  it('builds a minimal ASS document from SRT', () => {
    const renderedAss = renderAs(
      turkishSrtFixture(),
      SubtitleFileExtension.ASS,
    );

    expect(renderedAss).toContain('[Script Info]');
    expect(renderedAss).toContain('[Events]');
    expect(parseSubtitleText({text: renderedAss}).subtitleFileFormat).toBe(
      SubtitleFileFormat.ASS,
    );
  });

  it('writes ASS from SRT that reads back to the same cues', () => {
    const srt =
      '1\n00:00:01,234 --> 00:00:02,567\nBirinci, virgüllü satır.\n\n2\n01:02:03,004 --> 01:02:05,999\n<i>İkinci</i> satır.\nDevamı.\n';
    const renderedAss = renderAs(srt, SubtitleFileExtension.ASS);

    expectSameCues(
      toNormalizedCues(parseSubtitleText({text: renderedAss}).cues),
      toNormalizedCues(parseSubtitleText({text: srt}).cues),
      CENTISECOND_MS,
    );
  });

  it('rounds ASS times to centiseconds and carries into the next second', () => {
    const renderedAss = renderAs(
      '1\n01:02:03,004 --> 01:02:05,999\nBirinci.\n',
      SubtitleFileExtension.ASS,
    );

    expect(renderedAss).toContain('Dialogue: 0,1:02:03.00,1:02:06.00,');
  });

  it('writes SRT line breaks and italics as ASS overrides', () => {
    const renderedAss = renderAs(
      '1\n00:00:01,000 --> 00:00:02,000\n<i>Birinci</i>\nİkinci\n',
      SubtitleFileExtension.ASS,
    );

    expect(renderedAss).toContain(',{\\i1}Birinci{\\i0}\\Nİkinci\n');
    expect(renderedAss).not.toContain('<i>');
  });

  it('writes no SRT block for a cue left empty', () => {
    expect(
      renderSubtitleFile({
        parsedSubtitle: {
          subtitleFileFormat: SubtitleFileFormat.ASS,
          cues: [
            {startMs: 1000, endMs: 2000, text: ''},
            {startMs: 3000, endMs: 4000, text: 'Birinci.'},
          ],
          frameRate: null,
          sourceText: '',
        },
        fileExtension: SubtitleFileExtension.SRT,
      }),
    ).toBe('1\n00:00:03,000 --> 00:00:04,000\nBirinci.\n');
  });

  it('writes the Turkish SRT fixture as ASS with the same cues', () => {
    const srt = turkishSrtFixture();
    const renderedAss = renderAs(srt, SubtitleFileExtension.ASS);

    expectSameCues(
      toNormalizedCues(parseSubtitleText({text: renderedAss}).cues),
      toNormalizedCues(parseSubtitleText({text: srt}).cues),
      CENTISECOND_MS,
    );
  });

  it('writes ASS from MicroDVD that reads back to the same cues', () => {
    const sourceText = readFileFormatFixture('microdvd-with-fps.sub');
    const renderedAss = renderAs(sourceText, SubtitleFileExtension.ASS);

    expectSameCues(
      toNormalizedCues(parseSubtitleText({text: renderedAss}).cues),
      toNormalizedCues(parseSubtitleText({text: sourceText}).cues),
      CENTISECOND_MS,
    );
  });
});
