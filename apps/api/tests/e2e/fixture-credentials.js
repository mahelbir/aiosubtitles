export const THESUBTITLEDB_VALID_API_KEY = 'sdb_valid_fixture';

export const OPENSUBTITLES_SHARED_API_KEY = 'opensubtitles-shared-fixture-key';

export const THESUBTITLEDB_LATE_API_KEY_PREFIX = 'sdb_late_fixture_';

export const OPENSUBTITLES_VALID_ACCOUNT = Object.freeze({
  username: 'fixture-user',
  password: 'fixture-pass',
});

export const OPENSUBTITLES_STALE_QUOTA_ACCOUNT = Object.freeze({
  username: 'fixture-stale-user',
  password: 'fixture-pass',
});

export const OPENSUBTITLES_PAST_QUOTA_RESET_AT = new Date(Date.UTC(2000, 0, 1));

export const OPENSUBTITLES_FIXTURE_QUOTA = Object.freeze({
  quotaRemainingCount: 17,
  quotaAllowedCount: 20,
});
