import {
  getSubtitleSourceClient,
  listAvailableSubtitleSourceClients,
  listSubtitleSourceClients,
} from '../lib/subtitle-sources/subtitle-source-clients.js';

const SHIPPED_SUBTITLE_SOURCE_REGISTRY = {
  getSubtitleSourceClient,
  listSubtitleSourceClients,
  listAvailableSubtitleSourceClients,
};

export function getSubtitleSourceRegistry({subtitleSourceRegistry}) {
  return subtitleSourceRegistry ?? SHIPPED_SUBTITLE_SOURCE_REGISTRY;
}
