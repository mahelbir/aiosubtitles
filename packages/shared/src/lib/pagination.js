import {range} from 'es-toolkit';

function pageWindow(pageNumber, totalPageCount, windowSize) {
  let start = Math.max(1, pageNumber - Math.floor(windowSize / 2));
  const end = Math.min(totalPageCount, start + windowSize - 1);
  if (end - start + 1 < windowSize && start > 1) {
    start = Math.max(1, end - windowSize + 1);
  }
  return range(start, end + 1);
}

export function toOffsetPagePayload({
  items,
  totalItemCount,
  pageNumber,
  pageSize,
  offset,
  windowSize = 0,
}) {
  const totalPageCount = Math.max(1, Math.ceil(totalItemCount / pageSize));
  return {
    links: {
      first: 1,
      previous:
        pageNumber > 1 ? Math.min(pageNumber - 1, totalPageCount) : null,
      next: pageNumber < totalPageCount ? pageNumber + 1 : null,
      last: totalPageCount,
      ...(windowSize && {
        window: pageWindow(pageNumber, totalPageCount, windowSize),
      }),
    },
    meta: {
      pageNumber,
      pageSize,
      offset,
      rangeStart: items.length ? offset + 1 : 0,
      rangeEnd: items.length ? offset + items.length : 0,
      totalPageCount,
      totalItemCount,
    },
    items,
  };
}
