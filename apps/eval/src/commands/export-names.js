import {NameDataset} from '../constants/parser-library.js';
import {writeJsonFile} from '../json-file.js';
import {resolveReferenceRoot} from '../parser-test/datasets/external-names.js';
import {exportParserNames} from '../parser-test/run-parser-test.js';
import {assertPrivateOutputPath} from '../private-output.js';

export const runExportNames = async ({
  atlasRoot,
  commandOptions,
  writeLine,
  referenceRoot = resolveReferenceRoot(),
}) => {
  assertPrivateOutputPath(commandOptions['names-output']);
  const {releaseNames, nameCountByDataset} = await exportParserNames({
    atlasRoot,
    referenceRoot,
  });
  await writeJsonFile(commandOptions['names-output'], {releaseNames});
  for (const datasetName of NameDataset.values) {
    writeLine(`${datasetName} names: ${nameCountByDataset[datasetName]}`);
  }
  writeLine(`names written: ${releaseNames.length}`);
};
