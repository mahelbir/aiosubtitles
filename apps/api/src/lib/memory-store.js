const DEFAULT_MAX_SIZE = 1000;

export class MemoryStore {
  _entries = new Map();
  _ttl;
  _maxSize;

  constructor({ttl, maxSize = DEFAULT_MAX_SIZE}) {
    this._ttl = ttl;
    this._maxSize = maxSize;
  }

  get size() {
    this._prune();
    return this._entries.size;
  }

  get(key) {
    return this._live(key)?.value;
  }

  has(key) {
    return this._live(key) !== undefined;
  }

  set(key, value) {
    const ttl = this._ttl();
    if (ttl <= 0) {
      return;
    }
    this._entries.delete(key);
    this._entries.set(key, {value, expiresAt: Date.now() + ttl * 1000});
    if (this._entries.size > this._maxSize) {
      this._evict();
    }
  }

  delete(key) {
    this._entries.delete(key);
  }

  clear() {
    this._entries.clear();
  }

  _live(key) {
    const entry = this._entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this._entries.delete(key);
      return undefined;
    }
    return entry;
  }

  _prune() {
    const now = Date.now();
    for (const [key, entry] of this._entries) {
      if (entry.expiresAt <= now) {
        this._entries.delete(key);
      }
    }
  }

  _evict() {
    this._prune();
    while (this._entries.size > this._maxSize) {
      this._entries.delete(this._entries.keys().next().value);
    }
  }
}
