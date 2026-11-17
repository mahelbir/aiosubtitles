import iconv from 'iconv-lite';
import {describe, expect, it} from 'vitest';
import {SubtitleLanguage} from '@repo/shared/constants/subtitle-language.js';
import {
  SubtitleFileFormat,
  SubtitleFileInvalidReason,
} from '../../src/constants/subtitle-core-enums.js';
import {computeContentKey} from '../../src/file-format/content-key.js';
import {buildFileFacts} from '../../src/file-format/file-facts.js';
import {normalizeCueText} from '../../src/file-format/normalize-cue-text.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';
import {
  readFileFormatFixture,
  turkishSrtFixture,
} from '../helpers/file-format-fixtures.js';

describe('buildFileFacts', () => {
  it('builds the facts of a Windows-1254 Turkish SRT', () => {
    const srt = turkishSrtFixture();
    const utf8Cues = parseSubtitleText({text: srt}).cues;

    const {fileFacts, parsedSubtitle, fileEncoding} = buildFileFacts({
      bytes: iconv.encode(srt, 'win1254'),
      fileNameHint: 'Film.2024.1080p.WEB-DL.srt',
      expectedLanguageCode: SubtitleLanguage.TUR,
    });

    expect(fileEncoding).toMatch(/^(windows-1254|iso-8859-9)$/);
    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.SRT);
    expect(parsedSubtitle.sourceText).toBe(srt);
    expect(fileFacts).toEqual({
      contentKey: computeContentKey(utf8Cues),
      isFileValid: true,
      fileInvalidReasons: [],
      cueCount: 12,
      lastCueEndMs: 40000,
      detectedLanguageCode: SubtitleLanguage.TUR,
      normalizedCues: utf8Cues.map(({startMs, endMs, text}) => ({
        startMs,
        endMs,
        text: normalizeCueText(text),
      })),
    });
  });

  it('gives a UTF-8 file and its Windows-1254 twin one content key', () => {
    const srt = turkishSrtFixture();
    const factsOf = bytes =>
      buildFileFacts({
        bytes,
        fileNameHint: 'altyazi.srt',
        expectedLanguageCode: SubtitleLanguage.TUR,
      }).fileFacts;

    const utf8Key = factsOf(Buffer.from(srt, 'utf8')).contentKey;

    expect(utf8Key).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(factsOf(iconv.encode(srt, 'win1254')).contentKey).toBe(utf8Key);
  });

  it('takes the last cue end as the latest end, not the last listed', () => {
    const text = `${turkishSrtFixture()}\n13\n00:00:20,000 --> 00:00:21,000\nGeç gelen ama erken biten satır.\n`;

    const {fileFacts} = buildFileFacts({
      bytes: Buffer.from(text, 'utf8'),
      fileNameHint: 'altyazi.srt',
      expectedLanguageCode: SubtitleLanguage.TUR,
    });

    expect(fileFacts.lastCueEndMs).toBe(40000);
  });

  it('uses the fallback frame rate for a MicroDVD file without a header', () => {
    const text = readFileFormatFixture('microdvd-without-fps.sub');

    const {parsedSubtitle} = buildFileFacts({
      bytes: Buffer.from(text, 'utf8'),
      fileNameHint: 'altyazi.sub',
      expectedLanguageCode: SubtitleLanguage.TUR,
      fallbackFrameRate: 25,
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.MICRODVD);
    expect(parsedSubtitle.cues[0]).toMatchObject({startMs: 960, endMs: 1920});
  });

  it('decodes a short legacy file with the expected language as a hint', () => {
    const text = '1\n00:00:01,000 --> 00:00:03,000\nHayır.\n';

    const {parsedSubtitle, fileEncoding} = buildFileFacts({
      bytes: iconv.encode(text, 'win1254'),
      fileNameHint: 'altyazi.srt',
      expectedLanguageCode: SubtitleLanguage.TUR,
    });

    expect(fileEncoding).toBe('windows-1254');
    expect(parsedSubtitle.sourceText).toBe(text);
  });

  it('marks archive bytes UNREADABLE with no cues', () => {
    const archiveBytes = Buffer.concat([
      Buffer.from('Rar!\x1a\x07\x01\x00', 'latin1'),
      Buffer.from(
        Array.from({length: 600}, (_, byteIndex) => (byteIndex * 37) % 256),
      ),
    ]);

    const {fileFacts, parsedSubtitle} = buildFileFacts({
      bytes: archiveBytes,
      fileNameHint: 'altyazi.srt',
      expectedLanguageCode: SubtitleLanguage.TUR,
    });

    expect(parsedSubtitle.subtitleFileFormat).toBe(SubtitleFileFormat.OTHER);
    expect(fileFacts).toMatchObject({
      isFileValid: false,
      fileInvalidReasons: [SubtitleFileInvalidReason.UNREADABLE],
      cueCount: 0,
      normalizedCues: [],
    });
  });

  it('marks an HTML error page invalid with no cues', () => {
    const {fileFacts, fileEncoding} = buildFileFacts({
      bytes: Buffer.from(
        '<!DOCTYPE html>\n<html><body><h1>429 Too Many Requests</h1></body></html>\n',
        'utf8',
      ),
      fileNameHint: 'altyazi.srt',
      expectedLanguageCode: SubtitleLanguage.TUR,
    });

    expect(fileEncoding).toBe('utf-8');
    expect(fileFacts.isFileValid).toBe(false);
    expect(fileFacts.fileInvalidReasons).toContain(
      SubtitleFileInvalidReason.ERROR_PAGE,
    );
    expect(fileFacts.cueCount).toBe(0);
    expect(fileFacts.lastCueEndMs).toBe(0);
    expect(fileFacts.contentKey).toBe(computeContentKey([]));
    expect(fileFacts.contentKey).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(fileFacts.normalizedCues).toEqual([]);
  });
});
