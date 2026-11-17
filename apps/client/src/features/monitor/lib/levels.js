import {MonitorLevel} from '@repo/shared/constants/monitor.js';

export const LEVEL_TEXT_CLASS = Object.freeze({
  [MonitorLevel.DEBUG]: 'text-muted-foreground',
  [MonitorLevel.INFO]: 'text-foreground',
  [MonitorLevel.SECONDARY]: 'text-sky',
  [MonitorLevel.PRIMARY]: 'text-blue',
  [MonitorLevel.SUCCESS]: 'text-success',
  [MonitorLevel.WARN]: 'text-warning',
  [MonitorLevel.ERROR]: 'text-destructive',
});

export const DEFAULT_MIN_LEVEL = MonitorLevel.INFO;

export function levelIndex(level) {
  const index = MonitorLevel.values.indexOf(level);
  return index === -1 ? 0 : index;
}
