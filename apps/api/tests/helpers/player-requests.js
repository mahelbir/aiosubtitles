import {compact, isNil, pickBy} from 'es-toolkit';

const EXTRA_NAMES = ['videoHash', 'videoSize', 'filename'];
const URI_COMPONENT_SUB_DELIM_PATTERN = /[!'()*]/g;

export function buildStremioListUrl({
  userConfigId,
  videoType,
  videoId,
  extras = {},
}) {
  return toListUrl({
    userConfigId,
    videoType,
    videoId: encodeURIComponent(videoId),
    extraSegment: toExtraSegment(
      pickBy(extras, extraValue => !isNil(extraValue)),
      encodeURIComponent,
    ),
  });
}

export function buildNuvioDesktopListUrl({
  userConfigId,
  videoType,
  videoId,
  extras = {},
}) {
  return toListUrl({
    userConfigId,
    videoType,
    videoId: encodeUnreserved(videoId),
    extraSegment: toExtraSegment(toNuvioExtras(extras), encodeUnreserved),
  });
}

export function buildNuvioLegacyRequests({
  userConfigId,
  videoType,
  videoId,
  extras = {},
}) {
  const extraSegment = toExtraSegment(toNuvioExtras(extras), encodeUnreserved);
  return compact([
    toListUrl({userConfigId, videoType, videoId, extraSegment: ''}),
    extraSegment && toListUrl({userConfigId, videoType, videoId, extraSegment}),
  ]);
}

function toListUrl({userConfigId, videoType, videoId, extraSegment}) {
  const videoPath = `/addon/${userConfigId}/subtitles/${videoType}/${videoId}`;
  return extraSegment
    ? `${videoPath}/${extraSegment}.json`
    : `${videoPath}.json`;
}

function toExtraSegment(extras, encodeExtraValue) {
  return EXTRA_NAMES.filter(extraName => Object.hasOwn(extras, extraName))
    .map(
      extraName =>
        `${extraName}=${encodeExtraValue(String(extras[extraName]))}`,
    )
    .join('&');
}

function toNuvioExtras({videoHash, videoSize, filename}) {
  return pickBy(
    {
      videoHash: videoHash?.trim(),
      videoSize: videoSize > 0 ? videoSize : null,
      filename: filename?.trim(),
    },
    extraValue => !isNil(extraValue) && extraValue !== '',
  );
}

function encodeUnreserved(extraValue) {
  return encodeURIComponent(extraValue).replace(
    URI_COMPONENT_SUB_DELIM_PATTERN,
    subDelim =>
      `%${subDelim.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}
