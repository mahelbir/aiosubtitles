import {UserConfig} from '../db/models/user-config.js';

const PASSWORD_HASH_ATTRIBUTES = ['id', 'passwordHash'];

export async function readPasswordHash(userConfigId) {
  const userConfig = await UserConfig.findByPk(userConfigId, {
    attributes: PASSWORD_HASH_ATTRIBUTES,
  });
  return userConfig?.passwordHash ?? null;
}

export async function readLockedPasswordHash(userConfigId, transaction) {
  const userConfig = await UserConfig.findOneLocked(
    {attributes: PASSWORD_HASH_ATTRIBUTES, where: {id: userConfigId}},
    transaction,
  );
  return userConfig?.passwordHash ?? null;
}
