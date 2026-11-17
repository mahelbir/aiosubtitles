import {z} from 'zod';
import {config} from '../config/index.js';

const CONFIGURE_PAGE_PATH = '/configure';

export const CONFIGURE_PAGE_DEV_ORIGIN = config.isDev
  ? config.corsOrigins[0]
  : undefined;

const userConfigIdField = z.uuidv4();

export function getConfigurePageUrl({userConfigId, pageOrigin = ''} = {}) {
  const url = `${pageOrigin}${CONFIGURE_PAGE_PATH}`;
  if (!userConfigIdField.safeParse(userConfigId).success) {
    return url;
  }
  return `${url}?${new URLSearchParams({userConfigId})}`;
}
