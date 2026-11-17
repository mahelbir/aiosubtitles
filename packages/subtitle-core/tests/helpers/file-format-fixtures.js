import {readFileSync} from 'node:fs';

const FIXTURE_DIR = new URL('../fixtures/file-format/', import.meta.url);

export const readFileFormatFixture = fixtureName =>
  readFileSync(new URL(fixtureName, FIXTURE_DIR), 'utf8');

export const turkishSrtFixture = () => readFileFormatFixture('turkish.srt');

export const toCrlf = text => text.replaceAll('\n', '\r\n');

export const utf8WithBom = text =>
  Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);

export const utf16leWithBom = text =>
  Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);

export const utf16beWithBom = text =>
  Buffer.concat([
    Buffer.from([0xfe, 0xff]),
    Buffer.from(text, 'utf16le').swap16(),
  ]);

const formatSrtTime = timeMs => {
  const hours = Math.floor(timeMs / 3600000);
  const minutes = Math.floor(timeMs / 60000) % 60;
  const seconds = Math.floor(timeMs / 1000) % 60;
  const milliseconds = timeMs % 1000;
  const pad = (number, width) => String(number).padStart(width, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
};

export const buildSrtText = cueTexts =>
  cueTexts
    .map(
      (cueText, cueIndex) =>
        `${cueIndex + 1}\n${formatSrtTime(cueIndex * 3000 + 1000)} --> ${formatSrtTime(cueIndex * 3000 + 3000)}\n${cueText}\n`,
    )
    .join('\n');
