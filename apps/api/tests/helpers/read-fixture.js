import {readFile} from 'node:fs/promises';
import path from 'node:path';

const FIXTURE_ROOT_URL = new URL('../fixtures/', import.meta.url);

export async function readFixture(relativePath) {
  const fixtureBytes = await readFile(new URL(relativePath, FIXTURE_ROOT_URL));
  return path.extname(relativePath) === '.json'
    ? JSON.parse(fixtureBytes.toString('utf8'))
    : fixtureBytes;
}
