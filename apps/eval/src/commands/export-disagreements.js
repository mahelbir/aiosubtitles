import {readFile} from 'node:fs/promises';
import {writeJsonFile} from '../json-file.js';
import {readOwnNames} from '../parser-test/datasets/own-names.js';
import {
  exportPendingItems,
  parseGuessitOutput,
} from '../parser-test/run-parser-test.js';
import {assertPrivateOutputPath} from '../private-output.js';

export const runExportDisagreements = async ({
  atlasRoot,
  commandOptions,
  writeLine,
}) => {
  assertPrivateOutputPath(commandOptions['pending-output']);
  const [ownNames, guessitText] = await Promise.all([
    readOwnNames({atlasRoot}),
    readFile(commandOptions['guessit-output'], 'utf8'),
  ]);
  const {pendingItems, ownNameCount, ownItemCount} = await exportPendingItems({
    atlasRoot,
    guessitOutput: parseGuessitOutput(guessitText, ownNames),
  });
  await writeJsonFile(commandOptions['pending-output'], {pendingItems});
  writeLine(`own names: ${ownNameCount}`);
  writeLine(`own items: ${ownItemCount}`);
  writeLine(`pending items: ${pendingItems.length}`);
};
