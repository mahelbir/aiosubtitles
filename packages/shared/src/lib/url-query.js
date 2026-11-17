import {pick} from 'es-toolkit';
import qs from 'qs';

const QUERY_OPTIONS = {addQueryPrefix: true, arrayFormat: 'repeat'};

const PAGE_QUERY_OPTIONS = {...QUERY_OPTIONS, strictNullHandling: true};

const API_QUERY_OPTIONS = {
  ...QUERY_OPTIONS,
  skipNulls: true,
  filter: (prefix, value) => (value === '' ? undefined : value),
};

function appendQuery(path, query, options) {
  if (!query) {
    return path;
  }
  const sorted = pick(query, Object.keys(query).sort());
  return `${path}${qs.stringify(sorted, options)}`;
}

export function withQuery(path, query) {
  return appendQuery(path, query, PAGE_QUERY_OPTIONS);
}

export function withApiQuery(path, query) {
  return appendQuery(path, query, API_QUERY_OPTIONS);
}
