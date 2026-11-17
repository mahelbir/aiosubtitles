import {SubtitleNotice} from '../constants/subtitle-core-enums.js';

export const buildNoticeRow = ({
  baseUrl,
  userConfigId,
  subtitleNotice,
  languageCode,
  hiddenSubtitleCount,
}) => ({
  id: `notice-${subtitleNotice}`,
  url: `${baseUrl}/${userConfigId}/subtitle-notices/${subtitleNotice}.srt`,
  lang: languageCode,
  label: SubtitleNotice.label(subtitleNotice).replace(
    '{hiddenSubtitleCount}',
    String(hiddenSubtitleCount),
  ),
});
