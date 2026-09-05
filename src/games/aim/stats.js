// Pure functions over a finished run. Kept separate from the game module so
// they are trivial to test without touching a canvas.

/**
 * @typedef {object} RunStats
 * @property {number} hits
 * @property {number} misses
 * @property {number} accuracy - 0..1
 * @property {number} targetsPerSecond
 * @property {number | null} meanInterval - ms between consecutive hits, null if fewer than two hits
 */

/**
 * Summarize a finished run.
 * @param {{ hits: number, misses: number, hitTimes: number[], duration: number }} run
 *   `hitTimes` are timestamps (ms), one per hit, in the order they landed.
 *   `duration` is the run length in seconds.
 * @returns {RunStats}
 */
export function summarize({ hits, misses, hitTimes, duration }) {
  const attempts = hits + misses;
  const accuracy = attempts > 0 ? hits / attempts : 0;
  const targetsPerSecond = duration > 0 ? hits / duration : 0;

  let meanInterval = null;
  if (hitTimes && hitTimes.length >= 2) {
    let total = 0;
    for (let i = 1; i < hitTimes.length; i++) total += hitTimes[i] - hitTimes[i - 1];
    meanInterval = total / (hitTimes.length - 1);
  }

  return { hits, misses, accuracy, targetsPerSecond, meanInterval };
}
