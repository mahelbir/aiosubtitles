import {existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {runGit} from './git.js';

export class PrivateOutputPathError extends Error {
  constructor() {
    super(
      'A private output must lie outside every git work tree or in an ignored folder.',
    );
    this.name = 'PrivateOutputPathError';
  }
}

const findExistingFolder = filePath => {
  let folderPath = dirname(filePath);
  while (!existsSync(folderPath)) {
    folderPath = dirname(folderPath);
  }
  return folderPath;
};

const isInsideWorkTree = folderPath => {
  try {
    return (
      runGit(folderPath, ['rev-parse', '--is-inside-work-tree']) === 'true'
    );
  } catch {
    return false;
  }
};

const isIgnored = (folderPath, filePath) => {
  try {
    runGit(folderPath, ['check-ignore', '--quiet', filePath]);
    return true;
  } catch {
    return false;
  }
};

export const assertPrivateOutputPath = filePath => {
  const folderPath = findExistingFolder(filePath);
  if (isInsideWorkTree(folderPath) && !isIgnored(folderPath, filePath)) {
    throw new PrivateOutputPathError();
  }
};
