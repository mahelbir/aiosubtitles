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
      "Key optional. Without a key, downloads share the server's limit of 1000 an hour across all users. With your key, you get 100,000 downloads a day of your own.",
    keyPageUrl: 'https://thesubtitledb.org/account/keys',
  },
  [SubtitleSource.SUBSOURCE]: {
    helpText: 'Requires an API key.',
    keyPageUrl: 'https://subsource.net/dashboard/api',
  },
  [SubtitleSource.GESTDOWN]: {
    helpText: "No key needed. Requests share the server's limits.",
  },
  [SubtitleSource.ANISUB]: {
    helpText:
      "Token optional. Without a token, downloads share the server's limit of 60 a minute across all users (server's shared IP). With your token, you get 1000 requests a day of your own.",
    keyPageUrl: 'https://anisub.co/ayarlar',
  },
});
