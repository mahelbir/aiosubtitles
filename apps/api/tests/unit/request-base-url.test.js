import {afterEach, describe, expect, it, vi} from 'vitest';
import {getRequestBaseUrl} from '../../src/routes/_request-base-url.js';

const mockedConfig = vi.hoisted(() => ({apiBasePath: ''}));

vi.mock('../../src/config/index.js', () => ({config: mockedConfig}));

afterEach(() => {
  mockedConfig.apiBasePath = '';
});

describe('getRequestBaseUrl', () => {
  it('builds the origin the request reached, with no trailing slash', () => {
    expect(getRequestBaseUrl({protocol: 'https', host: 'addon.test'})).toBe(
      'https://addon.test',
    );
  });

  it('appends the base path the API is mounted under', () => {
    mockedConfig.apiBasePath = '/addon';

    expect(getRequestBaseUrl({protocol: 'http', host: 'localhost:8080'})).toBe(
      'http://localhost:8080/addon',
    );
  });
});
