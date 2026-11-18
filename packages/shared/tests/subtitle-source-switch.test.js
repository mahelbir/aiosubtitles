import {describe, expect, it} from 'vitest';
import {CredentialKind} from '../src/constants/credential.js';
import {
  applyGlobalSwitch,
  applySubtitleSourceSwitchLocks,
  isSubtitleSourceSwitchLocked,
  readGlobalSwitchState,
} from '../src/lib/subtitle-source-switch.js';

const SUBTITLE_SOURCES = ['altyazidb', 'yify'];

describe('isSubtitleSourceSwitchLocked', () => {
  it('leaves a source without credentials unlocked', () => {
    expect(isSubtitleSourceSwitchLocked({credentials: []})).toBe(false);
  });

  it('locks a source holding a credential', () => {
    expect(
      isSubtitleSourceSwitchLocked({
        credentials: [
          {
            subtitleSource: 'thesubtitledb',
            credentialKind: CredentialKind.API_KEY,
          },
        ],
      }),
    ).toBe(true);
  });
});

describe('readGlobalSwitchState', () => {
  it('reads on when every source is on', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: true},
        lockedSubtitleSources: [],
      }),
    ).toBe('on');
  });

  it('reads on when no state is stored, a missing key counting as on', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {},
        lockedSubtitleSources: [],
      }),
    ).toBe('on');
  });

  it('reads off when every source is off and nothing is locked', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: false, yify: false},
        lockedSubtitleSources: [],
      }),
    ).toBe('off');
  });

  it('reads mixed when a locked source keeps an otherwise-off list on', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: false},
        lockedSubtitleSources: ['altyazidb'],
      }),
    ).toBe('mixed');
  });

  it('reads mixed when some sources are on and some off', () => {
    expect(
      readGlobalSwitchState({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: false},
        lockedSubtitleSources: [],
      }),
    ).toBe('mixed');
  });
});

describe('applyGlobalSwitch', () => {
  it('turns every unlocked source off from on and keeps the locked one', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {},
        lockedSubtitleSources: ['altyazidb'],
      }),
    ).toEqual({altyazidb: true, yify: false});
  });

  it('turns every source on from off', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: false, yify: false},
        lockedSubtitleSources: [],
      }),
    ).toEqual({altyazidb: true, yify: true});
  });

  it('turns every source on from mixed', () => {
    expect(
      applyGlobalSwitch({
        subtitleSources: SUBTITLE_SOURCES,
        switchStates: {altyazidb: true, yify: false},
        lockedSubtitleSources: [],
      }),
    ).toEqual({altyazidb: true, yify: true});
  });
});

describe('applySubtitleSourceSwitchLocks', () => {
  it('turns on a switched-off source that holds a credential and keeps the rest', () => {
    expect(
      applySubtitleSourceSwitchLocks({
        switchStates: {thesubtitledb: false, yify: false, altyazidb: true},
        credentials: [
          {
            subtitleSource: 'thesubtitledb',
            credentialKind: CredentialKind.API_KEY,
          },
        ],
      }),
    ).toEqual({thesubtitledb: true, yify: false, altyazidb: true});
  });

  it('returns the same states when no credential locks a switched-off source', () => {
    const switchStates = {yify: false};

    expect(
      applySubtitleSourceSwitchLocks({switchStates, credentials: []}),
    ).toBe(switchStates);
  });
});
