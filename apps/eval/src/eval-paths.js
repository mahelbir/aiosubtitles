import {join} from 'node:path';

export const EVAL_APP_ROOT = join(import.meta.dirname, '..');
export const METRICS_PATH = join(EVAL_APP_ROOT, 'metrics.md');
export const METRICS_LOCK_PATH = join(EVAL_APP_ROOT, 'metrics.lock');
export const EVAL_SOURCE_TREE_PATH = 'apps/eval/src';
export const SUBTITLE_CORE_SOURCE_TREE_PATH = 'packages/subtitle-core/src';
