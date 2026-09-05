import { describe, expect, it } from 'vitest';
import { classic } from '../src/games/aim/modes/classic.js';
import { freeshot } from '../src/games/aim/modes/freeshot.js';

/** Deterministic PRNG (mulberry32) so a "random" test is actually reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('classic mode spawn', () => {
  const { cells } = classic.layout(600, 400);

  it('never respawns into the last cleared cell or an occupied one', () => {
    const rng = makeRng(1);
    let live = [];
    live.push(classic.spawn({ cells, live, radius: 20, rng, lastCleared: undefined }));
    live.push(classic.spawn({ cells, live, radius: 20, rng, lastCleared: undefined }));

    for (let i = 0; i < 500; i++) {
      const clearedIndex = i % live.length;
      const cleared = live[clearedIndex];
      const remaining = live.filter((_, idx) => idx !== clearedIndex);
      const occupiedCells = new Set(remaining.map((t) => t.cell));

      const spawned = classic.spawn({ cells, live: remaining, radius: 20, rng, lastCleared: cleared.cell });

      expect(spawned.cell).not.toBe(cleared.cell);
      expect(occupiedCells.has(spawned.cell)).toBe(false);
      expect(spawned.cell).toBeGreaterThanOrEqual(0);
      expect(spawned.cell).toBeLessThan(cells.length);

      live = [...remaining, spawned];
    }
  });

  it('places a target at the center of its assigned cell', () => {
    const rng = makeRng(2);
    const target = classic.spawn({ cells, live: [], radius: 15, rng, lastCleared: undefined });
    const cell = cells[target.cell];
    expect(target.x).toBeCloseTo(cell.x + cell.w / 2, 5);
    expect(target.y).toBeCloseTo(cell.y + cell.h / 2, 5);
    expect(target.r).toBe(15);
  });
});

describe('freeshot mode spawn', () => {
  it('keeps an edge margin and never overlaps live targets across 500 seeded draws', () => {
    const rng = makeRng(42);
    const { arena } = freeshot.layout(800, 500);
    const radius = 18;

    let live = [];
    for (let i = 0; i < 500; i++) {
      const target = freeshot.spawn({ arena, live, radius, rng });

      // Edge margin: the target's own circle must stay within the arena.
      expect(target.x - radius).toBeGreaterThanOrEqual(arena.x - 1e-6);
      expect(target.x + radius).toBeLessThanOrEqual(arena.x + arena.w + 1e-6);
      expect(target.y - radius).toBeGreaterThanOrEqual(arena.y - 1e-6);
      expect(target.y + radius).toBeLessThanOrEqual(arena.y + arena.h + 1e-6);

      // No overlap with whatever was already live when it spawned.
      for (const other of live) {
        const dist = Math.hypot(target.x - other.x, target.y - other.y);
        expect(dist).toBeGreaterThanOrEqual(radius + other.r - 1e-6);
      }

      live.push(target);
      // Keep the live set small and bounded, like an actual run would.
      if (live.length > 6) live.shift();
    }
  });
});
