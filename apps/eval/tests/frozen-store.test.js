import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {createFrozenStore} from '../src/corpus/frozen-store.js';
import {
  ATLAS_FIXTURE_ROOT,
  V90_LIST_SHA256,
} from './support/atlas-fixture.js';

const blobPath = sha256 =>
  join(
    ATLAS_FIXTURE_ROOT,
    'eval',
    'cache',
    'frozen',
    'sha256',
    sha256.slice(0, 2),
    sha256,
  );

const captureRejection = promise =>
  promise.then(
    () => null,
    error => error,
  );

describe('createFrozenStore', () => {
  const store = createFrozenStore(ATLAS_FIXTURE_ROOT);

  it('reads the bytes of a blob by its SHA-256', async () => {
    const blob = await store.readBlob(V90_LIST_SHA256);
    expect(Buffer.isBuffer(blob)).toBe(true);
    expect(blob.equals(await readFile(blobPath(V90_LIST_SHA256)))).toBe(true);
  });

  it('parses a JSON blob', async () => {
    const listBlob = await store.readJsonBlob(V90_LIST_SHA256);
    expect(Object.keys(listBlob)).toEqual(['subtitles']);
    expect(listBlob.subtitles).toHaveLength(6);
  });

  it.each([
    ['a parent path', '../x'],
    ['the upper-case form of a stored hash', V90_LIST_SHA256.toUpperCase()],
    ['a 63-character hash', V90_LIST_SHA256.slice(1)],
    ['a hash with a path separator', `${V90_LIST_SHA256.slice(0, 63)}/`],
    ['an empty text', ''],
  ])('rejects %s before touching the file system', async (_label, sha256) => {
    for (const methodName of ['readBlob', 'readJsonBlob']) {
      const error = await captureRejection(store[methodName](sha256));
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBeUndefined();
    }
  });

  it('rejects a well-formed hash that has no blob', async () => {
    await expect(store.readBlob('0'.repeat(64))).rejects.toThrow();
  });
});
