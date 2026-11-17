import {Enum} from 'enum-plus';

export const CredentialRequirement = Enum({
  REQUIRED: {value: 'required', label: 'Required'},
  OPTIONAL: {value: 'optional', label: 'Optional'},
  NONE: {value: 'none', label: 'None'},
});

export const SubtitleSource = Enum({
  OPENSUBTITLES: {
    value: 'opensubtitles',
    label: 'OpenSubtitles',
    subtitleSourcePhase: 1,
    credentialRequirement: CredentialRequirement.OPTIONAL,
  },
  OPENSUBTITLES_V3: {
    value: 'opensubtitles-v3',
    label: 'OpenSubtitles v3',
    subtitleSourcePhase: 1,
    credentialRequirement: CredentialRequirement.NONE,
  },
  ALTYAZIDB: {
    value: 'altyazidb',
    label: 'AltyazıDB',
    subtitleSourcePhase: 1,
    credentialRequirement: CredentialRequirement.REQUIRED,
  },
  THESUBTITLEDB: {
    value: 'thesubtitledb',
    label: 'TheSubtitleDB',
    subtitleSourcePhase: 1,
    credentialRequirement: CredentialRequirement.OPTIONAL,
  },
  SUBSOURCE: {
    value: 'subsource',
    label: 'SubSource',
    subtitleSourcePhase: 1,
    credentialRequirement: CredentialRequirement.REQUIRED,
  },
  ANISUB: {
    value: 'anisub',
    label: 'AniSub',
    subtitleSourcePhase: 1,
    credentialRequirement: CredentialRequirement.OPTIONAL,
  },
  SUBDL: {
    value: 'subdl',
    label: 'SubDL',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.REQUIRED,
  },
  WYZIE: {
    value: 'wyzie',
    label: 'Wyzie',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.REQUIRED,
  },
  JIMAKU: {
    value: 'jimaku',
    label: 'Jimaku',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.NONE,
  },
  STREMIO_COMMUNITY_SUBTITLES: {
    value: 'stremio-community-subtitles',
    label: 'Community Subtitles',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.REQUIRED,
  },
  GESTDOWN: {
    value: 'gestdown',
    label: 'Gestdown',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.NONE,
  },
  ANIMETOSHO: {
    value: 'animetosho',
    label: 'AnimeTosho',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.NONE,
  },
  YIFY: {
    value: 'yify',
    label: 'YIFY',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.NONE,
  },
  TVSUBTITLES: {
    value: 'tvsubtitles',
    label: 'TVsubtitles',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.NONE,
  },
  BETASERIES: {
    value: 'betaseries',
    label: 'BetaSeries',
    subtitleSourcePhase: 2,
    credentialRequirement: CredentialRequirement.REQUIRED,
  },
});
