import {env} from './env';

const apiUrl = new URL(env.API_URL);

export const APP_NAME = 'AIOSubtitles';
export const TITLE_SUFFIX = ` | ${APP_NAME}`;

export const API_ORIGIN = apiUrl.origin;
