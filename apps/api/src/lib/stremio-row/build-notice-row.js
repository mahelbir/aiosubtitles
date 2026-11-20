import {getAddonUrl} from '../addon-url.js';
import {SubtitleNotice} from './stremio-row-enums.js';

export const buildNoticeRow = ({
  baseUrl,
  userConfigId,
  subtitleNotice,
  languageCode,
  hiddenSubtitleCount,
}) => ({
  id: `notice-${subtitleNotice}`,
  url: `${getAddonUrl({baseUrl, userConfigId})}/subtitle-notices/${subtitleNotice}.srt`,
  lang: languageCode,
  label: SubtitleNotice.label(subtitleNotice).replace(
    '{hiddenSubtitleCount}',
    String(hiddenSubtitleCount),
  ),
});
