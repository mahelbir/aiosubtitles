import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {computeContentKey} from '../../src/file-format/content-key.js';
import {parseSubtitleText} from '../../src/file-format/parse-subtitle.js';
import {
  readFileFormatFixture,
  toCrlf,
  turkishSrtFixture,
} from '../helpers/file-format-fixtures.js';

const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/;

const TWIN_KEY_LINES = [
  '1500\t3250\tMerhaba, nasılsın?',
  '4000\t6120\tİyiyim, teşekkürler. Sen nasılsın?',
  '7350\t9000\tBu gece şehirde, yağmur var.',
  '62040\t65990\tGörüşürüz, ağabey.',
].join('\n');

const sha256Hex = text => createHash('sha256').update(text).digest('hex');

const keyOfText = text => computeContentKey(parseSubtitleText({text}).cues);

describe('computeContentKey', () => {
  it('hashes start, end and normalized text lines joined by a line break', () => {
    const cues = [
      {startMs: 1000, endMs: 2000, text: '<i>Hi</i>\\N{\\an8}there  '},
      {startMs: 3000, endMs: 4500, text: 'İkinci\nsatır'},
    ];

    expect(computeContentKey(cues)).toBe(
      sha256Hex('1000\t2000\tHi there\n3000\t4500\tİkinci satır'),
    );
  });

  it('gives 64 lower-case hex characters', () => {
    expect(
      computeContentKey([{startMs: 0, endMs: 1, text: 'Merhaba'}]),
    ).toMatch(HEX_KEY_PATTERN);
  });

  it('drops cues whose normalized text is empty', () => {
    const cues = [
      {startMs: 1000, endMs: 2000, text: 'Birinci'},
      {startMs: 1500, endMs: 5000, text: '{\\p1}m 0 0 l 100 0 100 100{\\p0}'},
      {startMs: 2500, endMs: 2600, text: '{\\an8}  '},
      {startMs: 3000, endMs: 4000, text: 'İkinci'},
    ];

    expect(computeContentKey(cues)).toBe(
      sha256Hex('1000\t2000\tBirinci\n3000\t4000\tİkinci'),
    );
  });

  it('keys the same text with different markup alike', () => {
    const plainCues = [
      {startMs: 1000, endMs: 2000, text: 'Bu gece yağmur var.'},
    ];
    const styledCues = [
      {startMs: 1000, endMs: 2000, text: '{\\i1}Bu gece\\Nyağmur var.{\\i0}'},
    ];

    expect(computeContentKey(styledCues)).toBe(computeContentKey(plainCues));
    expect(computeContentKey(plainCues)).toBe(
      sha256Hex('1000\t2000\tBu gece yağmur var.'),
    );
  });

  it('keys the same text with different timings apart', () => {
    const cues = [{startMs: 1000, endMs: 2000, text: 'Merhaba'}];
    const shiftedCues = [{startMs: 1040, endMs: 2040, text: 'Merhaba'}];

    expect(computeContentKey(shiftedCues)).not.toBe(computeContentKey(cues));
  });

  it('keys an ASS file and its SRT twin with equal timings alike', () => {
    const assTwin = readFileFormatFixture('twin.ass');
    const srtTwin = readFileFormatFixture('twin.srt');

    expect(computeContentKey(parseSubtitleText({text: assTwin}).cues)).toBe(
      computeContentKey(parseSubtitleText({text: srtTwin}).cues),
    );
    expect(keyOfText(srtTwin)).toBe(sha256Hex(TWIN_KEY_LINES));
  });

  it('keys an NFD copy like its NFC original', () => {
    const srt = turkishSrtFixture();

    expect(keyOfText(srt.normalize('NFD'))).toBe(keyOfText(srt));
    expect(keyOfText(srt)).toMatch(HEX_KEY_PATTERN);
  });

  it('keys a file with no cue as the hash of an empty list', () => {
    expect(computeContentKey([])).toBe(sha256Hex(''));
    expect(
      computeContentKey([{startMs: 0, endMs: 1000, text: '{\\an8}'}]),
    ).toBe(sha256Hex(''));
  });

  it('keys cues listed out of order like the sorted file', () => {
    const sortedSrt =
      '1\n00:00:01,000 --> 00:00:02,000\nBirinci.\n\n2\n00:00:03,000 --> 00:00:04,000\nİkinci.\n';
    const unsortedSrt =
      '1\n00:00:03,000 --> 00:00:04,000\nİkinci.\n\n2\n00:00:01,000 --> 00:00:02,000\nBirinci.\n';

    expect(keyOfText(unsortedSrt)).toBe(keyOfText(sortedSrt));
    expect(keyOfText(sortedSrt)).toBe(
      sha256Hex('1000\t2000\tBirinci.\n3000\t4000\tİkinci.'),
    );
  });

  it('keys a CRLF copy like its LF original', () => {
    const srt = turkishSrtFixture();

    expect(keyOfText(toCrlf(srt))).toBe(keyOfText(srt));
    expect(keyOfText(srt)).toMatch(HEX_KEY_PATTERN);
  });
});
