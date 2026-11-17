import {describe, expect, it} from 'vitest';
import {MonitorLevel} from '../src/constants/monitor.js';

describe('MonitorLevel', () => {
  it('lists the levels from the least to the most severe', () => {
    expect(MonitorLevel.values).toEqual([
      MonitorLevel.DEBUG,
      MonitorLevel.INFO,
      MonitorLevel.SECONDARY,
      MonitorLevel.PRIMARY,
      MonitorLevel.SUCCESS,
      MonitorLevel.WARN,
      MonitorLevel.ERROR,
    ]);
  });
});
