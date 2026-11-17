import {StatusCodes} from 'http-status-codes';
import {FIXTURES} from '../fixtures/registry.js';
import {PUBLIC_FIXTURES_PATH} from '../lib/fixture-page.js';
import {expect, test as warmup} from '../lib/test.js';

warmup(
  'compiles every route the suites open before either tier starts',
  async ({request}) => {
    warmup.slow();
    const requestRoute = route => request.get(route, {timeout: 0});
    const publicThemeRoute = `${PUBLIC_FIXTURES_PATH}/theme`;
    const routes = [
      '/configure',
      PUBLIC_FIXTURES_PATH,
      ...FIXTURES.map(({slug}) => `${PUBLIC_FIXTURES_PATH}/${slug}`),
    ];

    const coldResponses = [];
    for (const route of [publicThemeRoute]) {
      coldResponses.push(await requestRoute(route));
    }
    const [missing, ...responses] = await Promise.all(
      ['/e2e-warmup-missing', ...routes].map(requestRoute),
    );

    expect(missing.status()).toBe(StatusCodes.NOT_FOUND);
    expect(
      [...coldResponses, ...responses]
        .filter(response => !response.ok())
        .map(response => `${response.status()} ${response.url()}`),
    ).toEqual([]);
  },
);
