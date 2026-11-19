import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

const LIST_IMPROVEMENT_TEXT =
  'Checks a few subtitles ahead of time so the best ones rise to the top.';

const LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT = `${LIST_IMPROVEMENT_TEXT} This source's daily allowance is large, so it uses only a little.`;

export const SUBTITLE_SOURCE_DESCRIPTIONS = Object.freeze({
  [SubtitleSource.OPENSUBTITLES]: {
    helpText:
      "Uses the server's app key. Add your OpenSubtitles account to download on your own quota: free accounts get 20 downloads a day, VIP accounts 1000. Listing results costs nothing.",
    keyPageUrl: 'https://www.opensubtitles.com/',
    listImprovementText: LIST_IMPROVEMENT_TEXT,
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
    listImprovementText: LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.THESUBTITLEDB]: {
    helpText:
      'Requires an API key. With your key, you get 100,000 downloads a day of your own.',
    keyPageUrl: 'https://thesubtitledb.org/account/keys',
    listImprovementText: LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.SUBSOURCE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://subsource.net/dashboard/api',
    listImprovementText: LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.BETASERIES]: {
    helpText:
      "Optional. Add your own API key for searching, or the server's shared key is used when the server has one. Downloads need no key.",
    keyPageUrl: 'https://www.betaseries.com/compte/api',
  },
  [SubtitleSource.GESTDOWN]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.SUBDL]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://subdl.com/panel/api',
    listImprovementText: LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.ANISUB]: {
    helpText:
      "Optional. With your own token, you get 1000 requests a day of your own. Without one, the server's shared token or its public limits are used.",
    keyPageUrl: 'https://anisub.co/ayarlar',
  },
  [SubtitleSource.YIFY]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.WYZIE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://sub.wyzie.io/redeem',
    listImprovementText: LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.TVSUBTITLES]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES]: {
    helpText:
      'Requires your own token. Sign in, copy your install link, and paste it — the page accepts either the whole link or just the token and keeps only the token.',
    keyPageUrl: 'https://stremio-community-subtitles.top/configure',
    listImprovementText: LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.JIMAKU]: {
    helpText:
      "Optional. Add your own API key, or the server's shared key is used when the server has one. Requests share the server's limits.",
    keyPageUrl: 'https://jimaku.cc/account',
  },
  [SubtitleSource.ANIMETOSHO]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
});
