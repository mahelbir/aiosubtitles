import {Enum} from 'enum-plus';

export const NameDataset = Enum({
  OWN: {value: 'own', label: 'own names'},
  GUESSIT: {value: 'guessit', label: 'guessit yml'},
  SONARR: {value: 'sonarr', label: 'Sonarr ParserTests'},
  PTT: {value: 'ptt', label: 'PTT and go-ptt tests'},
});

export const ParserLibrary = Enum({
  GUESSIT: {
    value: 'guessit',
    label: 'guessit',
    lineageDatasets: [NameDataset.GUESSIT],
    isJavaScript: false,
  },
  RELEASE_PARSER: {
    value: 'release-parser',
    label: '@aiostreams/release-parser',
    lineageDatasets: [NameDataset.PTT],
    isJavaScript: true,
  },
  VIDEO_FILENAME_PARSER: {
    value: 'video-filename-parser',
    label: '@ctrl/video-filename-parser',
    lineageDatasets: [NameDataset.SONARR],
    isJavaScript: true,
  },
  PARSIUM: {
    value: 'parsium',
    label: 'parsium-media',
    lineageDatasets: [],
    isJavaScript: true,
  },
});
