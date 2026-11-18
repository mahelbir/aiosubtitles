import {PHASE_DEVELOPMENT_SERVER} from 'next/constants.js';
import {getAppVersion, getWorkspacePath} from '@repo/tooling/workspace.js';
import {DEFAULT_LOCALE} from '@repo/shared/constants/app.js';
import {loadClientEnv} from './env.mjs';

loadClientEnv();

const workspacePath = getWorkspacePath();

export default function nextConfig(phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const isTest = process.env.NODE_ENV === 'test';

  return {
    distDir: isTest ? `.next-test/${process.env.PORT}` : '.next',
    output: 'export',
    outputFileTracingRoot: workspacePath,
    pageExtensions: isDev ? ['dev.js', 'js'] : ['js'],
    env: {
      LOCALE: process.env.LOCALE ?? DEFAULT_LOCALE,
      APP_VERSION: getAppVersion(),
      NEXT_PUBLIC_API_URL: isDev ? process.env.NEXT_PUBLIC_API_URL : '',
    },
    reactCompiler: !isDev || isTest, // The feature has been disabled to save device's battery life
    experimental: {
      globalNotFound: true,
      optimizePackageImports: ['@reactuses/core', 'es-toolkit', 'melperjs'],
    },
    transpilePackages: ['@repo/shared'],
    allowedDevOrigins: ['127.0.0.1'],
  };
}
