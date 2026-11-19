import {readFile} from 'node:fs/promises';
import {isString, pick} from 'es-toolkit';
import {Codename} from './constants/codename.js';

const CODENAME_VALUES = Codename.toList().map(({value}) => value);

export const IDENTITY_CODENAMES = Object.freeze(
  Object.fromEntries(CODENAME_VALUES.map(codename => [codename, codename])),
);

export class CodenamesFileError extends Error {
  constructor(
    message = 'The codenames file must map every codename to a name.',
    options,
  ) {
    super(message, options);
    this.name = 'CodenamesFileError';
  }
}

const readCodenamesText = async codenamesPath => {
  try {
    return await readFile(codenamesPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const parseCodenames = codenamesText => {
  try {
    return JSON.parse(codenamesText);
  } catch (error) {
    throw new CodenamesFileError(undefined, {cause: error});
  }
};

export const loadCodenames = async codenamesPath => {
  const codenamesText = await readCodenamesText(codenamesPath);
  if (codenamesText === null) {
    return IDENTITY_CODENAMES;
  }
  const codenames = parseCodenames(codenamesText);
  const hasEveryName = CODENAME_VALUES.every(
    codename => isString(codenames?.[codename]) && codenames[codename] !== '',
  );
  if (!hasEveryName) {
    throw new CodenamesFileError();
  }
  return Object.freeze(pick(codenames, CODENAME_VALUES));
};
