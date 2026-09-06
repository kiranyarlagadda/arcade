import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A minimal in-memory stand-in for localStorage, same as aim's own tests use. */
function makeFakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

// A stand-in for the real engine worker. It never answers on its own (tests
// drive positions directly through game.load and clicks), it just remembers
// how many were built and how many were torn down, which is exactly what
// the dispose audit below needs to know.
class StubWorker {
  constructor() {
    StubWorker.createdCount++;
    this.onmessage = null;
    this.posted = [];
  }
  postMessage(msg) {
    this.posted.push(msg);
  }
  terminate() {
    StubWorker.terminatedCount++;
  }
}
StubWorker.createdCount = 0;
StubWorker.terminatedCount = 0;

/** Dispatch a full press-and-release on one board square, by its `data-square` name. */
function clickSquare(el, square) {
  const Evt = globalThis.PointerEvent ?? MouseEvent;
  const target = el.querySelector(`.chess-square[data-square="${square}"]`);
  target.dispatchEvent(new Evt('pointerdown', { bubbles: true, cancelable: true }));
  target.dispatchEvent(new Evt('pointerup', { bubbles: true, cancelable: true }));
}

async function mountChess() {
  const el = document.createElement('arcade-game');
  el.setAttribute('name', 'chess');
  const ready = new Promise((resolve) => el.addEventListener('game-ready', resolve, { once: true }));
  document.body.appendChild(el);
  await ready;
  return el;
}

describe('chess dispose audit', () => {
  let counts;
  let originalAddEventListener;
  let originalRemoveEventListener;
  let originalSetTimeout;
  let originalClearTimeout;
  let originalRAF;
  let originalCAF;
  let OriginalResizeObserver;
  let OriginalIntersectionObserver;
  let OriginalWorker;

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

    OriginalWorker = globalThis.Worker;
    globalThis.Worker = StubWorker;
    StubWorker.createdCount = 0;
    StubWorker.terminatedCount = 0;
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
    globalThis.Worker = OriginalWorker;
  });

  it('leaves no outstanding listeners, timers, frames, or observers after 20 mount/dispose cycles', async () => {
    await import('../src/arcade-game.js');

    let lastEl = null;
    for (let i = 0; i < 20; i++) {
      const el = document.createElement('arcade-game');
      el.setAttribute('name', 'chess');
      const ready = new Promise((resolve) => el.addEventListener('game-ready', resolve, { once: true }));
      document.body.appendChild(el);
      await ready;
      el.remove();
      lastEl = el;
    }

    expect(counts.timeouts).toBe(0);
    expect(counts.raf).toBe(0);
    expect(counts.resizeObservers).toBe(0);
    expect(counts.intersectionObservers).toBe(0);
    expect(counts.listeners).toBe(0);
    expect(StubWorker.createdCount).toBe(20);
    expect(StubWorker.terminatedCount).toBe(20);
    expect(lastEl.children.length).toBe(0);
    expect(document.querySelectorAll('.chess-wrap').length).toBe(0);
  });
});

describe('chess board', () => {
  let OriginalWorker;

  beforeEach(async () => {
    OriginalWorker = globalThis.Worker;
    globalThis.Worker = StubWorker;
    StubWorker.createdCount = 0;
    StubWorker.terminatedCount = 0;
    vi.stubGlobal('localStorage', makeFakeStorage());
    await import('../src/arcade-game.js');
  });

  afterEach(() => {
    globalThis.Worker = OriginalWorker;
    vi.unstubAllGlobals();
    document.querySelectorAll('arcade-game').forEach((el) => el.remove());
  });

  it('renders 64 squares and 32 pieces on mount', async () => {
    const el = await mountChess();
    expect(el.querySelectorAll('.chess-square').length).toBe(64);
    expect(el.querySelectorAll('use').length).toBe(32);
  });

  it('moves a pawn from e2 to e4 by clicking, and lists it in SAN', async () => {
    const el = await mountChess();

    clickSquare(el, 'e2');
    clickSquare(el, 'e4');

    expect(el.game.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    expect(el.querySelector('.chess-moves').textContent).toContain('e4');
  });

  it('offers all four pieces on a promoting move and completes it on choice', async () => {
    const el = await mountChess();
    el.game.load('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

    clickSquare(el, 'a7');
    clickSquare(el, 'a8');

    const buttons = el.querySelectorAll('.chess-promo-btn');
    expect(buttons.length).toBe(4);

    buttons[0].click(); // Q R B N order; the queen is first
    expect(el.game.fen.split(' ')[0]).toBe('Q3k3/8/8/8/8/8/8/4K3');
    expect(el.querySelectorAll('.chess-promo-btn').length).toBe(0); // the picker is gone once a choice lands
  });

  it('ends the game on checkmate, fires game-result, and records the win', async () => {
    const el = await mountChess();
    el.game.load('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1');

    let result = null;
    el.addEventListener('game-result', (e) => (result = e.detail), { once: true });

    clickSquare(el, 'e1');
    clickSquare(el, 'e8'); // Re1-e8#: the king on g8 is boxed in by its own f7/g7/h7 pawns

    expect(result).not.toBeNull();
    expect(result.name).toBe('chess');
    expect(result.stats.result).toBe('win');
    expect(result.stats.reason).toBe('checkmate');

    const record = JSON.parse(localStorage.getItem('arcade:chess:record'));
    expect(record['2'].win).toBe(1); // level defaults to 2
  });
});
