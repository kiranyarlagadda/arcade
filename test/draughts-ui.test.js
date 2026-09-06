import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPosition, generateMoves, parseSquare, toFen, PIECE, BLACK, START_FEN } from '../src/games/draughts/rules.js';

/** A minimal in-memory stand-in for localStorage, same as chess's own tests use. */
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
  const target = el.querySelector(`.draughts-square[data-square="${square}"]`);
  target.dispatchEvent(new Evt('pointerdown', { bubbles: true, cancelable: true }));
  target.dispatchEvent(new Evt('pointerup', { bubbles: true, cancelable: true }));
}

async function mountDraughts() {
  const el = document.createElement('arcade-game');
  el.setAttribute('name', 'draughts');
  const ready = new Promise((resolve) => el.addEventListener('game-ready', resolve, { once: true }));
  document.body.appendChild(el);
  await ready;
  return el;
}

/** Build a FEN by clearing a fresh start position down to `board`/`turn`
 * only, the two fields rules.js documents on a Position, then handing it
 * back through the real toFen. This never guesses at the FEN's grammar: it
 * only ever touches the fields the rules API promises exist. */
function customFen({ turn, white = [], black = [] }) {
  const pos = createPosition(START_FEN);
  pos.board.fill(0);
  for (const name of white) pos.board[parseSquare(name)] = PIECE.MAN;
  for (const name of black) pos.board[parseSquare(name)] = PIECE.MAN | BLACK;
  pos.turn = turn;
  return toFen(pos);
}

describe('draughts dispose audit', () => {
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
      el.setAttribute('name', 'draughts');
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
    expect(document.querySelectorAll('.draughts-wrap').length).toBe(0);
  });
});

describe('draughts board', () => {
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

  it('renders 32 dark squares and 24 discs on mount', async () => {
    const el = await mountDraughts();
    expect(el.querySelectorAll('.draughts-square-dark').length).toBe(32);
    expect(el.querySelectorAll('use').length).toBe(24);
  });

  it('moves a man from a3 to b4 by clicking, and lists it in the move list', async () => {
    const el = await mountDraughts();

    clickSquare(el, 'a3');
    clickSquare(el, 'b4');

    expect(el.querySelector('use[data-square="b4"]')).not.toBeNull();
    expect(el.querySelector('use[data-square="a3"]')).toBeNull();
    expect(el.querySelector('.draughts-status').textContent).toBe('Thinking'); // amber moved, blue to think
    expect(el.querySelector('.draughts-moves').textContent).toContain('a3-b4');
  });

  it('shows a dot per final square when two capture chains end differently, and plays the chosen one as a single move', async () => {
    // c3 can jump d4 to e5, and from e5 either jump f6 to g7 or jump d6 to
    // c7. Two different finals, so selecting c3 should show both right away
    // without any stepping.
    const fen = customFen({ turn: 'w', white: ['c3'], black: ['d4', 'f6', 'd6'] });

    const check = createPosition(fen);
    const fromC3 = generateMoves(check).filter((m) => m.from === parseSquare('c3'));
    expect(fromC3.map((m) => m.to).sort()).toEqual([parseSquare('c7'), parseSquare('g7')].sort());

    const el = await mountDraughts();
    el.game.load(fen);

    clickSquare(el, 'c3');
    const dots = [...el.querySelectorAll('.draughts-target')].map((d) => d.dataset.square).sort();
    expect(dots).toEqual(['c7', 'g7']);

    clickSquare(el, 'g7');
    // The disc is still mid-hop at this instant (120ms per hop, on real
    // timers), so the logical position is what I check here, not the
    // animated DOM: d6 was never in this chain and survives, d4 and f6 do not.
    expect(el.game.fen).toBe('B:Wg7:Bd6');
    expect(el.querySelector('.draughts-moves').textContent).toContain('c3xe5xg7');
  });

  it('steps through a capture chain when two sequences share the same final square', async () => {
    // c3 can jump b4 to a5 then b6 to c7, or jump d4 to e5 then d6 to c7.
    // Both finals are c7, so selecting c3 must show the NEXT squares (a5,
    // e5) instead of collapsing to one dot on c7.
    const fen = customFen({ turn: 'w', white: ['c3'], black: ['b4', 'd4', 'b6', 'd6'] });

    const check = createPosition(fen);
    const fromC3 = generateMoves(check).filter((m) => m.from === parseSquare('c3'));
    expect(fromC3.length).toBe(2);
    expect(fromC3.every((m) => m.to === parseSquare('c7'))).toBe(true);

    const el = await mountDraughts();
    el.game.load(fen);

    clickSquare(el, 'c3');
    const firstDots = [...el.querySelectorAll('.draughts-target')].map((d) => d.dataset.square).sort();
    expect(firstDots).toEqual(['a5', 'e5']); // stepping, not the shared final c7

    clickSquare(el, 'e5'); // picks the d4/d6 branch; it is the only one going through e5, so it plays whole
    // Same reasoning as the test above: check the logical position rather
    // than the still-animating DOM. b4 and b6 belong to the other, unplayed
    // branch and must survive untouched.
    expect(el.game.fen).toBe('B:Wc7:Bb4,b6');
    expect(el.querySelector('.draughts-moves').textContent).toContain('c3xe5xc7');
  });

  it('ends the game when the human captures the last piece, fires game-result, and records the win', async () => {
    const fen = customFen({ turn: 'w', white: ['c3'], black: ['d4'] });

    const el = await mountDraughts();
    el.game.load(fen);

    let result = null;
    el.addEventListener('game-result', (e) => (result = e.detail), { once: true });

    clickSquare(el, 'c3');
    clickSquare(el, 'e5'); // the only legal move: capture d4, landing on e5

    expect(result).not.toBeNull();
    expect(result.name).toBe('draughts');
    expect(result.stats.result).toBe('win');
    expect(result.stats.reason).toBe('nomoves');

    const record = JSON.parse(localStorage.getItem('arcade:draughts:record'));
    expect(record['2'].win).toBe(1); // level defaults to 2
  });
});
