import {describe, expect, it} from 'vitest';
import {getConfigurePageUrl} from '../../src/lib/configure-page-url.js';
import {UUID_V4} from '../helpers/client-export.js';

describe('getConfigurePageUrl', () => {
  it('redirects a stored config to the page with its id', () => {
    expect(getConfigurePageUrl({userConfigId: UUID_V4})).toBe(
      `/configure?userConfigId=${UUID_V4}`,
    );
    expect(getConfigurePageUrl({userConfigId: 'nope'})).toBe('/configure');
    expect(
      getConfigurePageUrl({
        userConfigId: UUID_V4,
        pageOrigin: 'http://127.0.0.1:3000',
      }),
    ).toBe(`http://127.0.0.1:3000/configure?userConfigId=${UUID_V4}`);
  });
});
