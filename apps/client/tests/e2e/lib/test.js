import {expect, test as base} from '@playwright/test';

const UNSERVED_FAVICON_PATH = '/favicon.ico';

export const test = base.extend({
  allowedConsoleError: [null, {option: true}],
  consoleGuard: [
    async ({context, allowedConsoleError}, use) => {
      const errors = [];
      const record = text => {
        if (!allowedConsoleError?.test(text)) {
          errors.push(text);
        }
      };
      const watch = page => {
        page.on('console', message => {
          const {url} = message.location();
          if (
            message.type() !== 'error' ||
            url.endsWith(UNSERVED_FAVICON_PATH)
          ) {
            return;
          }
          record(url ? `${message.text()} (${url})` : message.text());
        });
        page.on('pageerror', error => record(String(error)));
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await use();
      expect(errors, 'Unexpected console errors.').toEqual([]);
    },
    {auto: true},
  ],
});

export {expect};
