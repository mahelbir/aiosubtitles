import {attemptAsync} from 'es-toolkit';
import {SubtitleFileExtension} from '@repo/subtitle-core/constants/subtitle-core-enums.js';
import {buildMessageSrt} from '@repo/subtitle-core/file-format/message-srt.js';
import {renderSubtitleFile} from '@repo/subtitle-core/file-format/render-subtitle.js';
import {config} from '../../config/index.js';
import {RateLimitKey} from '../../lib/rate-limit.js';
import {SubtitleMessage} from '../../lib/stremio-row/stremio-row-enums.js';
import {readCachedUserConfig} from './_cached-user-config.js';

const SUBTITLE_CONTENT_TYPES = Object.freeze({
  [SubtitleFileExtension.SRT]: 'application/x-subrip; charset=utf-8',
  [SubtitleFileExtension.ASS]: 'text/x-ssa; charset=utf-8',
});

const FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const MESSAGE_CACHE_CONTROL = 'no-store';

const SUBTITLE_FILE_RATE_LIMITS = [
  {max: config.rateLimitSubtitleFileIpMax, timeWindow: config.rateLimitWindow},
  {
    key: RateLimitKey.USER_CONFIG,
    max: config.rateLimitSubtitleFileUserConfigMax,
    timeWindow: config.rateLimitWindow,
    identify: identifyStoredUserConfig,
  },
];

export function toSubtitleFileRouteConfig(fallbackMessage) {
  return {
    isAddonRoute: true,
    rateLimits: SUBTITLE_FILE_RATE_LIMITS,
    replyAddonFallback: (request, reply) =>
      sendSubtitleMessage(reply, fallbackMessage),
    onRateLimited: (request, result, reply) =>
      sendSubtitleMessage(reply, SubtitleMessage.RATE_LIMITED),
  };
}

export function writeSubtitleFile(reply, {parsedSubtitle, fileExtension}) {
  reply
    .type(SUBTITLE_CONTENT_TYPES[fileExtension])
    .header('cache-control', FILE_CACHE_CONTROL);
  return renderSubtitleFile({parsedSubtitle, fileExtension});
}

export function writeMessageText(reply, messageText) {
  reply
    .type(SUBTITLE_CONTENT_TYPES[SubtitleFileExtension.SRT])
    .header('cache-control', MESSAGE_CACHE_CONTROL);
  return buildMessageSrt(messageText);
}

export function writeSubtitleMessage(reply, subtitleMessage) {
  return writeMessageText(reply, SubtitleMessage.label(subtitleMessage));
}

function sendSubtitleMessage(reply, subtitleMessage) {
  return reply.send(writeSubtitleMessage(reply, subtitleMessage));
}

async function identifyStoredUserConfig(request) {
  const [, cachedUserConfig] = await attemptAsync(() =>
    readCachedUserConfig(request.params.userConfigId),
  );
  return cachedUserConfig?.userConfigId ?? null;
}
