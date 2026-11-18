import {uniq} from 'es-toolkit';
import {
  ReleaseEdition,
  ReleaseSourceFamily,
} from '../constants/subtitle-core-enums.js';

export const OTHER_SOURCE_FAMILY = 'other';

const SOURCE_FAMILY_TOKENS = {
  [ReleaseSourceFamily.WEB]: [
    'web',
    'webdl',
    'webrip',
    'webdlrip',
    'webcap',
    'webmux',
    'webhd',
    'vod',
    'vodr',
    'vodrip',
    'videoondemand',
  ],
  [ReleaseSourceFamily.BLURAY]: [
    'bluray',
    'blurayremux',
    'uhdbluray',
    'ultrahdbluray',
    'bdrip',
    'brrip',
    'bdremux',
    'remux',
    'brdisk',
    'bd',
    'bdmux',
    'uhdrip',
  ],
  [ReleaseSourceFamily.HDTV]: [
    'hdtv',
    'tv',
    'hdtvrip',
    'pdtv',
    'sdtv',
    'tvrip',
    'satrip',
    'satellite',
    'dsr',
    'dsrip',
    'digitaltv',
    'analoghdtv',
    'analogtv',
    'ultrahdtv',
    'iptv',
    'ppv',
    'ppvrip',
    'payperview',
  ],
  [ReleaseSourceFamily.DVD]: [
    'dvd',
    'dvdrip',
    'dvdr',
    'dvd5',
    'dvd9',
    'dvdmux',
    'dvdscr',
    'r5',
    'region5',
  ],
  [OTHER_SOURCE_FAMILY]: [
    'cam',
    'camrip',
    'camera',
    'hdcam',
    'hdcamera',
    'telesync',
    'ts',
    'hdts',
    'hdtelesync',
    'telecine',
    'tc',
    'hdtelecine',
    'workprint',
    'scr',
    'screener',
    'bdscr',
    'hdrip',
    'hddvd',
    'vhs',
    'vhsrip',
    'laserdisc',
    'digitalmaster',
    'regional',
  ],
};

