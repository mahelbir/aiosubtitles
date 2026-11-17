import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryStore} from '../../src/lib/memory-store.js';

const SECOND = 1000;

describe('MemoryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns what was stored until the window closes', () => {
    const store = new MemoryStore({ttl: () => 2});
    store.set('k', 'v');
    expect(store.get('k')).toBe('v');
    vi.advanceTimersByTime(2 * SECOND - 1);
    expect(store.get('k')).toBe('v');
  });

  it('forgets an entry the moment its window elapses', () => {
    const store = new MemoryStore({ttl: () => 2});
    store.set('k', 'v');
    vi.advanceTimersByTime(2 * SECOND);
    expect(store.get('k')).toBeUndefined();
  });

  it('stores nothing at all when the ttl is zero, so a flag disables the tier', () => {
    const store = new MemoryStore({ttl: () => 0});
    store.set('k', 'v');
    expect(store.get('k')).toBeUndefined();
  });

  it('reads the ttl lazily, so a config change takes effect without a restart', () => {
    let ttl = 0;
    const store = new MemoryStore({ttl: () => ttl});
    store.set('k', 'v');
    expect(store.get('k')).toBeUndefined();
    ttl = 5;
    store.set('k', 'v');
    expect(store.get('k')).toBe('v');
  });

  it('distinguishes a stored undefined from a miss by never storing one', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('k', undefined);
    expect(store.get('k')).toBeUndefined();
  });

  it('answers has for a live key without handing back the value', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('k', 'v');
    expect(store.has('k')).toBe(true);
  });

  it('answers has for a key that was never written', () => {
    const store = new MemoryStore({ttl: () => 5});
    expect(store.has('k')).toBe(false);
  });

  it('answers has falsely once the window elapses', () => {
    const store = new MemoryStore({ttl: () => 2});
    store.set('k', 'v');
    vi.advanceTimersByTime(2 * SECOND);
    expect(store.has('k')).toBe(false);
  });

  it('answers has for a stored falsy value', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('k', '');
    expect(store.has('k')).toBe(true);
  });

  it('counts the entries it holds', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('a', 1);
    store.set('b', 2);
    expect(store.size).toBe(2);
  });

  it('counts only the entries still inside their window', () => {
    const store = new MemoryStore({ttl: () => 2});
    store.set('a', 1);
    vi.advanceTimersByTime(SECOND);
    store.set('b', 2);
    vi.advanceTimersByTime(SECOND);
    expect(store.size).toBe(1);
  });

  it('counts nothing once cleared', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('a', 1);
    store.clear();
    expect(store.size).toBe(0);
  });

  it('drops a key on demand', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('k', 'v');
    store.delete('k');
    expect(store.get('k')).toBeUndefined();
  });

  it('clears everything on demand', () => {
    const store = new MemoryStore({ttl: () => 5});
    store.set('a', 1);
    store.set('b', 2);
    store.clear();
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBeUndefined();
  });

  it('evicts the oldest entries once the ceiling is passed', () => {
    const store = new MemoryStore({ttl: () => 60, maxSize: 2});
    store.set('a', 1);
    store.set('b', 2);
    store.set('c', 3);
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBe(2);
    expect(store.get('c')).toBe(3);
  });

  it('refreshes recency on rewrite, so a hot key survives eviction', () => {
    const store = new MemoryStore({ttl: () => 60, maxSize: 2});
    store.set('a', 1);
    store.set('b', 2);
    store.set('a', 1);
    store.set('c', 3);
    expect(store.get('a')).toBe(1);
    expect(store.get('b')).toBeUndefined();
  });
});
