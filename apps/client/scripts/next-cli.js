import {loadClientEnv} from '../env.mjs';

loadClientEnv();

await import('next/dist/bin/next');
