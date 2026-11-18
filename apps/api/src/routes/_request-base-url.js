import {config} from '../config/index.js';

export function getRequestBaseUrl(request) {
  return `${request.protocol}://${request.host}${config.apiBasePath}`;
}
