import {describe, expect, it} from 'vitest';
import {ReleaseSourceFamily} from '../../src/constants/subtitle-core-enums.js';
import {
  inferReleaseSourceFamilyFromAudio,
  readReleaseSourceFamily,
} from '../../src/release-name/release-source-family.js';

describe('inferReleaseSourceFamilyFromAudio', () => {
  it.each(['TrueHD', 'DTS-HD'])('reads %s as a BluRay source', audioTag => {
    expect(inferReleaseSourceFamilyFromAudio([audioTag])).toBe(
      ReleaseSourceFamily.BLURAY,
    );
  });

  it('reads Atmos alone as no source', () => {
    expect(inferReleaseSourceFamilyFromAudio(['Atmos'])).toBeNull();
  });

  it.each([
    [['DDP5.1', 'Atmos'], ReleaseSourceFamily.WEB],
    [['TrueHD.7.1', 'Atmos'], ReleaseSourceFamily.BLURAY],
  ])('reads %j by the codec Atmos rides on', (audioTags, sourceFamily) => {
    expect(inferReleaseSourceFamilyFromAudio(audioTags)).toBe(sourceFamily);
  });

  it.each(['DDP', 'EAC3'])('reads %s as a WEB source', audioTag => {
    expect(inferReleaseSourceFamilyFromAudio([audioTag])).toBe(
      ReleaseSourceFamily.WEB,
    );
  });

  it('reads the tags without regard to case', () => {
    expect(inferReleaseSourceFamilyFromAudio(['truehd'])).toBe(
      ReleaseSourceFamily.BLURAY,
    );
    expect(inferReleaseSourceFamilyFromAudio(['eac3'])).toBe(
      ReleaseSourceFamily.WEB,
    );
  });

  it('finds the hint among other audio tags', () => {
    expect(inferReleaseSourceFamilyFromAudio(['AAC', 'TrueHD'])).toBe(
      ReleaseSourceFamily.BLURAY,
    );
  });

  it('gives no family for an audio tag that hints at no source', () => {
    expect(inferReleaseSourceFamilyFromAudio(['AAC'])).toBeNull();
    expect(inferReleaseSourceFamilyFromAudio(['DTS'])).toBeNull();
  });

  it.each([
    ['DDP5.1', ReleaseSourceFamily.WEB],
    ['DD+5.1', ReleaseSourceFamily.WEB],
    ['TrueHD.7.1', ReleaseSourceFamily.BLURAY],
    ['DTS-HD.MA.5.1', ReleaseSourceFamily.BLURAY],
  ])('reads the scene spelling %s by its start', (audioTag, sourceFamily) => {
    expect(inferReleaseSourceFamilyFromAudio([audioTag])).toBe(sourceFamily);
  });

  it('gives no family without audio tags', () => {
    expect(inferReleaseSourceFamilyFromAudio([])).toBeNull();
  });
});

describe('readReleaseSourceFamily', () => {
  it.each([
    ['WEB-DL', ReleaseSourceFamily.WEB],
    ['BluRay', ReleaseSourceFamily.BLURAY],
    ['HDTV', ReleaseSourceFamily.HDTV],
    ['DVD', ReleaseSourceFamily.DVD],
  ])('reads %s as %s', (sourceText, sourceFamily) => {
    expect(readReleaseSourceFamily(sourceText)).toBe(sourceFamily);
  });

  it.each(['CAM', 'TeleSync', 'HDRip', 'Paket'])(
    'gives no family for %s',
    sourceText => {
      expect(readReleaseSourceFamily(sourceText)).toBeNull();
    },
  );

  it('gives no family for an absent source', () => {
    expect(readReleaseSourceFamily(undefined)).toBeNull();
  });
});
