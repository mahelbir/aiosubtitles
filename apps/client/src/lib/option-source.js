export const OPTION_PAGE_SIZE = 20;
export const OPTIONS_EMPTY_MESSAGE = 'No results.';
export const OPTIONS_FAILURE_MESSAGE = 'Options could not be loaded.';

/**
 * @typedef {{value: *, label: string, keywords?: string[], disabled?: boolean, group?: string}} Option
 */

/**
 * @typedef {ReturnType<typeof import('@repo/shared/lib/pagination.js').toOffsetPagePayload>} OffsetPagePayload
 */

/**
 * @typedef {(query: {pageNumber: number, pageSize: number, search?: string, id?: Array}, context: {signal: AbortSignal}) => Promise<OffsetPagePayload>} OptionPageFetcher
 */

/**
 * @typedef {{queryKey: Array, fetchPage: OptionPageFetcher, toOption: (record: *) => Option}} OptionPages
 */

/**
 * @typedef {{queryKey: Array, queryFn: Function, select: (data: *) => Option[]}} OptionListQuery
 */

/**
 * @typedef {{kind: 'fixed', options: Option[]}|{kind: 'preloaded', queryOptions: OptionListQuery}|({kind: 'preloadedPages'|'remote'} & OptionPages)} OptionSource
 */

function toLabelValued(option) {
  return {...option, value: option.label};
}

export const optionSource = {
  /**
   * @param {OptionSource} source
   * @returns {OptionSource}
   */
  byLabel(source) {
    switch (source.kind) {
      case 'fixed':
        return {...source, options: source.options.map(toLabelValued)};
      case 'preloaded':
        return {
          ...source,
          queryOptions: {
            ...source.queryOptions,
            select: data => source.queryOptions.select(data).map(toLabelValued),
          },
        };
      default:
        return {
          ...source,
          toOption: record => toLabelValued(source.toOption(record)),
        };
    }
  },

  /**
   * @param {Option[]} options
   * @returns {OptionSource}
   */
  fixed(options) {
    return {kind: 'fixed', options};
  },

  /**
   * @param {OptionListQuery} queryOptions
   * @returns {OptionSource}
   */
  preloaded(queryOptions) {
    return {kind: 'preloaded', queryOptions};
  },

  /**
   * @param {OptionPages} pages
   * @returns {OptionSource}
   */
  preloadedPages({queryKey, fetchPage, toOption}) {
    return {kind: 'preloadedPages', queryKey, fetchPage, toOption};
  },

  /**
   * @param {OptionPages} pages
   * @returns {OptionSource}
   */
  remote({queryKey, fetchPage, toOption}) {
    return {kind: 'remote', queryKey, fetchPage, toOption};
  },
};
