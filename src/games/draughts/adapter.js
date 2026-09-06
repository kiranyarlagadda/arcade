// Wires draughts into the generic engine. rules.js owns every actual rule
// (mandatory capture, multi-jump, promotion, repetition); this file only
// translates between its Position/Move shapes and the Game interface
// search.js expects. Nothing draughts-specific lives in the engine, and
// nothing engine-specific leaks back into rules.js: this adapter is the only
// place that knows both. Same shape as src/games/chess/adapter.js on purpose,
// down to the assumptions:
//   - hash(pos) is an O(1) read of an incrementally maintained value, since
//     the search calls it on every node.
//   - status(pos).result, when `over` is true and not a draw, names the
//     winning side ('white' | 'black'), not pos.turn's 'w' / 'b'.
//   - a "capture" here is unambiguous: move.captures is only ever non-empty
//     when the move actually took something, no equivalent of chess's en
//     passant edge case to think about.

import { START_FEN, createPosition, generateMoves, makeMove, unmakeMove, status, moveToStr, hash as positionHash } from './rules.js';
import { evaluate as evaluateBoard } from './evaluate.js';

/**
 * Build a fresh position to search from. Defaults to the starting position
 * so callers do not all have to import START_FEN themselves.
 * @param {string} [fen]
 */
export function createState(fen = START_FEN) {
  return createPosition(fen);
}

/** The Game interface from src/engine/search.js, implemented for draughts. */
export const game = {
  moves(state) {
    return generateMoves(state);
  },

  make(state, move) {
    return makeMove(state, move);
  },

  unmake(state, undo) {
    unmakeMove(state, undo);
  },

  evaluate(state) {
    const whiteScore = evaluateBoard(state);
    return state.turn === 'w' ? whiteScore : -whiteScore;
  },

  terminal(state) {
    const s = status(state);
    if (!s.over) return null;
    if (s.result === 'draw') return { result: 'draw' };

    const sideToMove = state.turn === 'w' ? 'white' : 'black';
    return { result: s.result === sideToMove ? 'win' : 'loss' };
  },

  hash(state) {
    return positionHash(state);
  },

  isCapture(move) {
    return move.captures.length > 0;
  },

  moveKey(move) {
    return moveToStr(move);
  },
};
