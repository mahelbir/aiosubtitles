import {SubtitleSource} from '@repo/shared/constants/subtitle-source.js';
import {opensubtitlesV3Client} from './opensubtitles-v3/opensubtitles-v3-client.js';
import {thesubtitledbClient} from './thesubtitledb/thesubtitledb-client.js';

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
  createSubtitleSourceRegistry([opensubtitlesV3Client, thesubtitledbClient]);
