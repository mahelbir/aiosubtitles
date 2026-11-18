import {ReleaseSourceFamily} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {lookupSourceFamily} from '../normalize-fields.js';
import {buildNameCase, mergeNameCases} from './name-cases.js';
import {
  createLiteralReader,
  isIdentifier,
  isPunctuation,
  tokenizeSource,
} from './source-literals.js';

const NO_YEAR = 0;
const NAME_WORD_SEPARATOR_PATTERN = /[^\p{L}\p{N}]+/u;

const readEpisodeCase = ([
  releaseName,
  releaseTitle,
  seasonNumber,
  episodeNumber,
]) => ({
  releaseName,
  rawFields: {
    releaseTitle,
    seasonNumbers: seasonNumber,
    episodeNumbers: episodeNumber,
  },
});

const readSeasonPackCase = ([releaseName, releaseTitle, seasonNumber]) => ({
  releaseName,
  rawFields: {releaseTitle, seasonNumbers: seasonNumber, episodeNumbers: []},
});

const readGroupCase = ([releaseName, releaseGroup]) => ({
  releaseName,
  rawFields: {releaseGroup},
});

const hasSourceToken = (releaseName, sourceFamily) => {
  const nameWords = releaseName.split(NAME_WORD_SEPARATOR_PATTERN);
  return [
    ...nameWords,
    ...nameWords
      .slice(1)
      .map((nameWord, wordIndex) => `${nameWords[wordIndex]}${nameWord}`),
  ].some(nameToken => lookupSourceFamily(nameToken) === sourceFamily);
};

const readSourceFamilyCase =
  sourceFamily =>
  ([releaseName]) => ({
    releaseName,
    rawFields: hasSourceToken(releaseName, sourceFamily)
      ? {releaseSourceFamily: sourceFamily}
      : {},
  });

const SONARR_METHOD_READERS = [
  [/^should_parse_(single|split)_episode$/, readEpisodeCase],
  [/^should_parse_japanese_variety_show_format$/, readEpisodeCase],
  [
    /^should_parse_multiple_episodes$/,
    ([releaseName, releaseTitle, seasonNumber, episodeNumbers]) => ({
      releaseName,
      rawFields: {
        releaseTitle,
        seasonNumbers: seasonNumber,
        episodeNumbers,
      },
    }),
  ],
  [
    /^should_parse_multi_episode_release$/,
    ([
      releaseName,
      releaseTitle,
      releaseGroup,
      seasonNumber,
      episodeNumbers,
    ]) => ({
      releaseName,
      rawFields: {
        releaseTitle,
        releaseGroup,
        seasonNumbers: seasonNumber,
        episodeNumbers,
      },
    }),
  ],
  [
    /^should_parse_multi_episode_from_path$/,
    ([releaseName, releaseTitle, seasonNumber, episodeNumbers]) => ({
      releaseName,
      rawFields: {
        releaseTitle,
        seasonNumbers: seasonNumber,
        episodeNumbers,
      },
    }),
  ],
  [
    /^should_parse_from_path$/,
    ([releaseName, seasonNumber, episodeNumber]) => ({
      releaseName,
      rawFields: {seasonNumbers: seasonNumber, episodeNumbers: episodeNumber},
    }),
  ],
  [
    /^should_parse_(full_season_release|season_subpack|season_extras|partial_season_release)$/,
    readSeasonPackCase,
  ],
  [
    /^should_parse_full_season_releases$/,
    ([releaseName, releaseTitle, releaseGroup, seasonNumber]) => ({
      releaseName,
      rawFields: {
        releaseTitle,
        releaseGroup,
        seasonNumbers: seasonNumber,
        episodeNumbers: [],
      },
    }),
  ],
  [
    /^should_parse_multi_season_release$/,
    ([releaseName, releaseTitle, seasonNumbers]) => ({
      releaseName,
      rawFields: {releaseTitle, seasonNumbers, episodeNumbers: []},
    }),
  ],
  [
    /^should_parse_mini_series_episode$/,
    ([releaseName, releaseTitle, episodeNumber]) => ({
      releaseName,
      rawFields: {releaseTitle, episodeNumbers: episodeNumber},
    }),
  ],
  [
    /^should_parse_series_name$/,
    ([releaseName, releaseTitle]) => ({releaseName, rawFields: {releaseTitle}}),
  ],
  [
    /^should_parse_series_title_info$/,
    ([releaseName, releaseTitle, releaseYear = NO_YEAR]) => ({
      releaseName,
      rawFields: {
        releaseTitle,
        releaseYear: releaseYear === NO_YEAR ? null : releaseYear,
      },
    }),
  ],
  [
    /^should_parse_(release_group|exception_release_group|anime_release_groups|sub_group_from_title_as_release_group)$/,
    readGroupCase,
  ],
  [
    /^should_properly_parse_hashed_releases$/,
    ([releaseName, releaseTitle, , releaseGroup]) => ({
      releaseName,
      rawFields: {releaseTitle, releaseGroup},
    }),
  ],
  [
    /^should_parse_(webdl|webrip)\d+p_quality$/,
    readSourceFamilyCase(ReleaseSourceFamily.WEB),
  ],
  [
    /^should_parse_bluray\d+p(_remux)?_quality$/,
    readSourceFamilyCase(ReleaseSourceFamily.BLURAY),
  ],
  [
    /^should_parse_(hdtv\d+p|sdtv)_quality$/,
    readSourceFamilyCase(ReleaseSourceFamily.HDTV),
  ],
  [/^should_parse_dvd_quality$/, readSourceFamilyCase(ReleaseSourceFamily.DVD)],
];

