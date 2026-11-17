import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

export const CLIENT_EXPORT_FIXTURE_ROOT = fileURLToPath(
  new URL('../fixtures/client-export/', import.meta.url),
);

export const CLIENT_EXPORT_ASSET_PATH =
  '/_next/static/media/258bd0ab5fdd762a-s.2f7nqdagzwx2-.woff2';

export const UUID_V4 = '0f8fad5b-d9cb-469f-a165-70867728950e';

export function fixturePath(name) {
  return path.join(CLIENT_EXPORT_FIXTURE_ROOT, name);
}
