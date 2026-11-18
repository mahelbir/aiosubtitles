import {deepFreeze} from 'melperjs';
import {MemoryStore} from '../lib/memory-store.js';
import {redis} from './index.js';

const TOMBSTONE = '';
const TOMBSTONE_TTL = 5;
const MISSING = JSON.stringify(null);
const MISSING_TTL = 30;
const MEMO_TTL = 1;
const GENERATION_NAMESPACE = 'cache-generation:';

redis.defineCommand('claimAtGeneration', {
  numberOfKeys: 2,
  lua: `
    if (tonumber(redis.call('GET', KEYS[2])) or 0) ~= tonumber(ARGV[1]) then
      return false
    end
    return redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3], 'NX')
  `,
});

redis.defineCommand('replaceAtGeneration', {
  numberOfKeys: 2,
  lua: `
    if (tonumber(redis.call('GET', KEYS[2])) or 0) ~= tonumber(ARGV[1]) then
      return false
    end
    if redis.call('GET', KEYS[1]) == ARGV[4] then
      return false
    end
    return redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  `,
});

export class RedisCache {
  _prefix;
  _generationKey;
  _ttl;
  _load;
  _memo;
  _epoch = 0;
  _inFlight = new Map();

  constructor({prefix, ttl, load, memo = false}) {
    this._prefix = prefix;
    this._generationKey = `${GENERATION_NAMESPACE}${prefix}`;
    this._ttl = ttl;
    this._load = load;
    this._memo = memo
      ? new MemoryStore({ttl: () => Math.min(this._ttl(), MEMO_TTL)})
      : null;
  }

  _key(id) {
    return id === undefined ? this._prefix : `${this._prefix}${id}`;
  }

  async get(id) {
    const key = this._key(id);
    const enabled = this._ttl() > 0;

    if (enabled) {
      const cached = await this._read(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    const pending = this._inFlight.get(key);
    if (pending) {
      return pending;
    }

    const promise = this._fill(key, id, enabled);
    this._inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this._inFlight.delete(key);
    }
  }

  async peek(id, defaultValue) {
    if (this._ttl() <= 0) {
      return defaultValue;
    }
    const cached = await this._read(this._key(id));
    return cached === undefined ? defaultValue : cached;
  }

  async _read(key) {
    const memoized = this._memo?.get(key);
    if (memoized !== undefined) {
      return memoized;
    }
    const epoch = this._epoch;
    const cached = await redis.get(key);
    if (cached === null || cached === TOMBSTONE) {
      return undefined;
    }
    return this._remember(key, deepFreeze(JSON.parse(cached)), epoch);
  }

  reload(id) {
    const key = this._key(id);
    this._memo?.delete(key);
    return this._fill(key, id, this._ttl() > 0, {isReplacing: true});
  }

  async _fill(key, id, enabled, {isReplacing = false} = {}) {
    const epoch = this._epoch;
    const generation = enabled
      ? Number(await redis.get(this._generationKey))
      : undefined;
    const data = await this._load(id);
    const isMissing = data === null || data === undefined;
    const value = isMissing ? null : deepFreeze(data);
    if (!enabled) {
      return value;
    }
    const storeArguments = [
      key,
      this._generationKey,
      generation,
      isMissing ? MISSING : JSON.stringify(data),
      isMissing ? Math.min(this._ttl(), MISSING_TTL) : this._ttl(),
    ];
    const stored = isReplacing
      ? await redis.replaceAtGeneration(...storeArguments, TOMBSTONE)
      : await redis.claimAtGeneration(...storeArguments);
    return stored ? this._remember(key, value, epoch) : value;
  }

  _remember(key, value, epoch) {
    if (epoch === this._epoch) {
      this._memo?.set(key, value);
    }
    return value;
  }

  _tombstone(client, key) {
    this._epoch += 1;
    this._memo?.delete(key);
    return client.set(key, TOMBSTONE, 'EX', TOMBSTONE_TTL);
  }

  invalidate(id) {
    return this._tombstone(redis, this._key(id));
  }

  invalidateMany(ids) {
    const pipeline = redis.pipeline();
    for (const id of ids) {
      this._tombstone(pipeline, this._key(id));
    }
    return pipeline.exec();
  }

  async invalidateAll() {
    this._memo?.clear();
    await redis.incr(this._generationKey);
    const stream = redis.scanStream({match: `${this._prefix}*`, count: 100});
    for await (const keys of stream) {
      if (keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          this._tombstone(pipeline, key);
        }
        await pipeline.exec();
      }
    }
  }
}
