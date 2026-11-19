import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

export function getWorkspacePath(fallback) {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (fs.existsSync(path.join(current, WORKSPACE_MARKER))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error(`Workspace root not found (${WORKSPACE_MARKER})`);
    }
    current = parent;
  }
}