const STREAMING_SERVICE_ALIASES = {
  '9NOW': ['9now'],
  AE: ['a&e'],
  ABC: ['ambc'],
  AUBC: ['abcaustralia'],
  AJAZ: ['aljazeeraenglish'],
  AMC: ['amc+'],
  ADN: ['animedigitalnetwork', 'animationdigitalnetwork'],
  AMZN: ['amazon', 'amazonprime', 'amazonprimevideo', 'primevideo', 'amzncbr'],
  AS: ['adultswim'],
  ATK: ['americastestkitchen'],
  ANPL: ['animalplanet'],
  ANLB: ['animelab'],
  AOL: [],
  ATVP: ['appletv', 'appletv+', 'appletvplus', 'atv+', 'aptv'],
  ARD: [],
  iP: ['bbciplayer'],
  BNGE: ['binge'],
  BKPL: ['blackpills'],
  BLU: ['blutv'],
  BOOM: ['boomerang'],
  DSNP: ['disney+', 'disneyplus', 'dnsp'],
  BRAV: ['bravotv'],
  CNLP: ['canal+', 'canalp'],
  CN: ['cartoonnetwork'],
  CBC: [],
  CBS: [],
  CNBC: [],
  CC: ['comedycentral'],
  ALL4: ['channel4', '4od'],
  MY5: ['channel5'],
  CHGD: ['chrgd'],
  CMAX: ['cinemax'],
  CMT: ['countrymusictelevision'],
  CCGC: ['comediansincarsgettingcoffee'],
  CRAV: ['crave'],
  CR: ['crunchyroll', 'crunchy'],
  CRKL: ['crackle'],
  CSPN: ['cspan'],
  CTV: [],
  CUR: ['curiositystream'],
  CWS: ['cwseed'],
  DSKI: ['daisuki'],
  DCU: ['dcuniverse'],
  DHF: ['deadhousefilms'],
  DF: ['dramafever'],
  DDY: ['digiturkdilediginyerde'],
  DISC: ['discovery'],
  DSCP: ['discoveryplus', 'discovery+'],
  DSNY: ['disney'],
  DIY: ['diynetwork'],
  DOCC: ['docclub'],
  DPLY: ['dplay'],
  ETV: ['e!'],
  EPIX: [],
  ETTV: ['eltrece'],
  ESPN: ['espn+'],
  ESQ: ['esquire'],
  FBWATCH: ['facebookwatch'],
  FAM: ['family'],
  FJR: ['familyjr'],
  FANDOR: [],
  FOOD: ['foodnetwork'],
  FOX: [],
  FOXP: ['foxpremium'],
  FXTL: ['foxtel'],
  FREE: ['freeform'],
  FYI: ['fyinetwork'],
  GAGA: ['gagaoolala'],
  GLBL: ['global'],
  GLOB: ['globosatplay'],
  HLMK: ['hallmark'],
  HBO: ['hbogo'],
  HMAX: ['hbomax'],
  HGTV: [],
  HIST: ['history', 'htsr'],
  HULU: [],
  ID: ['investigationdiscovery'],
  IFC: [],
  HOICHOI: [],
  IFX: ['iflix'],
  IQIYI: [],
  iT: ['itunes'],
  ITV: ['itvx'],
  KNOW: ['knowledgenetwork'],
  LIFE: ['lifetime'],
  MAX: [],
  MTOD: ['motortrendondemand'],
  MBC: ['mbcvod'],
  MNBC: ['msnbc'],
  MTV: [],
  MUBI: [],
  INA: ['nationalaudiovisualinstitute'],
  NFB: ['nationalfilmboard'],
  NATG: ['nationalgeographic', 'natgeo', 'ngc'],
  NBA: ['nbatv'],
  NBC: [],
  NF: ['netflix'],
  NFL: [],
  NFLN: ['nflnow'],
  GC: ['nhlgamecenter'],
  NICK: ['nickelodeon', 'nickapp'],
  NRK: ['norskrikskringkasting'],
  NOW: ['nowtv'],
  ODK: ['ondemandkorea'],
  OPTO: [],
  OWN: ['oprahwinfreynetwork'],
  PMTP: ['paramount+', 'paramountplus', 'pmnp', 'pmt+'],
  PBS: [],
  PBSK: ['pbskids'],
  PCOK: ['peacock'],
  PSN: ['playstationnetwork'],
  PLUZ: ['pluzz'],
  POGO: ['pokergo'],
  RKTN: ['rakutentv', 'rktv'],
  ROKU: ['therokuchannel', 'rokuchannel'],
  RTE: ['rteone'],
  RUUTU: [],
  SBS: [],
  SCI: ['sciencechannel'],
  SESO: ['seeso'],
  SHMI: ['shomi'],
  SHO: ['showtime'],
  SONY: [],
  SPIK: ['spike'],
  SPKE: ['spiketv'],
  SNET: ['sportsnet'],
  SPRT: ['sprout'],
  STAN: [],
  STZ: ['starz'],
  SVT: ['sverigestelevision'],
  SWER: ['swearnet'],
  SYFY: [],
  TBS: [],
  TFOU: [],
  CW: ['thecw'],
  TLC: [],
  TUBI: ['tubitv'],
  TV3: ['tv3ireland'],
  TV4: ['tv4sweeden'],
  TVING: [],
  TVL: ['tvland'],
  TVNZ: [],
  UFC: [],
  FP: ['ufcfightpass'],
  UKTV: [],
  UNIV: ['univision'],
  USAN: ['usanetwork'],
  VLCT: ['velocity'],
  VH1: [],
  VICE: ['viceland'],
  VIKI: [],
  VMEO: ['vimeo'],
  VRV: [],
  WNET: ['wnetwork'],
  WME: ['watchme'],
  WWEN: ['wwenetwork'],
  XBOX: ['xboxvideo'],
  YHOO: ['yahoo'],
  RED: ['youtubered', 'youtubepremium'],
  ZDF: [],
  FUNI: ['funimation'],
  HIDIVE: [],
  WAKA: ['wakanim'],
  GPLAY: ['googleplay', 'googletv', 'gp'],
  KAYO: ['kayosports'],
  SALTO: [],
  OCS: [],
  RTLP: ['rtl+'],
  RTL: [],
  WOWTV: [],
  SKYG: ['skygo'],
  SKY: [],
  SKST: ['skyshowtime'],
  PLUTO: ['plutotv'],
  VUDU: [],
  MA: ['moviesanywhere'],
  VIU: ['mngo'],
  HOTSTAR: ['disney+hotstar', 'dsnph'],
  JIOCINEMA: [],
  ZEE5: [],
  SONYLIV: [],
  MGMP: ['mgm+', 'mgmplus'],
  FX: [],
  TNT: [],
  DAZN: [],
  F1TV: [],
  BCORE: ['braviacore', 'sonypicturescore'],
  PLAY: [],
  YT: ['youtube'],
  CRITERION: ['criterionchannel'],
  SHUDDER: [],
  ARROW: ['arrowvideo'],
  SLING: ['slingtv'],
  FREETV: [],
  STRP: ['strip'],
  KKTV: [],
  BILIBILI: [],
  WETV: [],
  TVNOW: [],
  JOYN: [],
  VRT: [],
  EXXEN: [],
  GAIN: [],
  TOD: [],
  TABII: [],
};

