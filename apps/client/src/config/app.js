import {env} from './env';

export const APP_NAME = 'AIOSubtitles';
export const TITLE_SUFFIX = ` | ${APP_NAME}`;

export const API_ORIGIN = env.API_URL && new URL(env.API_URL).origin;
