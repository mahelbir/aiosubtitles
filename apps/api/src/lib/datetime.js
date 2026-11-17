import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import {config} from '../config/index.js';

dayjs.extend(utc);
dayjs.extend(timezone);

if (config.locale !== 'en') {
  try {
    await import(`dayjs/locale/${config.locale}.js`);
  } catch {
    console.warn(
      `dayjs locale "${config.locale}" not found, falling back to en`,
    );
  }
}
dayjs.locale(config.locale.toString());
dayjs.tz.setDefault(config.timezone);

/**
 * @type {typeof dayjs}
 */
const dt = (...args) => dayjs.tz(...args);

Object.assign(dt, dayjs);
dt.unix = seconds => dayjs.unix(seconds).tz();

export {dt};
