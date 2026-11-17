import {describe, expect, it} from 'vitest';
import {parseListUrlIdentity} from '../src/corpus/list-url.js';

const POOL_PREFIX =
  'https://pool.example/languages=tr&ui=tr&auth=FAKE-AUTH-0001';

describe('parseListUrlIdentity', () => {
  it.each([
    [
      'an AltyazıDB proxy url',
      `${POOL_PREFIX}/adb/tr/11-22-33.srt`,
      {subtitleSource: 'altyazidb', siteFileId: '11-22-33'},
    ],
    [
      'a SubSource proxy url',
      `${POOL_PREFIX}/ss/tr/44-55-66.srt`,
      {subtitleSource: 'subsource', siteFileId: '44-55-66'},
    ],
    [
      'an OpenSubtitles proxy url',
      `${POOL_PREFIX}/sub/tr/tt9000001/7001.srt`,
      {subtitleSource: 'opensubtitles', siteFileId: '7001'},
    ],
    [
      'an official OpenSubtitles addon url',
      'https://official.example/en/download/subencoding-stremio-utf8/src-api/file/8001',
      {subtitleSource: 'opensubtitles-v3', siteFileId: '8001'},
    ],
    [
      'a SubDL proxy url',
      `${POOL_PREFIX}/sd/tr/9001.srt`,
      {subtitleSource: 'subdl', siteFileId: '9001'},
    ],
    [
      'a TheSubtitleDB url',
      'https://tsdb.example/get/6001',
      {subtitleSource: 'thesubtitledb', siteFileId: '6001'},
    ],
    [
      'an AniSub url',
      'https://anisub.example/stremio/subtitle/5001',
      {subtitleSource: 'anisub', siteFileId: '5001'},
    ],
  ])('reads the site id from %s', (_label, url, identity) => {
    expect(parseListUrlIdentity(url)).toEqual(identity);
  });

  it('returns only the identity, never the url or token', () => {
    const identity = parseListUrlIdentity(`${POOL_PREFIX}/adb/tr/11-22-33.srt`);
    expect(Object.keys(identity).sort()).toEqual([
      'siteFileId',
      'subtitleSource',
    ]);
    expect(JSON.stringify(identity)).not.toContain('FAKE-AUTH');
  });

  it.each([
    ['an unknown host and path', 'https://unknown.example/files/1234.srt'],
    ['a text that is not a url', 'not a url'],
    ['an empty text', ''],
  ])('returns null for %s', (_label, url) => {
    expect(parseListUrlIdentity(url)).toBeNull();
  });
});
