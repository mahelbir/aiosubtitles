import {isNil, omitBy} from 'es-toolkit';
import {getIntlFormatter} from '@/lib/intl';

const UNIX_FACTORS = {s: 1e-3, ms: 1, us: 1e3, ns: 1e6};

const DATE_TIME_STYLE = {dateStyle: 'medium', timeStyle: 'short'};
const DATE_STYLE = {dateStyle: 'medium'};
const TIME_STYLE = {timeStyle: 'medium'};
const RELATIVE_STYLE = {numeric: 'auto'};
const RELATIVE_STEPS = Object.freeze([
  ['minute', 60],
  ['hour', 60],
  ['day', 24],
  ['week', 7],
  ['month', 365 / 12 / 7],
  ['year', 12],
]);
const DATE_INPUT_ZONE = {timeZone: 'UTC'};
const OPEN_BOUND = '…';
const DURATION_STYLE = {style: 'short'};
const SUB_SECOND_DURATION_STYLE = {
  style: 'short',
  millisecondsDisplay: 'always',
};
const DURATION_UNIT_STYLE = {style: 'unit', unitDisplay: 'short'};
const DURATION_LIST_STYLE = {type: 'unit', style: 'short'};
const DURATION_UNITS = Object.freeze([
  ['days', 'day'],
  ['hours', 'hour'],
  ['minutes', 'minute'],
  ['seconds', 'second'],
  ['milliseconds', 'millisecond'],
]);
const MS_PER_SECOND = 1e3;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const ISO_TIME_UNITS = Object.freeze([
  ['hours', 'H'],
  ['minutes', 'M'],
  ['seconds', 'S'],
]);

const YEAR_LENGTH = 4;

const pad = (value, length = 2) => String(value).padStart(length, '0');

/**
 * @param {string|number|Date|null|undefined} value
 * @param {'s'|'ms'|'us'|'ns'} [unix]
 * @returns {Date|null}
 */
export function toDate(value, unix) {
  if (isNil(value) || value === '') {
    return null;
  }
  const date = unix
    ? new Date(Math.round(Number(value) / UNIX_FACTORS[unix]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {'s'|'ms'|'us'|'ns'} [unix]
 * @returns {string|number}
 */
export function timestamp(unix) {
  return unix
    ? Math.round(Date.now() * UNIX_FACTORS[unix])
    : new Date().toISOString();
}

function format(value, style, {unix, ...options} = {}) {
  const date = toDate(value, unix);
  return date
    ? getIntlFormatter(Intl.DateTimeFormat, {...style, ...options}).format(date)
    : '';
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions & {unix?: 's'|'ms'|'us'|'ns'}} [options]
 * @returns {string}
 */
export function formatDateTime(value, options) {
  return format(value, DATE_TIME_STYLE, options);
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions & {unix?: 's'|'ms'|'us'|'ns'}} [options]
 * @returns {string}
 */
export function formatDate(value, options) {
  return format(value, DATE_STYLE, options);
}

/**
 * @param {string|number|Date|null|undefined} start
 * @param {string|number|Date|null|undefined} end
 * @param {Intl.DateTimeFormatOptions & Object} [options]
 * @param {'s'|'ms'|'us'|'ns'} [options.unix]
 * @returns {string}
 */
export function formatDateRange(start, end, {unix, ...options} = {}) {
  const startDate = toDate(start, unix);
  const endDate = toDate(end, unix);
  if (!startDate && !endDate) {
    return '';
  }
  const formatter = getIntlFormatter(Intl.DateTimeFormat, {
    ...DATE_STYLE,
    ...options,
  });
  if (startDate && endDate) {
    return formatter.formatRange(startDate, endDate);
  }
  const formatBound = date => (date ? formatter.format(date) : OPEN_BOUND);
  return `${formatBound(startDate)} – ${formatBound(endDate)}`;
}

export function formatDateInput(value) {
  return formatDate(value, DATE_INPUT_ZONE);
}

export function formatDateInputRange(from, to) {
  return formatDateRange(from, to, DATE_INPUT_ZONE);
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions & {unix?: 's'|'ms'|'us'|'ns'}} [options]
 * @returns {string}
 */
export function formatTime(value, options) {
  return format(value, TIME_STYLE, options);
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {{unix?: 's'|'ms'|'us'|'ns', now?: number}} [options]
 * @returns {string}
 */
export function formatRelativeTime(value, {unix, now = Date.now()} = {}) {
  const date = toDate(value, unix);
  if (!date) {
    return '';
  }
  let amount = (date.getTime() - now) / 1e3;
  let unit = 'second';
  for (const [next, factor] of RELATIVE_STEPS) {
    if (Math.abs(Math.round(amount)) < factor) {
      break;
    }
    amount /= factor;
    unit = next;
  }
  return getIntlFormatter(Intl.RelativeTimeFormat, RELATIVE_STYLE).format(
    Math.round(amount),
    unit,
  );
}

/**
 * @param {string|number|Date|null|undefined} value
 * @returns {string}
 */
export function toDateInput(value) {
  const date = toDate(value);
  return date
    ? `${pad(date.getFullYear(), YEAR_LENGTH)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : '';
}

export function todayIsoDate() {
  return toDateInput(new Date());
}

/**
 * @param {string|number|Date|null|undefined} value
 * @returns {string}
 */
export function toDateTimeInput(value) {
  const date = toDate(value);
  if (date) {
    return `${toDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return typeof value === 'string' ? value : '';
}

export function fromDateTimeInput(value) {
  return toDate(value)?.toISOString() ?? value;
}

export function startOfDayUtc(day) {
  return new Date(`${day}T00:00:00`).toISOString();
}

export function endOfDayUtc(day) {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return '';
  }
  const parts = toDurationParts(milliseconds);
  if (typeof Intl.DurationFormat !== 'function') {
    return spellDurationParts(parts);
  }
  return getIntlFormatter(
    Intl.DurationFormat,
    parts.milliseconds === undefined
      ? DURATION_STYLE
      : SUB_SECOND_DURATION_STYLE,
  ).format(parts);
}

export function toIsoDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return '';
  }
  const parts = toDurationParts(milliseconds);
  if (parts.milliseconds !== undefined) {
    return `PT${parts.milliseconds / MS_PER_SECOND}S`;
  }
  const days = parts.days ? `${parts.days}D` : '';
  const time = ISO_TIME_UNITS.filter(([unit]) => parts[unit])
    .map(([unit, designator]) => `${parts[unit]}${designator}`)
    .join('');
  return `P${days}${time && `T${time}`}`;
}

function toDurationParts(milliseconds) {
  const span = Math.round(Math.max(milliseconds, 0));
  if (span < MS_PER_SECOND) {
    return {milliseconds: span};
  }
  const seconds = Math.round(span / MS_PER_SECOND);
  return omitBy(
    {
      days: Math.floor(seconds / SECONDS_PER_DAY),
      hours: Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR),
      minutes: Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
      seconds: seconds % SECONDS_PER_MINUTE,
    },
    value => value === 0,
  );
}

function spellDurationParts(parts) {
  return getIntlFormatter(Intl.ListFormat, DURATION_LIST_STYLE).format(
    DURATION_UNITS.filter(([part]) => parts[part] !== undefined).map(
      ([part, unit]) =>
        getIntlFormatter(Intl.NumberFormat, {
          ...DURATION_UNIT_STYLE,
          unit,
        }).format(parts[part]),
    ),
  );
}
