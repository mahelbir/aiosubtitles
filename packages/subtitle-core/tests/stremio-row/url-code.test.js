import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {computeUrlCode} from '../../src/stremio-row/url-code.js';

describe('computeUrlCode', () => {
  it('hashes source, site file id and an empty archive entry path by default', () => {
    expect(
      computeUrlCode({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        siteFileId: '1234567',
      }),
    ).toBe('2721803262de250a606e1fc357fdfe6ed6c6ae32cdbf17658966df57c7806989');
  });

  it('includes the archive entry path in the hash', () => {
    expect(
      computeUrlCode({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        siteFileId: '1234567',
        archiveEntryPath: 'Season 1/Show.S01E02.srt',
      }),
    ).toBe('03689d6f42a74419f265de75d67491ad8777dc14954211c659bef0665fd4f7bc');
  });

  it('hashes a Turkish archive entry path as UTF-8', () => {
    expect(
      computeUrlCode({
        subtitleSource: SubtitleSource.ALTYAZIDB,
        siteFileId: '98765',
        archiveEntryPath: 'Sezon 1/Dizi.Bölüm.İki.ğüşçö.srt',
      }),
    ).toBe('8ff5cf09ec6274a0c7709e44f2a1fa3da642b370da65e28ef5561cae275ebe64');
  });

  it('gives the same code for a null, missing or empty archive entry path', () => {
    const urlCodes = [null, undefined, ''].map(archiveEntryPath =>
      computeUrlCode({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        siteFileId: '1234567',
        archiveEntryPath,
      }),
    );
    expect(urlCodes).toEqual(
      Array(3).fill(
        '2721803262de250a606e1fc357fdfe6ed6c6ae32cdbf17658966df57c7806989',
      ),
    );
  });
});
