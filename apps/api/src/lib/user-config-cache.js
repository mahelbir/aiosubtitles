import {UserConfig} from '../db/models/user-config.js';
import {config} from '../config/index.js';
import {RedisCache} from '../redis/cache.js';

export const userConfigCache = new RedisCache({
  prefix: 'user-config-cache:v1:',
  ttl: () => config.userConfigCacheTtl,
  load: async userConfigId => {
    const userConfig =
      await UserConfig.withScope('withCredentials').findByPk(userConfigId);
    return userConfig && toCachedUserConfig(userConfig);
  },
});

function toCachedUserConfig(userConfig) {
  return {
    userConfigId: userConfig.id,
    languageCodes: userConfig.languageCodes,
    subtitleLanguageLimit: userConfig.subtitleLanguageLimit,
    subtitleSourceSwitchStates: userConfig.subtitleSourceSwitchStates,
    listImprovementSwitchStates: userConfig.listImprovementSwitchStates,
    credentials: userConfig.credentials.map(credential => ({
      credentialId: credential.id,
      subtitleSource: credential.subtitleSource,
      credentialKind: credential.credentialKind,
      sealedSecret: credential.credentialSecret,
      credentialPosition: credential.credentialPosition,
      credentialStatus: credential.credentialStatus,
      credentialCheckedAt: toIsoString(credential.credentialCheckedAt),
      quotaRemainingCount: credential.quotaRemainingCount,
      quotaResetAt: toIsoString(credential.quotaResetAt),
    })),
  };
}

function toIsoString(date) {
  return date?.toISOString() ?? null;
}
