import {env} from './env';

export const API_ORIGIN = env.API_URL && new URL(env.API_URL).origin;
