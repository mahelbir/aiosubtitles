import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {buildSubtitleId} from '../../src/stremio-row/build-subtitle-id.js';
import {URL_CODE} from '../helpers/stremio-row.js';

const MAX_ID_BYTES = 255;
const OPENSUBTITLES_NAME = SubtitleSource.label(SubtitleSource.OPENSUBTITLES);
const ALTYAZIDB_NAME = SubtitleSource.label(SubtitleSource.ALTYAZIDB);
const SHORT_CODE = URL_CODE.slice(0, 8);

describe('buildSubtitleId', () => {
  it('builds the id from source, release and code prefix', () => {
    expect(
      buildSubtitleId({
        subtitleSourceName: OPENSUBTITLES_NAME,
        releaseName: 'Show.S01E01.1080p.WEB-DL-NTb',
        urlCode: URL_CODE,
      }),
    ).toBe(`${OPENSUBTITLES_NAME} · Show.S01E01.1080p.WEB-DL-NTb · 3fa9c2d1`);
    expect(
      buildSubtitleId({
        subtitleSourceName: OPENSUBTITLES_NAME,
        releaseName: null,
        urlCode: URL_CODE,
      }),
    ).toBe(`${OPENSUBTITLES_NAME} · 3fa9c2d1`);
  });

  it('treats an empty, whitespace-only or control-only release name like null', () => {
    for (const releaseName of ['', '   ', '\t\r\n']) {
      expect(
        buildSubtitleId({
          subtitleSourceName: OPENSUBTITLES_NAME,
          releaseName,
          urlCode: URL_CODE,
        }),
      ).toBe(`${OPENSUBTITLES_NAME} · ${SHORT_CODE}`);
    }
  });

  it('uses the whole url code when asked for the full code', () => {
    expect(
      buildSubtitleId({
        subtitleSourceName: OPENSUBTITLES_NAME,
        releaseName: 'Show.S01E01.1080p.WEB-DL-NTb',
        urlCode: URL_CODE,
        isFullUrlCode: true,
      }),
    ).toBe(
      `${OPENSUBTITLES_NAME} · Show.S01E01.1080p.WEB-DL-NTb · ${URL_CODE}`,
    );
  });

  it('cuts the release name on a grapheme boundary within 255 bytes', () => {
    const prefix = `${ALTYAZIDB_NAME} · `;
    const suffix = ` · ${SHORT_CODE}`;
    for (const unit of ['İ', '字', '👨‍👩‍👧']) {
      const id = buildSubtitleId({
        subtitleSourceName: ALTYAZIDB_NAME,
        releaseName: unit.repeat(200),
        urlCode: URL_CODE,
      });
      expect(id).toEqual(expect.any(String));
      expect(Buffer.byteLength(id, 'utf8')).toBeLessThanOrEqual(MAX_ID_BYTES);
      expect(id.startsWith(prefix)).toBe(true);
      expect(id.endsWith(suffix)).toBe(true);
      const releasePart = id.slice(prefix.length, -suffix.length);
      expect(releasePart.length).toBeGreaterThan(0);
      expect(
        [...new Intl.Segmenter().segment(releasePart)].every(
          s => s.segment === unit,
        ),
      ).toBe(true);
      expect(
        Buffer.byteLength(`${prefix}${releasePart}${unit}${suffix}`, 'utf8'),
      ).toBeGreaterThan(MAX_ID_BYTES);
    }
  });

  it('cuts a mixed-script release name on a grapheme boundary within 255 bytes', () => {
    const prefix = `${ALTYAZIDB_NAME} · `;
    const suffix = ` · ${SHORT_CODE}`;
    const releaseName = 'İ字👨‍👩‍👧🇹🇷'.repeat(40);
    const id = buildSubtitleId({
      subtitleSourceName: ALTYAZIDB_NAME,
      releaseName,
      urlCode: URL_CODE,
    });
    expect(id).toEqual(expect.any(String));
    expect(Buffer.byteLength(id, 'utf8')).toBeLessThanOrEqual(MAX_ID_BYTES);
    expect(id.startsWith(prefix)).toBe(true);
    expect(id.endsWith(suffix)).toBe(true);
    const releasePart = id.slice(prefix.length, -suffix.length);
    const releaseGraphemes = [...new Intl.Segmenter().segment(releaseName)].map(
      s => s.segment,
    );
    const keptGraphemes = [...new Intl.Segmenter().segment(releasePart)].map(
      s => s.segment,
    );
    expect(keptGraphemes.length).toBeGreaterThan(0);
    expect(keptGraphemes).toEqual(
      releaseGraphemes.slice(0, keptGraphemes.length),
    );
    expect(
      Buffer.byteLength(
        `${prefix}${releasePart}${releaseGraphemes[keptGraphemes.length]}${suffix}`,
        'utf8',
      ),
    ).toBeGreaterThan(MAX_ID_BYTES);
  });

  it('drops the release part when nothing but whitespace fits within 255 bytes', () => {
    const heavyGrapheme = `a${'́'.repeat(150)}`;
    for (const releaseName of [heavyGrapheme, ` ${heavyGrapheme}`]) {
      expect(
        buildSubtitleId({
          subtitleSourceName: ALTYAZIDB_NAME,
          releaseName,
          urlCode: URL_CODE,
        }),
      ).toBe(`${ALTYAZIDB_NAME} · ${SHORT_CODE}`);
    }
  });

  it('keeps the source name and the full code whole when the release name is cut', () => {
    const id = buildSubtitleId({
      subtitleSourceName: ALTYAZIDB_NAME,
      releaseName: '字'.repeat(200),
      urlCode: URL_CODE,
      isFullUrlCode: true,
    });
    expect(id).toEqual(expect.any(String));
    expect(Buffer.byteLength(id, 'utf8')).toBeLessThanOrEqual(MAX_ID_BYTES);
    expect(id.startsWith(`${ALTYAZIDB_NAME} · 字`)).toBe(true);
    expect(id.endsWith(`字 · ${URL_CODE}`)).toBe(true);
  });

  it('turns carriage returns, line feeds, tabs and other control characters into spaces', () => {
    const id = buildSubtitleId({
      subtitleSourceName: OPENSUBTITLES_NAME,
      releaseName: 'Show\rS01E01\n1080p\tWEB\u0007NTb\u007fv2',
      urlCode: URL_CODE,
    });
    expect(id).toBe(
      `${OPENSUBTITLES_NAME} · Show S01E01 1080p WEB NTb v2 · ${SHORT_CODE}`,
    );
    expect(id).not.toMatch(/\p{Cc}/u);
  });

  it('turns line and paragraph separators into spaces', () => {
    const id = buildSubtitleId({
      subtitleSourceName: OPENSUBTITLES_NAME,
      releaseName: 'Show S01E01  1080p',
      urlCode: URL_CODE,
    });
    expect(id).toBe(
      `${OPENSUBTITLES_NAME} · Show S01E01  1080p · ${SHORT_CODE}`,
    );
    expect(id).not.toMatch(/[\p{Zl}\p{Zp}]/u);
  });
});
