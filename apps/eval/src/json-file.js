import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

const JSON_INDENT = 2;

export const readJsonFile = async filePath =>
  JSON.parse(await readFile(filePath, 'utf8'));

export const writeJsonFile = async (filePath, jsonValue) => {
  await mkdir(dirname(filePath), {recursive: true});
  await writeFile(
    filePath,
    `${JSON.stringify(jsonValue, null, JSON_INDENT)}\n`,
    'utf8',
  );
};
