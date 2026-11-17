import {User} from '../db/models/user.js';
import {config} from '../config/index.js';
import {dbUtils} from '../db/utils.js';
import {RedisCache} from '../redis/cache.js';

export const userCache = new RedisCache({
  prefix: 'user:',
  ttl: () => config.userCacheTtl,
  load: async userId => {
    // Names no columns on purpose: this is the shared user record; manually drop the sensitive ones.
    const user = await User.withScope('withRoles').findByPk(userId);
    return dbUtils.getPlain(user);
  },
});
