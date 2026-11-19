import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '../src/constants/subtitle-source.js';
import {settingsDefinition} from '../src/schemas/setting.js';

const EMPTY_SHARED_CREDENTIALS = {
  [SubtitleSource.OPENSUBTITLES]: [],
  [SubtitleSource.THESUBTITLEDB]: [],
  [SubtitleSource.JIMAKU]: [],
  [SubtitleSource.BETASERIES]: [],
  [SubtitleSource.ANISUB]: [],
};

describe('settingsDefinition shared credentials', () => {
  it('reads an empty file as no shared credential for any source', () => {
    expect(settingsDefinition.schema.parse({}).sharedCredentials).toEqual(
      EMPTY_SHARED_CREDENTIALS,
    );
  });

  it('fills the sources a partial group leaves out', () => {
    expect(
      settingsDefinition.schema.parse({
        sharedCredentials: {[SubtitleSource.JIMAKU]: ['jimaku-shared-a']},
      }).sharedCredentials,
    ).toEqual({
      ...EMPTY_SHARED_CREDENTIALS,
      [SubtitleSource.JIMAKU]: ['jimaku-shared-a'],
    });
  });

  it('trims every value, then drops empty values and duplicates', () => {
    expect(
      settingsDefinition.schema.parse({
        sharedCredentials: {
          [SubtitleSource.BETASERIES]: [
            ' betaseries-shared-a ',
            '',
            '   ',
            'betaseries-shared-b',
            'betaseries-shared-a',
          ],
        },
      }).sharedCredentials[SubtitleSource.BETASERIES],
    ).toEqual(['betaseries-shared-a', 'betaseries-shared-b']);
  });

  it('parses its own output to the same value, so a stored round trip stays valid', () => {
    const parsedSettings = settingsDefinition.schema.parse({
      sharedCredentials: {[SubtitleSource.ANISUB]: [' anisub-shared ', '']},
    });

    expect(settingsDefinition.schema.parse(parsedSettings)).toEqual(
      parsedSettings,
    );
  });

  it('keeps the OpenSubtitles app keys as a plain list like every other source', () => {
    expect(
      settingsDefinition.schema.parse({
        sharedCredentials: {
          [SubtitleSource.OPENSUBTITLES]: [
            ' opensubtitles-shared-a ',
            'opensubtitles-shared-b',
          ],
        },
      }).sharedCredentials[SubtitleSource.OPENSUBTITLES],
    ).toEqual(['opensubtitles-shared-a', 'opensubtitles-shared-b']);
  });

  it('rejects a value that is not a string', () => {
    expect(
      settingsDefinition.schema.safeParse({
        sharedCredentials: {[SubtitleSource.JIMAKU]: [42]},
      }).success,
    ).toBe(false);
  });

  it('keeps the shared credentials a server field, out of every editable schema', () => {
    expect(settingsDefinition.editableSchema.shape).not.toHaveProperty(
      'sharedCredentials',
    );
    expect(
      settingsDefinition.updateSchema.safeParse({
        sharedCredentials: EMPTY_SHARED_CREDENTIALS,
      }).success,
    ).toBe(false);
  });
});
