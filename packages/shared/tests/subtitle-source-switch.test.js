import {describe, expect, it} from 'vitest';
import {
  applyGlobalSwitch,
  readGlobalSwitchState,
} from '../src/lib/subtitle-source-switch.js';

const SUBTITLE_SOURCES = ['altyazidb', 'yify'];

describe('readGlobalSwitchState', () => {
  it('reads on when every source is on', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: true},
      }),
    ).toBe('on');
  });

  it('reads on when no state is stored, a missing key counting as on', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {},
      }),
    ).toBe('on');
  });

  it('reads off when every source is off', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: false, yify: false},
      }),
    ).toBe('off');
  });

  it('reads mixed when some sources are on and some off', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: false},
      }),
    ).toBe('mixed');
  });
});

describe('applyGlobalSwitch', () => {
  it('turns every source off from on', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {},
      }),
    ).toEqual({altyazidb: false, yify: false});
  });

  it('turns every source on from off', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: false, yify: false},
      }),
    ).toEqual({altyazidb: true, yify: true});
  });

  it('turns every source on from mixed', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: false},
      }),
    ).toEqual({altyazidb: true, yify: true});
  });

  it('keeps the states of sources outside the list', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {thesubtitledb: false},
      }),
    ).toEqual({thesubtitledb: false, altyazidb: false, yify: false});
  });
});
