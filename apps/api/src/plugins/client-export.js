import {existsSync} from 'node:fs';
import {glob, readFile} from 'node:fs/promises';
import * as path from 'node:path';
import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import {config} from '../config/index.js';
import {buildClientCsp} from '../lib/client-csp.js';
import {CONFIGURE_PAGE_DEV_ORIGIN} from '../lib/configure-page-url.js';

const PAGE_EXTENSION = '.html';
const PAGE_PATTERN = `**/*${PAGE_EXTENSION}`;
const INDEX_PAGE_NAME = 'index';
const UNSERVED_PAGES = new Set(['index.html', '404.html', '_not-found.html']);
const PAGE_CONTENT_TYPE = 'text/html; charset=utf-8';
const HASHED_ASSET_DIR = path.join('_next', 'static');
const HASHED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const ASSET_CACHE_CONTROL = 'public, max-age=0';
const CONFIGURE_PAGE_RATE_LIMIT_GROUP = 'configure-page';
const CONFIGURE_PAGE_RATE_LIMIT_IP_MAX = 60;
const CONFIGURE_PAGE_RATE_LIMITS = [
  {max: CONFIGURE_PAGE_RATE_LIMIT_IP_MAX, timeWindow: config.rateLimitWindow},
];

export default fp(
  async function clientExportPlugin(
    fastify,
    {
      root = config.clientExportRoot,
      basePath = config.apiBasePath,
      devOrigin = CONFIGURE_PAGE_DEV_ORIGIN,
    } = {},
  ) {
    if (devOrigin) {
      return;
    }
    if (!existsSync(root)) {
      fastify.log.warn(`No client export at ${root}, the client is not served`);
      return;
    }

    const pages = await readPages(root);
    const hashedAssetPath = path.join(path.resolve(root), HASHED_ASSET_DIR);

    await fastify.register(async function clientExportScope(scope) {
      await scope.register(fastifyStatic, {
        root,
        prefix: `${basePath}/`,
        wildcard: false,
        globIgnore: [PAGE_PATTERN],
        decorateReply: false,
        dotfiles: 'deny',
        cacheControl: false,
        setHeaders(reply, filePath) {
          const isHashed = filePath.startsWith(hashedAssetPath + path.sep);
          reply.header(
            'cache-control',
            isHashed ? HASHED_ASSET_CACHE_CONTROL : ASSET_CACHE_CONTROL,
          );
        },
      });

      scope.addHook('onSend', async (request, reply) => {
        const csp = request.routeOptions.config.clientCsp;
        if (csp) {
          reply.header('content-security-policy', csp);
        }
      });

      for (const page of pages) {
        scope.get(
          `${basePath}${page.url}`,
          {
            schema: {hide: true},
            config: {
              clientCsp: page.csp,
              rateLimitGroup: CONFIGURE_PAGE_RATE_LIMIT_GROUP,
              rateLimits: CONFIGURE_PAGE_RATE_LIMITS,
            },
          },
          async (request, reply) =>
            reply.type(PAGE_CONTENT_TYPE).send(page.html),
        );
      }
    });
  },
  {name: 'client-export', dependencies: ['rate-limit']},
);

async function readPages(root) {
  const files = await Array.fromAsync(glob(PAGE_PATTERN, {cwd: root}));
  return Promise.all(
    files
      .filter(file => !UNSERVED_PAGES.has(file))
      .map(async file => {
        const html = await readFile(path.join(root, file), 'utf8');
        return {url: getPageUrl(file), html, csp: buildClientCsp(html)};
      }),
  );
}

function getPageUrl(file) {
  const {dir, name} = path.posix.parse(file.split(path.sep).join('/'));
  return path.posix.join('/', dir, name === INDEX_PAGE_NAME ? '' : name);
}
