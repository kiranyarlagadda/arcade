import { describe, expect, it } from 'vitest';
import { evaluate, MATERIAL } from '../src/games/chess/evaluate.js';

// evaluate() only reads board, turn, and kings off a position, so a real
// Position from rules.js is not needed here, just something shaped like one.
// This parser is deliberately tiny: no legality checks, no move counters,
// just enough of a FEN reader to place pieces on the 0x88 board.

const PIECE = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
const BLACK = 8;

function parseFen(fen) {
  const [placement, turn] = fen.split(' ');
  const board = new Int8Array(128);
  const ranks = placement.split('/'); // ranks[0] is rank 8, ranks[7] is rank 1
  const kings = {};

  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const isBlack = ch === ch.toLowerCase();
      const type = PIECE[ch.toUpperCase()];
      const code = isBlack ? type + BLACK : type;
      const sq = rank * 16 + file;
      board[sq] = code;
      if (type === PIECE.K) kings[isBlack ? 'b' : 'w'] = sq;
      file++;
    }
  }

  return { board, turn, kings };
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('evaluate', () => {
  it('scores the start position at exactly 0', () => {
    expect(evaluate(parseFen(START_FEN))).toBe(0);
  });

  it('drops by about a queen (900cp) when the white queen is removed', () => {
    const start = parseFen(START_FEN);
    const withoutQueen = parseFen(START_FEN);
    withoutQueen.board[3] = 0; // d1, the white queen's home square

    const diff = evaluate(withoutQueen) - evaluate(start);
    expect(diff).toBeLessThan(-MATERIAL[5] + 200);
    expect(diff).toBeGreaterThan(-MATERIAL[5] - 200);
  });

  it('scores a knight on e5 higher than the same knight on a1 (piece-square table working)', () => {
    const knightOnA1 = parseFen('k7/8/8/8/8/8/8/N6K w - - 0 1');
    const knightOnE5 = parseFen('k7/8/8/8/4N3/8/8/7K w - - 0 1');
    expect(evaluate(knightOnE5)).toBeGreaterThan(evaluate(knightOnA1));
  });
});
