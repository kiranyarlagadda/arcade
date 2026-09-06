// Wires chess into the generic engine. rules.js owns every actual chess
// rule (legality, check, castling, the works); this file only translates
// between its Position/Move shapes and the Game interface search.js expects.
// Nothing chess-specific lives in the engine, and nothing engine-specific
// leaks back into rules.js: this adapter is the only place that knows both.
//
// Assumptions about the rules API, since this was written against the spec
// before rules.js existed:
//   - hash(pos) is cheap (an O(1) read of an incrementally maintained value,
//     not a full recompute), since the search calls it on every node.
//   - status(pos).result, when `over` is true and not a draw, names the
//     winning side ('white' | 'black'), matching moveToUci-style plain
//     lowercase color strings used elsewhere in the API (pos.turn is 'w'/'b'
//     but the winner here is spelled out, per the spec's own example).
//   - FLAG.CAPTURE is set on en passant captures too, since a chess "capture"
//     removing a defended pawn is exactly the kind of move quiescence search
//     needs to see. If that turns out false, en passant recaptures would be
//     missed by isCapture and this is the line to revisit.

import { START_FEN, createPosition, generateMoves, makeMove, unmakeMove, status, moveToUci, hash as positionHash, FLAG } from './rules.js';
import { evaluate as evaluateBoard } from './evaluate.js';

/**
 * Build a fresh position to search from. Defaults to the starting position
 * so callers do not all have to import START_FEN themselves.
 * @param {string} [fen]
 */
export function createState(fen = START_FEN) {
  return createPosition(fen);
}

/** The Game interface from src/engine/search.js, implemented for chess. */
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
    return (move.flags & FLAG.CAPTURE) !== 0;
  },

  moveKey(move) {
    return moveToUci(move);
  },
};
