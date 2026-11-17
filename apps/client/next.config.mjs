import {PHASE_DEVELOPMENT_SERVER} from 'next/constants.js';
import {getAppVersion, getWorkspacePath} from '@repo/tooling/workspace.js';
import {DEFAULT_LOCALE} from '@repo/shared/constants/app.js';
import {loadClientEnv} from './env.mjs';

loadClientEnv();

const workspacePath = getWorkspacePath();

const FRAME_DENIAL_HEADERS = [
  {key: 'Content-Security-Policy', value: "frame-ancestors 'none'"},
  {key: 'X-Frame-Options', value: 'DENY'},
];

export default function nextConfig(phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const isTest = process.env.NODE_ENV === 'test';

  return {
    distDir: isTest ? `.next-test/${process.env.PORT}` : '.next',
    output: 'standalone',
    outputFileTracingRoot: workspacePath,
    pageExtensions: isDev ? ['dev.js', 'js'] : ['js'],
    env: {
      LOCALE: process.env.LOCALE ?? DEFAULT_LOCALE,
      APP_VERSION: getAppVersion(),
    },
    reactCompiler: !isDev, // The feature has been disabled to save device's battery life
    experimental: {
      globalNotFound: true,
      optimizePackageImports: ['@reactuses/core', 'es-toolkit', 'melperjs'],
    },
    transpilePackages: ['@repo/shared'],
    allowedDevOrigins: ['127.0.0.1'],
    async headers() {
      return [{source: '/:path*', headers: FRAME_DENIAL_HEADERS}];
    },
  };
}
