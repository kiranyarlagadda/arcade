// Static evaluation for a draughts position: material, how far each man has
// advanced towards promotion, control of the centre, and men still standing
// on the back rank to guard against a king walking straight in. No mobility
// term: that would mean generating moves in here, and this file is
// deliberately dependency-free, the same way chess's evaluate.js is free of
// rules.js. The search does the heavy lifting; this just needs to tell good
// positions from bad ones quickly and consistently.
//
// Reads only `board` and `turn` off the position, so it works against a bare
// {board, turn} object and never needs rules.js.
//
// Board is the same 0x88 layout rules.js uses: Int8Array(128), a1 = 0,
// h1 = 7, a8 = 112. White man = 1, white king = 2, black is white + 8.

const BLACK = 8;
const MAN = 1;
const KING = 2;

/** Centi-men per piece type. A king is worth well more than any amount of a man's advancement. */
export const MATERIAL = { [MAN]: 100, [KING]: 280 };

const ADVANCE_BONUS = 5; // per rank a man has crossed towards the far side
const BACK_RANK_BONUS = 6; // a man still guarding its own home rank
const CENTRE_BONUS = 4; // sitting on one of the four centre dark squares
const RING_BONUS = 2; // sitting on a dark square diagonally outside them

// The four centre dark squares are c5, d4, e5, f4: the tightest diamond in
// the middle of the board. Every other dark square in the middle two ranks
// (c3, e3, d6, f6) sits one diagonal step outside that diamond, which is the
// "ring" the brief asks for. Both sets matter for the same reason a piece
// there does over the board: they are the squares with the most directions
// to move into next, and the ones a man crossing the middle cannot avoid.
function centreValue(file, rank) {
  if ((file === 3 && rank === 3) || (file === 4 && rank === 4) ||
      (file === 2 && rank === 4) || (file === 5 && rank === 3)) {
    return CENTRE_BONUS;
  }
  if ((file === 2 && rank === 2) || (file === 4 && rank === 2) ||
      (file === 3 && rank === 5) || (file === 5 && rank === 5)) {
    return RING_BONUS;
  }
  return 0;
}

/**
 * Evaluate a position in centi-men from White's point of view. Positive
 * means White is better. Walks the 0x88 board once, skipping off-board
 * squares with the standard `index & 0x88` check.
 * @param {{ board: Int8Array | number[], turn: 'w' | 'b' }} pos
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

    let value = MATERIAL[type];

    if (type === MAN) {
      // White advances by climbing ranks; black advances by descending them.
      const advanced = isBlack ? 7 - rank : rank;
      value += advanced * ADVANCE_BONUS;
      const homeRank = isBlack ? 7 : 0;
      if (rank === homeRank) value += BACK_RANK_BONUS;
    }

    value += centreValue(file, rank);

    score += isBlack ? -value : value;
  }

  return score;
}
