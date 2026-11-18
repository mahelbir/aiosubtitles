import {getUuidField} from '@repo/shared/schemas/common.js';
import {userConfigCache} from '../../lib/user-config-cache.js';

const userConfigIdField = getUuidField();

export async function readCachedUserConfig(userConfigId) {
  const parsed = userConfigIdField.safeParse(userConfigId);
  return parsed.success ? userConfigCache.get(parsed.data) : null;
}
