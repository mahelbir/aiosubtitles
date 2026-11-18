import {describe, expect, it} from 'vitest';
import {VideoType} from '@repo/shared/constants/video-type.js';
import {createCatalogMetaReader} from '../../src/lib/video-catalog/catalog-meta.js';
import {CatalogService} from '../../src/lib/video-catalog/catalog-service.js';
import {createKitsuVideoResolver} from '../../src/lib/video-catalog/kitsu-mapping.js';
import {runLiveCase} from './helpers/live-report.js';

const IMDB_ID_PATTERN = /^tt\d+$/;

describe('video catalog live', () => {
  it('maps kitsu:7442:5 to an IMDb episode', async testContext => {
    await runLiveCase(
      {
        serviceName: CatalogService.label(CatalogService.KITSU),
        liveNote: 'Kitsu episode mapping.',
      },
      testContext,
      async () => {
        const kitsuVideo = await createKitsuVideoResolver()({
          kitsuId: '7442',
          kitsuEpisode: 5,
        });
        expect(kitsuVideo?.imdbId).toMatch(IMDB_ID_PATTERN);
        expect(Number.isInteger(kitsuVideo.catalogSeason)).toBe(true);
        expect(Number.isInteger(kitsuVideo.catalogEpisode)).toBe(true);
      },
    );
  });

  it('reads the Cinemeta meta of tt0944947', async testContext => {
    await runLiveCase(
      {
        serviceName: CatalogService.label(CatalogService.CINEMETA),
        liveNote: 'Cinemeta series meta.',
      },
      testContext,
      async () => {
        const catalogMeta = await createCatalogMetaReader()({
          videoType: VideoType.SERIES,
          imdbId: 'tt0944947',
        });
        expect(catalogMeta).not.toBeNull();
        expect(catalogMeta.tvdbId).toMatch(/^\d+$/);
      },
    );
  });
});
