import {readFile} from 'node:fs/promises';
import {atlasPaths} from './atlas-paths.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export class FrozenBlobHashError extends Error {
  constructor(
    message = 'A frozen blob hash must be 64 lower-case hex characters.',
  ) {
    super(message);
    this.name = 'FrozenBlobHashError';
  }
}

export const createFrozenStore = atlasRoot => {
  const readBlob = async sha256 => {
    if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
      throw new FrozenBlobHashError();
    }
    return readFile(atlasPaths.frozenBlob(atlasRoot, sha256));
  };
  return {
    readBlob,
    readJsonBlob: async sha256 =>
      JSON.parse((await readBlob(sha256)).toString('utf8')),
  };
};
