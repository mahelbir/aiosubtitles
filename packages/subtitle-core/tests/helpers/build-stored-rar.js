import {strToU8} from 'fflate';

const RAR5_SIGNATURE = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];
const HEADER_TYPE_MAIN = 1;
const HEADER_TYPE_FILE = 2;
const HEADER_TYPE_END = 5;
const HEADER_FLAG_DATA_AREA = 0x02;
const FILE_FLAG_DATA_CRC = 0x04;
const HOST_OS_UNIX = 1;
const UNIX_FILE_MODE = 0o100644;

const CRC_TABLE = Array.from({length: 256}, (_, tableIndex) => {
  let crcValue = tableIndex;
  for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
    crcValue = crcValue & 1 ? 0xedb88320 ^ (crcValue >>> 1) : crcValue >>> 1;
  }
  return crcValue >>> 0;
});

const crc32 = bytes => {
  let crcValue = 0xffffffff;
  for (const byte of bytes) {
    crcValue = CRC_TABLE[(crcValue ^ byte) & 0xff] ^ (crcValue >>> 8);
  }
  return (crcValue ^ 0xffffffff) >>> 0;
};

const vint = number => {
  const bytes = [];
  let remaining = number;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }
  bytes.push(remaining);
  return bytes;
};

const uint32 = number => [
  number & 0xff,
  (number >>> 8) & 0xff,
  (number >>> 16) & 0xff,
  (number >>> 24) & 0xff,
];

const block = headerFields => {
  const headerBody = [...vint(headerFields.length), ...headerFields];
  return [...uint32(crc32(headerBody)), ...headerBody];
};

const DICTIONARY_BITS_SHIFT = 10;

const fileBlock = (
  {entryPath, entryBytes, declaredByteLength = entryBytes.length},
  dictionaryBits,
) => {
  const nameBytes = strToU8(entryPath);
  return [
    ...block([
      ...vint(HEADER_TYPE_FILE),
      ...vint(HEADER_FLAG_DATA_AREA),
      ...vint(entryBytes.length),
      ...vint(FILE_FLAG_DATA_CRC),
      ...vint(declaredByteLength),
      ...vint(UNIX_FILE_MODE),
      ...uint32(crc32(entryBytes)),
      ...vint(dictionaryBits << DICTIONARY_BITS_SHIFT),
      ...vint(HOST_OS_UNIX),
      ...vint(nameBytes.length),
      ...nameBytes,
    ]),
    ...entryBytes,
  ];
};

export const buildStoredRar = (archiveEntries, {dictionaryBits = 0} = {}) =>
  Uint8Array.from([
    ...RAR5_SIGNATURE,
    ...block([...vint(HEADER_TYPE_MAIN), ...vint(0), ...vint(0)]),
    ...archiveEntries.flatMap(archiveEntry =>
      fileBlock(archiveEntry, dictionaryBits),
    ),
    ...block([...vint(HEADER_TYPE_END), ...vint(0), ...vint(0)]),
  ]);