const findMethodReader = methodName =>
  SONARR_METHOD_READERS.find(([methodPattern]) =>
    methodPattern.test(methodName),
  )?.[1];

const readTestCaseArguments = literalReader => {
  const testCaseArguments = [];
  while (!isPunctuation(literalReader.peek(), ')')) {
    if (
      isIdentifier(literalReader.peek()) &&
      isPunctuation(literalReader.peek(1), '=')
    ) {
      literalReader.advance();
      literalReader.advance();
      literalReader.readValue();
    } else {
      testCaseArguments.push(literalReader.readValue());
    }
    if (isPunctuation(literalReader.peek(), ',')) {
      literalReader.advance();
    }
  }
  literalReader.advance();
  return testCaseArguments;
};

const isTestCaseStart = literalReader =>
  isPunctuation(literalReader.peek(), '[') &&
  isIdentifier(literalReader.peek(1), 'TestCase') &&
  isPunctuation(literalReader.peek(2), '(');

const isMethodStart = literalReader =>
  isIdentifier(literalReader.peek(), 'void') &&
  isIdentifier(literalReader.peek(1));

export const listSonarrCases = csText => {
  const literalReader = createLiteralReader(
    tokenizeSource(csText, {commentStyle: 'slash'}),
  );
  const nameCases = [];
  let pendingArgumentLists = [];
  while (!literalReader.isDone()) {
    if (isTestCaseStart(literalReader)) {
      literalReader.advance();
      literalReader.advance();
      literalReader.advance();
      pendingArgumentLists.push(readTestCaseArguments(literalReader));
    } else if (isMethodStart(literalReader)) {
      literalReader.advance();
      const methodReader = findMethodReader(literalReader.advance().tokenText);
      for (const testCaseArguments of methodReader
        ? pendingArgumentLists
        : []) {
        const {releaseName, rawFields} = methodReader(testCaseArguments);
        nameCases.push(buildNameCase(releaseName, rawFields));
      }
      pendingArgumentLists = [];
    } else {
      literalReader.advance();
    }
  }
  return nameCases;
};

export const parseSonarrCases = csText =>
  mergeNameCases(listSonarrCases(csText));
