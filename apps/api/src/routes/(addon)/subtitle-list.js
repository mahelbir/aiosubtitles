import {z} from 'zod';
import {StatusCodes} from 'http-status-codes';
import {buildNoticeRow} from '@repo/subtitle-core/stremio-row/build-notice-row.js';
import {buildStremioSubtitles} from '@repo/subtitle-core/stremio-row/build-stremio-subtitles.js';
import {config} from '../../config/index.js';
import {RateLimitKey} from '../../lib/rate-limit.js';
import {
  drainPendingSearches,
  searchSubtitleSource,
} from '../../lib/subtitle-search/search-subtitle-source.js';
import {readSearchCredentials} from '../../lib/subtitle-source-credentials.js';
import {
  readCandidateCues,
  readVideoCandidates,
} from '../../lib/subtitle-store/read-video-candidates.js';
import {getRequestBaseUrl} from '../_request-base-url.js';
import {getSubtitleSourceRegistry} from '../_subtitle-source-registry.js';
import {getVideoCatalog} from '../_video-catalog.js';
import {AddonVideoType} from './_addon-video-type.js';
import {readCachedUserConfig} from './_cached-user-config.js';
import {stremioVideoIdField} from './_stremio-video-id.js';
import {
  collectVideoCandidates,
  readOpensubtitlesNotice,
} from './_subtitle-list/collect-candidates.js';
import {
  listNearDuplicateCandidates,
  rankVideoCandidates,
} from './_subtitle-list/rank-candidates.js';
import {
  parseSubtitleListExtras,
  readRawExtraSegment,
} from './_subtitle-list/read-list-request.js';
import {createRequestDeadline} from './_subtitle-list/request-deadline.js';
import {resolveListVideo} from './_subtitle-list/resolve-list-video.js';

const LIST_CACHE_CONTROL = 'no-store';

const EMPTY_SUBTITLE_LIST = Object.freeze({subtitles: []});

const listParamsSchema = z.object({
  userConfigId: z.string(),
  type: z.enum(AddonVideoType.values),
  videoId: stremioVideoIdField,
});

const SUBTITLE_LIST_ROUTES = [
  {
    listUrl: '/:userConfigId/subtitles/:type/:videoId.json',
    listParamsSchema,
  },
  {
    listUrl: '/:userConfigId/subtitles/:type/:videoId/:extra.json',
    listParamsSchema: listParamsSchema.extend({extra: z.string()}),
  },
];

const SUBTITLE_LIST_RESPONSE_SCHEMA = {
  [StatusCodes.OK]: z
    .object({
      subtitles: z.array(
        z.object({
          id: z.string(),
          url: z.string(),
          lang: z.string(),
          label: z.string(),
          subtitleFileName: z.string().optional(),
        }),
      ),
    })
    .describe('The Stremio subtitle list'),
};

const SUBTITLE_LIST_ROUTE_CONFIG = {
  isAddonRoute: true,
  rateLimitGroup: 'subtitle-list',
  rateLimits: [
    {
      max: config.subtitleListRateLimitIpMax,
      timeWindow: config.rateLimitWindow,
    },
    {
      key: RateLimitKey.USER_CONFIG,
      max: config.subtitleListRateLimitUserConfigMax,
      timeWindow: config.rateLimitWindow,
    },
  ],
  replyAddonFallback: (request, reply) => sendEmptySubtitleList(reply),
  onRateLimited: (request, result, reply) => sendEmptySubtitleList(reply),
};

export default async function (fastify, opts) {
  const subtitleSourceRegistry = getSubtitleSourceRegistry(opts);
  const videoCatalog = getVideoCatalog(opts);

  fastify.addHook('preClose', drainPendingSearches);

  for (const {listUrl, listParamsSchema: params} of SUBTITLE_LIST_ROUTES) {
    fastify.get(
      listUrl,
      {
        schema: {params, response: SUBTITLE_LIST_RESPONSE_SCHEMA},
        config: SUBTITLE_LIST_ROUTE_CONFIG,
      },
      async (request, reply) => {
        const requestDeadline = createRequestDeadline(
          Date.now() - reply.elapsedTime + config.subtitleSearchDeadline,
        );
        reply.header('cache-control', LIST_CACHE_CONTROL);
        const {userConfigId, type: videoType, videoId, extra} = request.params;
        const cachedUserConfig = await readCachedUserConfig(userConfigId);
        if (!cachedUserConfig) {
          return EMPTY_SUBTITLE_LIST;
        }
        const {languageCodes, subtitleLanguageLimit} = cachedUserConfig;
        const {videoContext, searchQuery} = await resolveListVideo({
          videoId,
          videoType,
          extras: parseSubtitleListExtras(
            extra === undefined ? undefined : readRawExtraSegment(request.url),
          ),
          videoCatalog,
          raceDeadline: requestDeadline.raceDeadline,
        });
        const searchSignal = requestDeadline.toSignal();
        await requestDeadline.raceDeadline(
          Promise.all(
            subtitleSourceRegistry
              .listSubtitleSourceClients()
              .filter(
                ({subtitleSource}) =>
                  cachedUserConfig.subtitleSourceSwitchStates[
                    subtitleSource
                  ] !== false,
              )
              .map(client =>
                searchSubtitleSource({
                  client,
                  searchQuery: {...searchQuery, languageCodes},
                  ...readSearchCredentials({cachedUserConfig, client}),
                  signal: searchSignal,
                }),
              ),
          ),
          null,
        );
        const candidates = collectVideoCandidates({
          cachedUserConfig,
          videoContext,
          candidates: await readVideoCandidates({videoId, videoContext}),
          subtitleSourceRegistry,
        });
        const {rankedRows, hiddenSubtitleCount} = rankVideoCandidates({
          candidates,
          videoContext,
          languageCodes,
          subtitleLanguageLimit,
          cuesByFileSubtitleId: await requestDeadline.raceDeadline(
            readCandidateCues(listNearDuplicateCandidates(candidates), {
              signal: requestDeadline.toSignal(),
            }),
            new Map(),
          ),
        });
        const baseUrl = getRequestBaseUrl(request);
        const subtitles = buildStremioSubtitles({
          rankedRows,
          baseUrl,
          userConfigId,
          videoId,
        });
        if (hiddenSubtitleCount > 0) {
          subtitles.push(
            buildNoticeRow({
              baseUrl,
              userConfigId,
              subtitleNotice: readOpensubtitlesNotice(cachedUserConfig),
              languageCode: languageCodes[0],
              hiddenSubtitleCount,
            }),
          );
        }
        return {subtitles};
      },
    );
  }
}

function sendEmptySubtitleList(reply) {
  return reply
    .code(StatusCodes.OK)
    .header('cache-control', LIST_CACHE_CONTROL)
    .send(EMPTY_SUBTITLE_LIST);
}
