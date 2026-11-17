import {range} from 'es-toolkit';
import {describe, expect, it} from 'vitest';
import {toOffsetPagePayload} from '../src/lib/pagination.js';

const PAGE_SIZE = 10;

function getPage({pageNumber, totalItemCount, windowSize}) {
  const offset = (pageNumber - 1) * PAGE_SIZE;
  const items = range(offset, Math.min(offset + PAGE_SIZE, totalItemCount));
  return toOffsetPagePayload({
    items,
    totalItemCount,
    pageNumber,
    pageSize: PAGE_SIZE,
    offset,
    windowSize,
  });
}

describe('toOffsetPagePayload', () => {
  it('reads an empty list as one page holding nothing', () => {
    expect(getPage({pageNumber: 1, totalItemCount: 0})).toEqual({
      links: {first: 1, previous: null, next: null, last: 1},
      meta: {
        pageNumber: 1,
        pageSize: PAGE_SIZE,
        offset: 0,
        rangeStart: 0,
        rangeEnd: 0,
        totalPageCount: 1,
        totalItemCount: 0,
      },
      items: [],
    });
  });

  it('counts the range of a full page and of the shorter last one', () => {
    expect(getPage({pageNumber: 2, totalItemCount: 25}).meta).toMatchObject({
      rangeStart: 11,
      rangeEnd: 20,
      totalPageCount: 3,
    });
    expect(getPage({pageNumber: 3, totalItemCount: 25}).meta).toMatchObject({
      rangeStart: 21,
      rangeEnd: 25,
    });
  });

  it('has no previous page on the first page', () => {
    expect(getPage({pageNumber: 1, totalItemCount: 25}).links).toMatchObject({
      previous: null,
      next: 2,
    });
  });

  it('has no next page on the last page', () => {
    expect(getPage({pageNumber: 3, totalItemCount: 25}).links).toMatchObject({
      previous: 2,
      next: null,
    });
  });

  it('points previous at the last page from past the end', () => {
    expect(getPage({pageNumber: 7, totalItemCount: 25})).toMatchObject({
      links: {previous: 3, next: null, last: 3},
      meta: {rangeStart: 0, rangeEnd: 0},
    });
  });

  it('leaves the window out unless one is asked for', () => {
    expect(
      getPage({pageNumber: 2, totalItemCount: 25}).links,
    ).not.toHaveProperty('window');
    expect(
      getPage({pageNumber: 2, totalItemCount: 25, windowSize: 0}).links,
    ).not.toHaveProperty('window');
  });

  it.each([
    {position: 'centred on the page', pageNumber: 5, window: [3, 4, 5, 6, 7]},
    {position: 'clamped at the start', pageNumber: 1, window: [1, 2, 3, 4, 5]},
    {position: 'clamped at the end', pageNumber: 10, window: [6, 7, 8, 9, 10]},
  ])('keeps a window $position', ({pageNumber, window}) => {
    expect(
      getPage({pageNumber, totalItemCount: 100, windowSize: 5}).links.window,
    ).toEqual(window);
  });

  it('shortens the window to the pages there are', () => {
    expect(
      getPage({pageNumber: 2, totalItemCount: 25, windowSize: 5}).links.window,
    ).toEqual([1, 2, 3]);
  });
});
