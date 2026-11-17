import * as path from 'node:path';
import dotenv from 'dotenv';
import {getWorkspacePath} from './workspace.js';

const DEFAULT_NODE_ENV = 'development';
const TEST_NODE_ENV = 'test';

export function loadWorkspaceEnv(fallback) {
  const workspacePath = getWorkspacePath(fallback);
  const nodeEnv = process.env.NODE_ENV || DEFAULT_NODE_ENV;
  const isTest = nodeEnv === TEST_NODE_ENV;
  const files = [`.env.${nodeEnv}`, '.env'].map(name =>
    path.join(workspacePath, name),
  );
  dotenv.config({
    path: isTest ? files : files.toReversed(),
    override: !isTest,
    quiet: true,
  });
  return workspacePath;
}
