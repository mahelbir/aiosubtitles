import {ParserLibrary} from '../constants/parser-library.js';

export const isNameEligible = ({library, datasetName}) =>
  !ParserLibrary.raw(library).lineageDatasets.includes(datasetName);
