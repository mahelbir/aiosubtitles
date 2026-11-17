import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

const LIST_URL_SHAPES = [
  {
    pathPattern: /\/adb\/[^/]+\/([^/]+)\.srt$/,
    subtitleSource: SubtitleSource.ALTYAZIDB,
  },
  {
    pathPattern: /\/ss\/[^/]+\/([^/]+)\.srt$/,
    subtitleSource: SubtitleSource.SUBSOURCE,
  },
  {
    pathPattern: /\/sub\/[^/]+\/[^/]+\/([^/]+)\.srt$/,
    subtitleSource: SubtitleSource.OPENSUBTITLES,
  },
  {
    pathPattern: /\/download\/[^/]+\/src-api\/file\/([^/]+)$/,
    subtitleSource: SubtitleSource.OPENSUBTITLES_V3,
  },
  {
    pathPattern: /\/sd\/[^/]+\/([^/]+)\.srt$/,
    subtitleSource: SubtitleSource.SUBDL,
  },
  {
    pathPattern: /^\/get\/([^/]+)$/,
    subtitleSource: SubtitleSource.THESUBTITLEDB,
  },
  {
    pathPattern: /^\/stremio\/subtitle\/([^/]+)$/,
    subtitleSource: SubtitleSource.ANISUB,
  },
];

export const parseListUrlIdentity = url => {
  const pathname = URL.parse(url)?.pathname;
  if (!pathname) {
    return null;
  }
  for (const {pathPattern, subtitleSource} of LIST_URL_SHAPES) {
    const pathMatch = pathPattern.exec(pathname);
    if (pathMatch) {
      return {subtitleSource, siteFileId: pathMatch[1]};
    }
  }
  return null;
};
