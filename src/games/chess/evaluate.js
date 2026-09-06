// Static evaluation for a chess position: material plus the classic
// "simplified evaluation function" piece-square tables from
// chessprogramming.org/Simplified_Evaluation_Function. No mobility term,
// no pawn structure, no king safety beyond the middlegame king table. It is
// deliberately plain: the search does the heavy lifting, this just needs to
// tell good positions from bad ones quickly and consistently.
//
// Reads only `board`, `turn`, and `kings` off the position (in fact only
// `board`), so it works against a bare Position-shaped object and does not
// need rules.js at all. That is on purpose: this file gets tested against a
// hand-rolled FEN parser before rules.js exists, and the real adapter just
// hands it a real Position afterward.
//
// Board is the frozen 0x88 layout: Int8Array(128), a1 = 0, h1 = 7, a8 = 112.
// White pieces are 1..6 (P,N,B,R,Q,K), black pieces are white + 8.

/** Centipawn value per piece type (1=P, 2=N, 3=B, 4=R, 5=Q, 6=K). Kings are never traded, so 0. */
export const MATERIAL = { 1: 100, 2: 320, 3: 330, 4: 500, 5: 900, 6: 0 };

/** Bit that marks a piece code as black; type = code & 7 either way. */
const BLACK = 8;

// Every table below is written the way chessprogramming.org prints it: row 0
// is rank 8, row 7 is rank 1, files a to h left to right. That is White's
// table as-is; Black uses the same table with the rank flipped, which is
// exactly the mirror a symmetric board needs.

export const PAWN_TABLE = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

export const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
];

export const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
];

export const ROOK_TABLE = [
    0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0,
];

export const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
];

/** Middlegame only, per the spec: castle and stay behind pawns. */
export const KING_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
];

/** Piece type (1..6) to its table, so evaluate() can index straight off `code & 7`. */
const TABLES = { 1: PAWN_TABLE, 2: KNIGHT_TABLE, 3: BISHOP_TABLE, 4: ROOK_TABLE, 5: QUEEN_TABLE, 6: KING_TABLE };

/**
 * Evaluate a position in centipawns from White's point of view. Positive
 * means White is better. Walks the 0x88 board once, skipping off-board
 * squares with the standard `index & 0x88` check.
 * @param {{ board: Int8Array | number[] }} pos
 * @returns {number}
 */
export function evaluate(pos) {
  const board = pos.board;
  let score = 0;

  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = board[sq];
    if (!code) continue;

    const isBlack = (code & BLACK) !== 0;
    const type = code & 7;
    const file = sq & 7;
    const rank = sq >> 4;
    // White reads the table top-to-bottom as printed (rank 8 first); Black
    // reads it with the rank flipped, which mirrors it across the board's
    // middle the way a symmetric position needs.
    const pstIndex = isBlack ? rank * 8 + file : (7 - rank) * 8 + file;
    const value = MATERIAL[type] + (TABLES[type]?.[pstIndex] ?? 0);

    score += isBlack ? -value : value;
  }

  return score;
}
