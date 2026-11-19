import {Enum} from 'enum-plus';

export const SubtitleNote = Enum({
  HEARING_IMPAIRED: {
    value: 'hearing-impaired',
    label: 'HI',
    noteFlagName: 'isHearingImpaired',
  },
  FORCED: {value: 'forced', label: 'Forced', noteFlagName: 'isForced'},
  MACHINE_TRANSLATED: {
    value: 'machine-translated',
    label: 'MT',
    noteFlagName: 'isMachineTranslated',
  },
  QUOTA_COSTLY: {
    value: 'quota-costly',
    label: 'Quota',
    noteFlagName: 'isQuotaCostly',
  },
});

export const SubtitleNotice = Enum({
  OPENSUBTITLES_ACCOUNT: {
    value: 'opensubtitles-account',
    label: 'Add an OpenSubtitles account to see {hiddenSubtitleCount} more',
    noticeFileText: 'Add an OpenSubtitles account to see more subtitles.',
  },
  OPENSUBTITLES_ACCOUNT_FIX: {
    value: 'opensubtitles-account-fix',
    label: 'Fix your OpenSubtitles account to see {hiddenSubtitleCount} more',
    noticeFileText: 'Fix your OpenSubtitles account to see more subtitles.',
  },
});

export const SubtitleMessage = Enum({
  RATE_LIMITED: {
    value: 'rate-limited',
    label: 'Too many requests, try again in a minute.',
  },
  SUBTITLE_NOT_FOUND: {
    value: 'subtitle-not-found',
    label: 'Subtitle not found.',
  },
  USER_CONFIG_DELETED: {
    value: 'user-config-deleted',
    label: 'This configuration was deleted.',
  },
  SUBTITLE_DOWNLOAD_FAILED: {
    value: 'subtitle-download-failed',
    label: 'This subtitle could not be downloaded. Please try another one.',
  },
});
