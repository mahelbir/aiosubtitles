import {
  getSubtitleSourceClient,
  listSubtitleSourceClients,
} from '../lib/subtitle-sources/subtitle-source-clients.js';

const SHIPPED_SUBTITLE_SOURCE_REGISTRY = {
  getSubtitleSourceClient,
  listSubtitleSourceClients,
};

export function getSubtitleSourceRegistry({subtitleSourceRegistry}) {
  return subtitleSourceRegistry ?? SHIPPED_SUBTITLE_SOURCE_REGISTRY;
}
