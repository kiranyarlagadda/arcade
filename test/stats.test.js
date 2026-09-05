import { describe, expect, it } from 'vitest';
import { summarize } from '../src/games/aim/stats.js';

describe('summarize', () => {
  it('computes accuracy, targets per second, and mean interval from known inputs', () => {
    const result = summarize({
      hits: 8,
      misses: 2,
      hitTimes: [1000, 1200, 1500, 1900, 2400, 3000, 3700, 4500],
      duration: 30,
    });

    expect(result.hits).toBe(8);
    expect(result.misses).toBe(2);
    expect(result.accuracy).toBeCloseTo(0.8, 10);
    expect(result.targetsPerSecond).toBeCloseTo(8 / 30, 10);
    // Deltas: 200, 300, 400, 500, 600, 700, 800 -> mean 500
    expect(result.meanInterval).toBeCloseTo(500, 10);
  });

  it('reports zero accuracy and zero targets per second with no attempts', () => {
    const result = summarize({ hits: 0, misses: 0, hitTimes: [], duration: 30 });
    expect(result.accuracy).toBe(0);
    expect(result.targetsPerSecond).toBe(0);
    expect(result.meanInterval).toBeNull();
  });

  it('returns null mean interval with fewer than two hits', () => {
    const zero = summarize({ hits: 0, misses: 3, hitTimes: [], duration: 30 });
    expect(zero.meanInterval).toBeNull();

    const one = summarize({ hits: 1, misses: 0, hitTimes: [1000], duration: 30 });
    expect(one.meanInterval).toBeNull();
    expect(one.accuracy).toBe(1);
  });

  it('handles all misses', () => {
    const result = summarize({ hits: 0, misses: 5, hitTimes: [], duration: 30 });
    expect(result.accuracy).toBe(0);
    expect(result.hits).toBe(0);
    expect(result.misses).toBe(5);
  });
});
