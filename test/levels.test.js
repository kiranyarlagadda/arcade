import { describe, expect, it } from 'vitest';
import { LEVELS, pickMove } from '../src/engine/levels.js';
import { MATE } from '../src/engine/search.js';

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

/** A rootScores-shaped list, already sorted best first like search() returns it. */
function scores(...values) {
  return values.map((score, i) => ({ move: { i }, moveKey: String(i), score }));
}

describe('LEVELS', () => {
  it('defines exactly the four documented difficulties', () => {
    expect(Object.keys(LEVELS).sort()).toEqual(['1', '2', '3', '4']);
    expect(LEVELS[1]).toEqual({ timeMs: 50, pick: 'top3', quiescence: false });
    expect(LEVELS[2]).toEqual({ timeMs: 200, pick: 'best70', quiescence: false });
    expect(LEVELS[3]).toEqual({ timeMs: 800, pick: 'best', quiescence: false });
    expect(LEVELS[4]).toEqual({ timeMs: 2500, pick: 'best', quiescence: true });
  });
});

describe('pickMove: best', () => {
  it('always takes the top move, whatever the rng says', () => {
    const rootScores = scores(50, 10, -20);
    const rng = () => 0.999; // would pick last if it mattered
    expect(pickMove(rootScores, LEVELS[3], rng)).toBe(rootScores[0]);
  });
});

describe('pickMove: best70', () => {
  it('takes the best move when the roll is under 0.7', () => {
    const rootScores = scores(50, 10);
    expect(pickMove(rootScores, LEVELS[2], () => 0)).toBe(rootScores[0]);
    expect(pickMove(rootScores, LEVELS[2], () => 0.69)).toBe(rootScores[0]);
  });

  it('takes the second best move when the roll is 0.7 or over', () => {
    const rootScores = scores(50, 10);
    expect(pickMove(rootScores, LEVELS[2], () => 0.7)).toBe(rootScores[1]);
    expect(pickMove(rootScores, LEVELS[2], () => 0.999)).toBe(rootScores[1]);
  });

  it('falls back to the only move without touching rng when there is no second best', () => {
    const rootScores = scores(50);
    const rng = () => {
      throw new Error('rng should not be called with only one root move');
    };
    expect(pickMove(rootScores, LEVELS[2], rng)).toBe(rootScores[0]);
  });

  it('is deterministic given a seeded rng', () => {
    const rootScores = scores(50, 10);
    const a = pickMove(rootScores, LEVELS[2], makeRng(7));
    const b = pickMove(rootScores, LEVELS[2], makeRng(7));
    expect(a).toBe(b);
  });
});

describe('pickMove: top3', () => {
  it('picks uniformly among the top three by rng, in score order', () => {
    const rootScores = scores(50, 40, 30, 20, 10);
    expect(pickMove(rootScores, LEVELS[1], () => 0)).toBe(rootScores[0]);
    expect(pickMove(rootScores, LEVELS[1], () => 0.34)).toBe(rootScores[1]);
    expect(pickMove(rootScores, LEVELS[1], () => 0.67)).toBe(rootScores[2]);
    expect(pickMove(rootScores, LEVELS[1], () => 0.999)).toBe(rootScores[2]);
  });

  it('uses every available move as the pool when fewer than three exist', () => {
    const rootScores = scores(50, 10);
    expect(pickMove(rootScores, LEVELS[1], () => 0)).toBe(rootScores[0]);
    expect(pickMove(rootScores, LEVELS[1], () => 0.99)).toBe(rootScores[1]);
  });

  it('never picks a forced loss when a non-losing move exists', () => {
    // A move that walks into a mate scores deep in the negative, close to -MATE.
    // Sorted best first, like search() returns it, so the forced loss sits last.
    const forcedLoss = -(MATE - 5);
    const rootScores = scores(-30, -40, -50, forcedLoss);
    // Try the whole span of rng outputs a real PRNG could produce; the losing
    // move (index 0, the top score here) must never come back.
    for (let i = 0; i < 20; i++) {
      const rng = makeRng(i);
      const picked = pickMove(rootScores, LEVELS[1], rng);
      expect(picked.score).not.toBe(forcedLoss);
    }
  });

  it('falls back to the losing pool when every move is a forced loss', () => {
    // Sorted best first: mate in 9 beats mate in 7 beats mate in 5.
    const rootScores = scores(-(MATE - 9), -(MATE - 7), -(MATE - 5));
    const picked = pickMove(rootScores, LEVELS[1], () => 0);
    expect(picked).toBe(rootScores[0]);
  });

  it('always takes a mate in one, regardless of rng', () => {
    const mateInOne = { move: { i: 'mate' }, moveKey: 'mate', score: MATE - 1 };
    const rootScores = [mateInOne, ...scores(20, 10, 5, 0)];
    for (let i = 0; i < 10; i++) {
      expect(pickMove(rootScores, LEVELS[1], makeRng(i))).toBe(mateInOne);
    }
  });
});

describe('pickMove: no legal moves', () => {
  it('returns a null move rather than throwing', () => {
    expect(pickMove([], LEVELS[3], Math.random)).toEqual({ move: null, moveKey: null, score: 0 });
  });
});
