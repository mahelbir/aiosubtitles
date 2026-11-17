const MAX_VIDEO_ID_LENGTH = 128;
const NON_PCHAR_PATTERN = /[^A-Za-z0-9\-._~!$&'()*+,;=:@]/gu;
const NON_ASCII_PATTERN = /\P{ASCII}/u;

const encodeVideoId = videoId =>
  videoId.toWellFormed().replace(NON_PCHAR_PATTERN, encodeURIComponent);

const isVideoIdTooLong = (videoId, encodedVideoId) => {
  const measuredVideoId = NON_ASCII_PATTERN.test(videoId)
    ? encodedVideoId
    : videoId;
  return measuredVideoId.length > MAX_VIDEO_ID_LENGTH;
};

export const buildSubtitleUrl = ({
  baseUrl,
  userConfigId,
  videoId,
  urlCode,
  fileExtension,
}) => {
  const encodedVideoId = encodeVideoId(videoId);
  if (isVideoIdTooLong(videoId, encodedVideoId)) {
    return null;
  }
  return `${baseUrl}/${userConfigId}/subtitle-files/${encodedVideoId}/${urlCode}.${fileExtension}`;
};
