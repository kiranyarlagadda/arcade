import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A minimal in-memory stand-in for localStorage, since happy-dom's is per-test anyway. */
function makeFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get size() {
      return store.size;
    },
  };
}

describe('aim options persistence', () => {
  let fakeStorage;

  beforeEach(() => {
    fakeStorage = makeFakeStorage();
    vi.stubGlobal('localStorage', fakeStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('round trips options through the fake storage', async () => {
    const { loadOptions, saveOptions } = await import('../src/games/aim/options.js');

    expect(loadOptions()).toEqual({});

    saveOptions({ mode: 'freeshot', duration: 60, sensitivity: 1.4 });
    expect(loadOptions()).toEqual({ mode: 'freeshot', duration: 60, sensitivity: 1.4 });

    saveOptions({ mode: 'classic' });
    expect(loadOptions()).toEqual({ mode: 'classic' });
  });

  it('round trips best scores keyed by mode and duration', async () => {
    const { loadBest, saveBest, bestKey } = await import('../src/games/aim/options.js');

    expect(loadBest()).toEqual({});
    expect(bestKey('classic', 30)).toBe('classic:30');

    const best = loadBest();
    best[bestKey('classic', 30)] = 24;
    saveBest(best);

    const reloaded = loadBest();
    expect(reloaded).toEqual({ 'classic:30': 24 });

    reloaded[bestKey('freeshot', 60)] = 41;
    saveBest(reloaded);
    expect(loadBest()).toEqual({ 'classic:30': 24, 'freeshot:60': 41 });
  });

  it('namespaces its keys under arcade:aim: and does not touch anything else', async () => {
    const { saveOptions } = await import('../src/games/aim/options.js');
    saveOptions({ mode: 'classic' });
    expect(fakeStorage.getItem('arcade:aim:options')).toBe(JSON.stringify({ mode: 'classic' }));
    expect(fakeStorage.size).toBe(1);
  });

  it('does not throw when storage access fails', async () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('storage disabled');
      },
    });
    const { loadOptions, saveOptions, loadBest } = await import('../src/games/aim/options.js');
    expect(() => saveOptions({ mode: 'classic' })).not.toThrow();
    expect(loadOptions()).toEqual({});
    expect(loadBest()).toEqual({});
  });
});
