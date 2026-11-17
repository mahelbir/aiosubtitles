import {env} from '@/config/env';

const formatters = new Map();

/**
 * @template {typeof Intl.DateTimeFormat|typeof Intl.NumberFormat|typeof Intl.Collator|typeof Intl.RelativeTimeFormat|typeof Intl.DurationFormat|typeof Intl.ListFormat} T
 * @param {T} Formatter
 * @param {Object} [options]
 * @returns {InstanceType<T>}
 */
export function getIntlFormatter(Formatter, options) {
  const key = `${Formatter.name}:${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Formatter(env.LOCALE, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value, options) {
  const number = Number(value);
  return Number.isFinite(number)
    ? getIntlFormatter(Intl.NumberFormat, options).format(number)
    : '';
}
