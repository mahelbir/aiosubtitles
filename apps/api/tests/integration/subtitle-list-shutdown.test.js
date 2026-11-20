import {setTimeout as delay} from 'node:timers/promises';
import {describe, expect, it} from 'vitest';
import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {config} from '../../src/config/index.js';
import {createSubtitleSourceRegistry} from '../../src/lib/subtitle-sources/subtitle-source-clients.js';
import {
  closeTestApp,
  getTestApp,
  getTestAppBasePath,
  setTestAppOptions,
} from '../helpers/app.js';
import {createUserConfig} from '../helpers/factories.js';
import {createFixtureSubtitleSourceClient} from '../helpers/fixture-subtitle-source.js';
import {makeSubtitleSourceHit} from '../helpers/subtitle-source-factories.js';
import {makeSwitchStatesOnly} from '../helpers/user-config-factories.js';

const searchProgress = {isFinished: false};

const lateClient = createFixtureSubtitleSourceClient({
  subtitleSource: SubtitleSource.THESUBTITLEDB,
  searchSubtitles: async () => {
    await delay(config.subtitleSearchDeadline + 500);
    searchProgress.isFinished = true;
    return [makeSubtitleSourceHit()];
  },
});

setTestAppOptions({
  subtitleSourceRegistry: createSubtitleSourceRegistry([lateClient]),
  videoCatalog: {
    readCatalogMeta: async () => null,
    resolveKitsuVideo: async () => null,
  },
});

describe('closing the app with a subtitle search in flight', () => {
  it('waits for a search still running past the deadline', async () => {
    const {userConfig} = await createUserConfig({
      subtitleSourceSwitchStates: makeSwitchStatesOnly([
        SubtitleSource.THESUBTITLEDB,
      ]),
    });
    const app = await getTestApp();

    const response = await app.inject({
      method: 'GET',
      url: `${getTestAppBasePath()}/addon/${userConfig.id}/subtitles/movie/tt0133093.json`,
    });
    const isFinishedBeforeClose = searchProgress.isFinished;
    await closeTestApp();

    expect(response.json()).toEqual({subtitles: []});
    expect(isFinishedBeforeClose).toBe(false);
    expect(searchProgress.isFinished).toBe(true);
  });
});
