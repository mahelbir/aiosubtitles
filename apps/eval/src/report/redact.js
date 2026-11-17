const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s|)>\]]+/gi;
const AUTH_TOKEN_PATTERN = /auth=(?!<redacted>)[^\s|)>\]]+/gi;

const URL_PLACEHOLDER = '<url>';
const AUTH_PLACEHOLDER = 'auth=<redacted>';

export const redactReportText = text =>
  text
    .replace(URL_PATTERN, URL_PLACEHOLDER)
    .replace(AUTH_TOKEN_PATTERN, AUTH_PLACEHOLDER);