const EDITION_ALIASES = {
  [ReleaseEdition.EXTENDED]: [
    'extended',
    'extendededition',
    'extendedcut',
    'extendedversion',
  ],
  [ReleaseEdition.DIRECTORS_CUT]: [
    'directorscut',
    'directorcut',
    'directors',
    'directorsdefinitivecut',
    'directorscutedition',
  ],
  [ReleaseEdition.THEATRICAL]: [
    'theatrical',
    'theatricalcut',
    'theatricaledition',
    'theatricalversion',
  ],
  [ReleaseEdition.UNRATED]: ['unrated', 'unratedcut', 'unratededition'],
  [ReleaseEdition.UNCUT]: ['uncut', 'uncutedition', 'uncutversion'],
  [ReleaseEdition.IMAX]: ['imax', 'imaxedition', 'imaxenhanced'],
  [ReleaseEdition.REMASTERED]: [
    'remastered',
    'remaster',
    '4kremastered',
    '4kremaster',
  ],
  [ReleaseEdition.SPECIAL]: ['special', 'specialedition'],
};

const LOOKUP_KEY_SEPARATOR_PATTERN = /[\s._'’-]+/gu;
const EDITION_KEY_SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/gu;

export const buildAliasLookup = (aliasesByValue, toKey) => {
  const canonicalByKey = new Map();
  for (const [canonicalValue, aliases] of Object.entries(aliasesByValue)) {
    for (const aliasKey of new Set([canonicalValue, ...aliases].map(toKey))) {
      if (canonicalByKey.has(aliasKey)) {
        throw new RangeError('Two canonical values claim one alias key.');
      }
      canonicalByKey.set(aliasKey, canonicalValue);
    }
  }
  return canonicalByKey;
};

export const toServiceKey = rawText =>
  rawText
    .normalize('NFC')
    .toLowerCase()
    .replace(LOOKUP_KEY_SEPARATOR_PATTERN, '');

const toWordKey = rawText =>
  rawText
    .normalize('NFC')
    .toLowerCase()
    .replace(EDITION_KEY_SEPARATOR_PATTERN, '');

const SOURCE_FAMILY_BY_KEY = buildAliasLookup(SOURCE_FAMILY_TOKENS, toWordKey);
const SERVICE_CODE_BY_KEY = buildAliasLookup(
  STREAMING_SERVICE_ALIASES,
  toServiceKey,
);
const EDITION_BY_KEY = buildAliasLookup(EDITION_ALIASES, toWordKey);

export const lookupSourceFamily = rawText =>
  SOURCE_FAMILY_BY_KEY.get(toWordKey(rawText)) ?? null;

const toRawValues = rawValue => {
  if (rawValue === undefined || rawValue === null) {
    return [];
  }
  return Array.isArray(rawValue) ? rawValue : [rawValue];
};

export const toTexts = rawValue =>
  toRawValues(rawValue)
    .filter(entry => typeof entry === 'string' || typeof entry === 'number')
    .map(entry => String(entry).normalize('NFC').trim())
    .filter(entry => entry !== '');

export const pickByOrder = (values, order) =>
  order.find(orderedValue => values.includes(orderedValue)) ?? null;

export const lookupStreamingService = rawText =>
  SERVICE_CODE_BY_KEY.get(toServiceKey(rawText)) ?? null;

export const lookupEdition = rawText =>
  EDITION_BY_KEY.get(toWordKey(rawText)) ?? null;

export const listCanonicalEditions = rawValue =>
  uniq(toTexts(rawValue).map(lookupEdition).filter(Boolean));

export const pickReleaseEdition = rawValue =>
  pickByOrder(listCanonicalEditions(rawValue), ReleaseEdition.values);
