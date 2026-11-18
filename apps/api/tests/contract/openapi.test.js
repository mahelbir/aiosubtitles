import {describe, expect, it} from 'vitest';
import {getScopeWith, getTestApp} from '../helpers/app.js';

describe('OpenAPI document', () => {
  it('matches the recorded contract', async () => {
    await getTestApp();
    expect(getScopeWith('swagger').swagger()).toMatchSnapshot();
  });

  it('marks every operation outside the public set as requiring a credential', async () => {
    await getTestApp();
    const document = getScopeWith('swagger').swagger();
    const open = [];
    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        if (!operation.security || operation.security.length === 0) {
          open.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect(open.toSorted()).toEqual([
      'GET /',
      'GET /api/subtitle-sources',
      'GET /manifest.json',
      'GET /{userConfigId}/configure',
      'GET /{userConfigId}/manifest.json',
      'GET /{userConfigId}/subtitle-files/{videoId}/{urlCode}.{fileExtension}',
      'GET /{userConfigId}/subtitle-notices/{noticeName}.srt',
      'POST /api/user-configs',
      'POST /api/user-configs/{userConfigId}/sessions',
    ]);
  });
});
