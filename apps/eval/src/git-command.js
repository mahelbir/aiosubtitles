import {execFileSync} from 'node:child_process';
import {omit} from 'es-toolkit';

const INHERITED_GIT_ENV_NAMES = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];

export const runGit = (repositoryRoot, gitArgs) =>
  execFileSync('git', gitArgs, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: omit(process.env, INHERITED_GIT_ENV_NAMES),
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
