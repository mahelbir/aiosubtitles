import {describe, expect, it} from 'vitest';
import {CredentialKind} from '../src/constants/credential.js';
import {SubtitleSource} from '../src/constants/subtitle-source.js';
import {
  LIST_IMPROVEMENT_SUBTITLE_SOURCES,
  hasListImprovementSwitch,
  isListImprovementCredential,
  isListImprovementOn,
} from '../src/lib/list-improvement-switch.js';

const LIST_IMPROVEMENT_DEFAULTS = [
  [SubtitleSource.OPENSUBTITLES, false],
  [SubtitleSource.ALTYAZIDB, true],
  [SubtitleSource.THESUBTITLEDB, true],
  [SubtitleSource.SUBSOURCE, true],
  [SubtitleSource.SUBDL, false],
  [SubtitleSource.WYZIE, true],
  [SubtitleSource.STREMIO_COMMUNITY_SUBTITLES, true],
];

const SWITCHLESS_SUBTITLE_SOURCES = [
  SubtitleSource.ANISUB,
  SubtitleSource.JIMAKU,
  SubtitleSource.BETASERIES,
  SubtitleSource.OPENSUBTITLES_V3,
  SubtitleSource.GESTDOWN,
  SubtitleSource.ANIMETOSHO,
  SubtitleSource.YIFY,
  SubtitleSource.TVSUBTITLES,
];

describe('the list improvement switch', () => {
  it('belongs to the seven keyed sources, in source order', () => {
    expect(LIST_IMPROVEMENT_SUBTITLE_SOURCES).toEqual(
      SubtitleSource.values.filter(subtitleSource =>
        LIST_IMPROVEMENT_DEFAULTS.some(
          ([defaultedSubtitleSource]) =>
            defaultedSubtitleSource === subtitleSource,
        ),
      ),
    );
  });

  it.each(LIST_IMPROVEMENT_DEFAULTS)(
    'gives %s its default while nothing is stored',
    (subtitleSource, isOnByDefault) => {
      expect(hasListImprovementSwitch(subtitleSource)).toBe(true);
      expect(
        isListImprovementOn({
          listImprovementSwitchStates: {},
          subtitleSource,
        }),
      ).toBe(isOnByDefault);
    },
  );

  it.each(SWITCHLESS_SUBTITLE_SOURCES)(
    'gives %s no switch, and reads it off even when a state is stored',
    subtitleSource => {
      expect(hasListImprovementSwitch(subtitleSource)).toBe(false);
      expect(
        isListImprovementOn({
          listImprovementSwitchStates: {[subtitleSource]: true},
          subtitleSource,
        }),
      ).toBe(false);
    },
  );

  it('reads a stored state over the default, in both directions', () => {
    const listImprovementSwitchStates = {
      [SubtitleSource.OPENSUBTITLES]: true,
      [SubtitleSource.WYZIE]: false,
    };

    expect(
      isListImprovementOn({
        listImprovementSwitchStates,
        subtitleSource: SubtitleSource.OPENSUBTITLES,
      }),
    ).toBe(true);
    expect(
      isListImprovementOn({
        listImprovementSwitchStates,
        subtitleSource: SubtitleSource.WYZIE,
      }),
    ).toBe(false);
  });

  it('reads the defaults from a configuration that stores no states at all', () => {
    expect(
      isListImprovementOn({subtitleSource: SubtitleSource.SUBSOURCE}),
    ).toBe(true);
    expect(isListImprovementOn({subtitleSource: SubtitleSource.SUBDL})).toBe(
      false,
    );
  });

  it('counts only an OpenSubtitles account toward the switch, never its API key', () => {
    expect(
      isListImprovementCredential({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        credentialKind: CredentialKind.ACCOUNT,
      }),
    ).toBe(true);
    expect(
      isListImprovementCredential({
        subtitleSource: SubtitleSource.OPENSUBTITLES,
        credentialKind: CredentialKind.API_KEY,
      }),
    ).toBe(false);
  });

  it('counts every credential kind of another source with the switch', () => {
    expect(
      isListImprovementCredential({
        subtitleSource: SubtitleSource.WYZIE,
        credentialKind: CredentialKind.API_KEY,
      }),
    ).toBe(true);
    expect(
      isListImprovementCredential({
        subtitleSource: SubtitleSource.STREMIO_COMMUNITY_SUBTITLES,
        credentialKind: CredentialKind.ACCESS_TOKEN,
      }),
    ).toBe(true);
  });

  it('counts no credential of a source without the switch', () => {
    expect(
      isListImprovementCredential({
        subtitleSource: SubtitleSource.JIMAKU,
        credentialKind: CredentialKind.API_KEY,
      }),
    ).toBe(false);
  });

  it('refuses an unknown source', () => {
    expect(hasListImprovementSwitch('not-a-source')).toBe(false);
  });
});
