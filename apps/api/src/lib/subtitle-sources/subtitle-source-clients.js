import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {altyazidbClient} from './altyazidb/altyazidb-client.js';
import {anisubClient} from './anisub/anisub-client.js';
import {betaseriesClient} from './betaseries/betaseries-client.js';
import {gestdownClient} from './gestdown/gestdown-client.js';
import {opensubtitlesClient} from './opensubtitles/opensubtitles-client.js';
import {opensubtitlesV3Client} from './opensubtitles-v3/opensubtitles-v3-client.js';
import {subdlClient} from './subdl/subdl-client.js';
import {subsourceClient} from './subsource/subsource-client.js';
import {thesubtitledbClient} from './thesubtitledb/thesubtitledb-client.js';
import {tvsubtitlesClient} from './tvsubtitles/tvsubtitles-client.js';
import {wyzieClient} from './wyzie/wyzie-client.js';
import {yifyClient} from './yify/yify-client.js';

export function createSubtitleSourceRegistry(clients) {
  const sortedClients = clients.toSorted((leftClient, rightClient) =>
    SubtitleSource.label(leftClient.subtitleSource).localeCompare(
      SubtitleSource.label(rightClient.subtitleSource),
    ),
  );
  const clientBySubtitleSource = new Map(
    sortedClients.map(client => [client.subtitleSource, client]),
  );
  if (clientBySubtitleSource.size !== sortedClients.length) {
    throw new Error('Each subtitle source takes one client.');
  }
  return {
    getSubtitleSourceClient: subtitleSource =>
      clientBySubtitleSource.get(subtitleSource) ?? null,
    listSubtitleSourceClients: () => [...sortedClients],
  };
}

export const {getSubtitleSourceClient, listSubtitleSourceClients} =
  createSubtitleSourceRegistry([
    altyazidbClient,
    anisubClient,
    betaseriesClient,
    gestdownClient,
    opensubtitlesClient,
    opensubtitlesV3Client,
    subdlClient,
    subsourceClient,
    thesubtitledbClient,
    tvsubtitlesClient,
    wyzieClient,
    yifyClient,
  ]);
