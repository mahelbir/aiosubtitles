import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

export const SUBTITLE_SOURCE_DESCRIPTIONS = Object.freeze({
  [SubtitleSource.OPENSUBTITLES]: {
    helpText:
      "Uses the server's app key. Add your OpenSubtitles account to download on your own quota: free accounts get 20 downloads a day, VIP accounts 1000. Listing results costs nothing.",
    keyPageUrl: 'https://www.opensubtitles.com/',
    credentialListLabels: {
      [CredentialKind.API_KEY]: 'Use your own API key (optional)',
    },
  },
  [SubtitleSource.OPENSUBTITLES_V3]: {
    helpText: 'No key needed.',
  },
  [SubtitleSource.ALTYAZIDB]: {
    helpText:
      'Requires an API key. Too many requests return a temporary block.',
    keyPageUrl: 'https://altyazidb.com/index.php?do=register',
  },
  [SubtitleSource.THESUBTITLEDB]: {
    helpText:
      'Requires an API key. With your key, you get 100,000 downloads a day of your own.',
    keyPageUrl: 'https://thesubtitledb.org/account/keys',
  },
  [SubtitleSource.SUBSOURCE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://subsource.net/dashboard/api',
  },
  [SubtitleSource.BETASERIES]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://www.betaseries.com/compte/api',
  },
  [SubtitleSource.GESTDOWN]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.SUBDL]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://subdl.com/panel/api',
  },
  [SubtitleSource.ANISUB]: {
    helpText:
      'Requires a token. With your token, you get 1000 requests a day of your own.',
    keyPageUrl: 'https://anisub.co/ayarlar',
  },
  [SubtitleSource.YIFY]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.WYZIE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://sub.wyzie.io/redeem',
  },
  [SubtitleSource.TVSUBTITLES]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: {
    helpText:
      'Requires your own token. Sign in, copy your install link, and paste it — the page accepts either the whole link or just the token and keeps only the token.',
    keyPageUrl: 'https://stremio-community-subtitles.top/configure',
  },
});
