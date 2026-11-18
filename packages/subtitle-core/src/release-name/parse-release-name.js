import {parse} from 'parsium-media';
import {ReleaseSourceFamily} from '../constants/subtitle-core-enums.js';
import {isMeaninglessName, reduceReleaseName} from './meaningless-name.js';
import {tokenizeReleaseName} from './name-tokens.js';
import {readReleaseSourceFamily} from './release-source-family.js';
import {
  lookupSourceFamily,
  lookupStreamingService,
  pickReleaseEdition,
} from './release-vocabulary.js';

const TURKISH_NUMBER_FIRST_MARKER_PATTERN =
  /(?<![\p{L}\p{N}])(\d{1,3})[ ._-]?(sezon|b[öo]l[üu]m)(?![\p{L}\p{N}])/giu;
const COMPLETE_SERIES_PATTERN =
  /(?<![\p{L}\p{N}])complete[ ._-]+(?:series|season)(?![\p{L}\p{N}])/iu;
const SEASON_COMPLETE_PATTERN =
  /(?<![\p{L}\p{N}])(?:s\d{1,3}|season[ ._-]?\d{1,3})[ ._-]+complete(?![\p{L}\p{N}])/iu;
const EPISODE_RANGE_PATTERN =
  /(?<![\p{L}\p{N}])(?:s\d{1,3})?e(\d{1,4})[ ._]?-[ ._]?e(\d{1,4})(?![\p{L}\p{N}])/iu;
const AUDIO_TAG_PATTERN =
  /(?<![\p{L}\p{N}])(?:ddp|dd\+|e-?ac-?3|ac-?3|dd|truehd|dts-hd(?:[ .]ma)?|dts-?x|dts|atmos|aac|flac|opus|mp3|l?pcm)(?:[ .]?[1-9]\.[0-2])?(?![\p{L}\p{N}+])/giu;
const FRAME_RATE_PATTERN =
  /(?<![\p{L}\p{N}])(\d{2,3}(?:\.\d{1,3})?)[ ._]?fps(?![\p{L}\p{N}])/iu;
const CD_PART_PATTERN = /(?<![\p{L}\p{N}])cd[ ._-]?(\d{1,2})(?![\p{L}\p{N}])/iu;
const RESOLUTION_TOKEN_PATTERN = /^(?:\d{3,4}[pi]|4k)$/u;
const PACK_NAME_TOKEN = 'paket';

const makeEmptyReleaseInfo = () => ({
  releaseTitle: null,
  releaseYear: null,
  seasonNumbers: [],
  episodeNumbers: [],
  isSeasonPack: false,
  partNumber: null,
  releaseGroup: null,
  releaseSourceFamily: null,
  isRemux: false,
  streamingService: null,
  releaseEdition: null,
  resolutionHeight: null,
  audioTags: [],
  frameRate: null,
  nameTokens: [],
  isMeaningless: false,
});

const toParsiumInput = releaseName =>
  releaseName
    .replace(TURKISH_NUMBER_FIRST_MARKER_PATTERN, '$2.$1')
    .replace(COMPLETE_SERIES_PATTERN, '.');

const hasEpisodeRange = releaseName => {
  const rangeMatch = EPISODE_RANGE_PATTERN.exec(releaseName);
  return rangeMatch != null && Number(rangeMatch[2]) > Number(rangeMatch[1]);
};

const isTechnicalToken = (nameToken, tokenIndex) =>
  tokenIndex > 0 &&
  (RESOLUTION_TOKEN_PATTERN.test(nameToken) ||
    lookupSourceFamily(nameToken) != null);

const isBeforeWebSource = (nameToken, tokenIndex, nameTokens) =>
  tokenIndex > 0 &&
  tokenIndex + 1 < nameTokens.length &&
  lookupSourceFamily(nameTokens[tokenIndex + 1]) === ReleaseSourceFamily.WEB;

const listServiceTokens = tagTokens => {
  const technicalStart = tagTokens.findIndex(isTechnicalToken);
  const tokensAfterTechnical =
    technicalStart < 0 ? [] : tagTokens.slice(technicalStart + 1);
  return [...tagTokens.filter(isBeforeWebSource), ...tokensAfterTechnical];
};

const readTagRegionService = (releaseName, releaseGroup) => {
  const tagTokens = tokenizeReleaseName(
    releaseName.replace(AUDIO_TAG_PATTERN, ' '),
  );
  const groupTokens =
    releaseGroup == null ? [] : tokenizeReleaseName(releaseGroup);
  return (
    listServiceTokens(tagTokens)
      .filter(tagToken => !groupTokens.includes(tagToken))
      .map(lookupStreamingService)
      .find(Boolean) ?? null
  );
};

const readStreamingService = (releaseName, parsedName) =>
  parsedName.streamingService == null
    ? readTagRegionService(releaseName, parsedName.releaseGroup)
    : lookupStreamingService(parsedName.streamingService);

const readMatchedNumber = (releaseName, numberPattern) => {
  const numberMatch = numberPattern.exec(releaseName);
  return numberMatch == null ? null : Number(numberMatch[1]);
};

const readResolutionHeight = resolution =>
  resolution == null ? null : Number.parseInt(resolution, 10);

export const parseReleaseName = (fullName, {isSitePack = false} = {}) => {
  if (isMeaninglessName(fullName)) {
    return {...makeEmptyReleaseInfo(), isMeaningless: true};
  }
  const releaseName = reduceReleaseName(fullName);
  const parsedName = parse(toParsiumInput(releaseName));
  const nameTokens = tokenizeReleaseName(releaseName);
  const seasonNumbers = parsedName.seasons ?? [];
  const episodeNumbers = parsedName.episodes ?? [];
  const isSeasonPack =
    isSitePack ||
    parsedName.isSeasonPack ||
    parsedName.isCompleteSeries ||
    (seasonNumbers.length > 0 && episodeNumbers.length === 0) ||
    (hasEpisodeRange(releaseName) && episodeNumbers.length > 1) ||
    COMPLETE_SERIES_PATTERN.test(releaseName) ||
    SEASON_COMPLETE_PATTERN.test(releaseName) ||
    nameTokens.includes(PACK_NAME_TOKEN);
  return {
    ...makeEmptyReleaseInfo(),
    releaseTitle: parsedName.title || null,
    releaseYear: parsedName.year ?? null,
    seasonNumbers,
    episodeNumbers,
    isSeasonPack,
    partNumber: readMatchedNumber(releaseName, CD_PART_PATTERN),
    releaseGroup: parsedName.releaseGroup ?? null,
    releaseSourceFamily: readReleaseSourceFamily(parsedName.source),
    isRemux: parsedName.isRemux === true,
    streamingService: readStreamingService(releaseName, parsedName),
    releaseEdition: pickReleaseEdition(parsedName.editions),
    resolutionHeight: readResolutionHeight(parsedName.resolution),
    audioTags: releaseName.match(AUDIO_TAG_PATTERN) ?? [],
    frameRate: readMatchedNumber(releaseName, FRAME_RATE_PATTERN),
    nameTokens,
  };
};
