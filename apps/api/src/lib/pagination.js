import {deepFreeze} from 'melperjs';
import {
  DEFAULT_PAGE_NUMBER,
  DEFAULT_PAGE_SIZE,
} from '@repo/shared/constants/pagination.js';

export const OFFSET_PAGINATION_KEYS = deepFreeze(
  new Set(['pageNumber', 'pageSize', 'windowSize', 'sort', 'search']),
);

export function toOffsetPageRequest(query = {}) {
  const pageNumber = Math.max(+query.pageNumber || DEFAULT_PAGE_NUMBER, 1);
  const pageSize = Math.max(+query.pageSize || DEFAULT_PAGE_SIZE, 1);
  return {
    pageNumber,
    pageSize,
    offset: (pageNumber - 1) * pageSize,
    windowSize: Math.max(+query.windowSize || 0, 0),
  };
}
