import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// The audit: mount and unmount the element a lot of times and make sure
// nothing pinned by a previous instance is still hanging around. Every
// listener, timer, animation frame, and observer this code touches gets
// counted here; a leak shows up as a nonzero balance at the end.
describe('aim dispose audit', () => {
  let counts;
  let originalAddEventListener;
  let originalRemoveEventListener;
  let originalSetTimeout;
  let originalClearTimeout;
  let originalRAF;
  let originalCAF;
  let OriginalResizeObserver;
  let OriginalIntersectionObserver;

  beforeEach(() => {
    counts = { listeners: 0, timeouts: 0, raf: 0, resizeObservers: 0, intersectionObservers: 0 };

    originalAddEventListener = EventTarget.prototype.addEventListener;
    originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...args) {
      counts.listeners++;
      return originalAddEventListener.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
      counts.listeners--;
      return originalRemoveEventListener.apply(this, args);
    };

    originalSetTimeout = globalThis.setTimeout;
    originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = function (...args) {
      counts.timeouts++;
      return originalSetTimeout.apply(this, args);
    };
    globalThis.clearTimeout = function (...args) {
      counts.timeouts--;
      return originalClearTimeout.apply(this, args);
    };

    originalRAF = globalThis.requestAnimationFrame;
    originalCAF = globalThis.cancelAnimationFrame;
    let nextId = 1;
    const pending = new Map();
    globalThis.requestAnimationFrame = function (cb) {
      const id = nextId++;
      counts.raf++;
      const timer = originalSetTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        counts.raf--;
        cb(originalNow());
      }, 0);
      pending.set(id, timer);
      return id;
    };
    globalThis.cancelAnimationFrame = function (id) {
      if (!pending.has(id)) return;
      originalClearTimeout(pending.get(id));
      pending.delete(id);
      counts.raf--;
    };
    function originalNow() {
      return typeof performance !== 'undefined' ? performance.now() : Date.now();
    }

    OriginalResizeObserver = globalThis.ResizeObserver;
    OriginalIntersectionObserver = globalThis.IntersectionObserver;
    globalThis.ResizeObserver = class {
      observe() {
        counts.resizeObservers++;
      }
      unobserve() {}
      disconnect() {
        counts.resizeObservers--;
      }
    };
    globalThis.IntersectionObserver = class {
      observe() {
        counts.intersectionObservers++;
      }
      unobserve() {}
      disconnect() {
        counts.intersectionObservers--;
      }
    };
  });

  afterEach(() => {
    EventTarget.prototype.addEventListener = originalAddEventListener;
    EventTarget.prototype.removeEventListener = originalRemoveEventListener;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.cancelAnimationFrame = originalCAF;
    globalThis.ResizeObserver = OriginalResizeObserver;
    globalThis.IntersectionObserver = OriginalIntersectionObserver;
  });

  it('leaves no outstanding listeners, timers, frames, or observers after 50 mount/unmount cycles', async () => {
    await import('../src/arcade-game.js');

    for (let i = 0; i < 50; i++) {
      const el = document.createElement('arcade-game');
      el.setAttribute('name', 'aim');
      const ready = new Promise((resolve) => el.addEventListener('game-ready', resolve, { once: true }));
      document.body.appendChild(el);
      await ready;
      el.remove();
    }

    expect(counts.timeouts).toBe(0);
    expect(counts.raf).toBe(0);
    expect(counts.resizeObservers).toBe(0);
    expect(counts.intersectionObservers).toBe(0);
    expect(counts.listeners).toBe(0);
    expect(document.querySelectorAll('canvas').length).toBe(0);
  });
});
