// Difficulty is just a search budget plus a rule for how imperfectly to play
// once the search comes back. Weaker levels get less time and pick from
// further down the list of root moves; the top level searches longest, adds
// quiescence so it does not blunder into a bad capture, and always plays the
// best move it found.

import { search, MATE } from './search.js';

export const LEVELS = Object.freeze({
  1: Object.freeze({ timeMs: 50, pick: 'top3', quiescence: false }),
  2: Object.freeze({ timeMs: 200, pick: 'best70', quiescence: false }),
  3: Object.freeze({ timeMs: 800, pick: 'best', quiescence: false }),
  4: Object.freeze({ timeMs: 2500, pick: 'best', quiescence: true }),
});

// Mate scores are MATE minus the ply they land on. MATE (1,000,000) is so far
// above any plausible material evaluation that a healthy margin below it
// still only ever catches real forced mates, never a merely bad position.
const MATE_MARGIN = 1000;

function isMateInOne(score) {
  return score === MATE - 1;
}

function isForcedLoss(score) {
  return score <= -(MATE - MATE_MARGIN);
}

/**
 * Choose a move out of a completed search's root scores, per the level's
 * `pick` rule. `rootScores` must already be sorted best first (that is what
 * `search` returns). Returns the whole `{ move, moveKey, score }` entry, or
 * a null move if there were no root moves to choose from (the position was
 * already over).
 * @param {{move: *, moveKey: string, score: number}[]} rootScores
 * @param {{ pick: 'top3' | 'best70' | 'best' }} level
 * @param {() => number} rng
 */
export function pickMove(rootScores, level, rng) {
  if (!rootScores || rootScores.length === 0) return { move: null, moveKey: null, score: 0 };

  switch (level.pick) {
    case 'top3': {
      // Weakest level, so it gets guard rails: it would look broken if it
      // routinely walked into a mate it could have avoided, or passed up a
      // mate sitting right in front of it for the sake of variety.
      const mateInOne = rootScores.find((r) => isMateInOne(r.score));
      if (mateInOne) return mateInOne;

      const nonLosing = rootScores.filter((r) => !isForcedLoss(r.score));
      const pool = nonLosing.length > 0 ? nonLosing : rootScores;
      const top3 = pool.slice(0, 3);
      return top3[Math.floor(rng() * top3.length)];
    }
    case 'best70':
      return rootScores.length > 1 && rng() >= 0.7 ? rootScores[1] : rootScores[0];
    case 'best':
    default:
      return rootScores[0];
  }
}

/**
 * Run a search at the given level's budget and hand back the move it decided
 * on, picked from the last completed iteration's root scores per the level's
 * `pick` rule.
 * @param {object} game a Game implementation, see src/engine/search.js
 * @param {*} state the position to move from
 * @param {{ timeMs: number, pick: string, quiescence: boolean }} level one of LEVELS
 * @param {{ rng?: () => number, now?: () => number, tt?: Map<number, object> }} [opts]
 * @returns {object} the search result with `move` and `moveKey` replaced by the picked move
 */
export function think(game, state, level, { rng = Math.random, now, tt } = {}) {
  const result = search(game, state, {
    timeMs: level.timeMs,
    quiescence: level.quiescence,
    rng,
    now,
    tt,
  });
  const picked = pickMove(result.rootScores, level, rng);
  return { ...result, move: picked.move, moveKey: picked.moveKey };
}
