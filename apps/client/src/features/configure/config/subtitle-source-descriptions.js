import {CredentialKind} from '@repo/shared/constants/credential.js';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';

const LIST_IMPROVEMENT_TEXT =
  'Checks a few subtitles ahead of time so the best ones rise to the top.';

const LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT = `${LIST_IMPROVEMENT_TEXT} This source's daily allowance is large, so it uses only a little.`;

const LIMIT_CHECKED_DATE = '2026-11-19';

export const SUBTITLE_SOURCE_DESCRIPTIONS = Object.freeze({
  [SubtitleSource.OPENSUBTITLES]: {
    helpText:
      "Uses the server's app key. Add your OpenSubtitles account to download on your own quota: free accounts get 20 downloads a day, VIP accounts 1000. Listing results costs nothing.",
    keyPageUrl: 'https://www.opensubtitles.com/',
    limitPageUrl:
      'https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started',
    limitCheckedDate: LIMIT_CHECKED_DATE,
    listImprovementText: LIST_IMPROVEMENT_TEXT,
    credentialListLabels: {
      [CredentialKind.ACCOUNT]: 'Accounts',
      [CredentialKind.API_KEY]: 'Use your own API key (optional)',
    },
  },
  [SubtitleSource.OPENSUBTITLES_V3]: {
    helpText: 'No key needed.',
  },
  [SubtitleSource.ALTYAZIDB]: {
    helpText:
      'Requires an API key. A member key gets 60 requests a minute, 300 an hour and 500 a day.',
    keyPageUrl: 'https://altyazidb.com/index.php?do=register',
    limitPageUrl: 'https://altyazidb.com/api-docs.php#me',
    limitCheckedDate: LIMIT_CHECKED_DATE,
    listImprovementText: LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.THESUBTITLEDB]: {
    helpText:
      'Requires an API key. With your key, you get 100,000 downloads a day of your own.',
    keyPageUrl: 'https://thesubtitledb.org/account/keys',
    limitPageUrl: 'https://thesubtitledb.org/developer/api#limits',
    limitCheckedDate: LIMIT_CHECKED_DATE,
    listImprovementText: LARGE_ALLOWANCE_LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.SUBSOURCE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://subsource.net/dashboard/api',
    limitPageUrl: 'https://subsource.net/api-docs',
    limitCheckedDate: LIMIT_CHECKED_DATE,
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
    limitPageUrl: 'https://subdl.com/developers',
    limitCheckedDate: LIMIT_CHECKED_DATE,
    listImprovementText: LIST_IMPROVEMENT_TEXT,
  },
  [SubtitleSource.ANISUB]: {
    helpText:
      "Optional. With your own token, you get 1000 requests a day of your own. Without one, the server's shared token or its public limits are used.",
    keyPageUrl: 'https://anisub.co/ayarlar',
    limitPageUrl: 'https://anisub.co/api-dokumantasyon',
    limitCheckedDate: LIMIT_CHECKED_DATE,
  },
  [SubtitleSource.YIFY]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.WYZIE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://sub.wyzie.io/redeem',
    limitPageUrl: 'https://docs.wyzie.io/subs/usage/api-keys#tiers',
    limitCheckedDate: LIMIT_CHECKED_DATE,
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
    limitPageUrl: 'https://jimaku.cc/api/docs',
    limitCheckedDate: LIMIT_CHECKED_DATE,
  },
  [SubtitleSource.ANIMETOSHO]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
});
