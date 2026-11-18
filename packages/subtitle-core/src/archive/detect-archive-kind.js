import {ArchiveKind} from '../constants/subtitle-core-enums.js';

const RAR_SIGNATURE_PREFIX = Object.freeze([
  0x52, 0x61, 0x72, 0x21, 0x1a, 0x07,
]);

const ARCHIVE_SIGNATURES = Object.freeze([
  {archiveKind: ArchiveKind.ZIP, signatureBytes: [0x50, 0x4b, 0x03, 0x04]},
  {archiveKind: ArchiveKind.ZIP, signatureBytes: [0x50, 0x4b, 0x05, 0x06]},
  {
    archiveKind: ArchiveKind.RAR,
    signatureBytes: [...RAR_SIGNATURE_PREFIX, 0x00],
  },
  {
    archiveKind: ArchiveKind.RAR,
    signatureBytes: [...RAR_SIGNATURE_PREFIX, 0x01, 0x00],
  },
  {
    archiveKind: ArchiveKind.SEVEN_ZIP,
    signatureBytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
  },
]);

const startsWithSignature = (bytes, signatureBytes) =>
  signatureBytes.every(
    (signatureByte, byteIndex) => bytes[byteIndex] === signatureByte,
  );

export const detectArchiveKind = bytes =>
  ARCHIVE_SIGNATURES.find(({signatureBytes}) =>
    startsWithSignature(bytes, signatureBytes),
  )?.archiveKind ?? null;

export const hasUnknownRarSignature = bytes =>
  detectArchiveKind(bytes) == null &&
  startsWithSignature(bytes, RAR_SIGNATURE_PREFIX);
