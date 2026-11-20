const ADDON_PATH = '/addon';

export const ADDON_ROUTE_PREFIX = `${ADDON_PATH}/:userConfigId`;

export function getAddonUrl({baseUrl, userConfigId}) {
  return `${baseUrl}${ADDON_PATH}/${userConfigId}`;
}
