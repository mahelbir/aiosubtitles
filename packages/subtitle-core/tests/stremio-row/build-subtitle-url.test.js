import {describe, expect, it} from 'vitest';
import {buildSubtitleUrl} from '../../src/stremio-row/build-subtitle-url.js';
import {BASE_URL, URL_CODE, USER_CONFIG_ID} from '../helpers/stremio-row.js';

const MAX_URL_BYTES = 1024;
const MAX_VIDEO_ID_LENGTH = 128;

describe('buildSubtitleUrl', () => {
  it('keeps colons and encodes the rest of the video id', () => {
    expect(
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId: 'kitsu:123:5',
        urlCode: URL_CODE,
        fileExtension: 'srt',
      }),
    ).toBe(
      `https://h/${USER_CONFIG_ID}/subtitle-files/kitsu:123:5/${URL_CODE}.srt`,
    );
    expect(
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId: 'a b/c',
        urlCode: URL_CODE,
        fileExtension: 'ass',
      }),
    ).toBe(
      `https://h/${USER_CONFIG_ID}/subtitle-files/a%20b%2Fc/${URL_CODE}.ass`,
    );
    expect(
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId: 't'.repeat(129),
        urlCode: URL_CODE,
        fileExtension: 'srt',
      }),
    ).toBeNull();
  });

  it('keeps every RFC 3986 pchar of the video id unencoded', () => {
    const videoId = "tt1:1:1-._~!$&'()*+,;=@";
    expect(
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId,
        urlCode: URL_CODE,
        fileExtension: 'srt',
      }),
    ).toBe(
      `https://h/${USER_CONFIG_ID}/subtitle-files/${videoId}/${URL_CODE}.srt`,
    );
  });

  it('encodes a literal percent sign in the video id', () => {
    expect(
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId: 'tt1%20',
        urlCode: URL_CODE,
        fileExtension: 'srt',
      }),
    ).toBe(
      `https://h/${USER_CONFIG_ID}/subtitle-files/tt1%2520/${URL_CODE}.srt`,
    );
  });

  it('accepts a video id of exactly 128 characters', () => {
    const videoId = 't'.repeat(MAX_VIDEO_ID_LENGTH);
    expect(
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId,
        urlCode: URL_CODE,
        fileExtension: 'srt',
      }),
    ).toBe(
      `https://h/${USER_CONFIG_ID}/subtitle-files/${videoId}/${URL_CODE}.srt`,
    );
  });

  it('measures a non-ASCII video id after percent encoding', () => {
    const buildCjkUrl = characterCount =>
      buildSubtitleUrl({
        baseUrl: BASE_URL,
        userConfigId: USER_CONFIG_ID,
        videoId: '字'.repeat(characterCount),
        urlCode: URL_CODE,
        fileExtension: 'srt',
      });
    expect(buildCjkUrl(MAX_VIDEO_ID_LENGTH)).toBeNull();
    expect(buildCjkUrl(15)).toBeNull();
    expect(buildCjkUrl(14)).toBe(
      `https://h/${USER_CONFIG_ID}/subtitle-files/${'%E5%AD%97'.repeat(14)}/${URL_CODE}.srt`,
    );
  });

  it('stays under 1024 bytes for a 128-character ASCII video id that is fully encoded', () => {
    const url = buildSubtitleUrl({
      baseUrl: 'https://aiosubtitles.example.com',
      userConfigId: USER_CONFIG_ID,
      videoId: ' '.repeat(MAX_VIDEO_ID_LENGTH),
      urlCode: URL_CODE,
      fileExtension: 'srt',
    });
    expect(url).toEqual(expect.any(String));
    expect(url).toContain('%20'.repeat(MAX_VIDEO_ID_LENGTH));
    expect(Buffer.byteLength(url, 'utf8')).toBeLessThan(MAX_URL_BYTES);
  });
});
