// A complete chess rules engine: legal move generation, make/unmake, FEN,
// SAN, and game-over detection. No dependencies, no DOM, just data.
//
// The board is a 0x88 layout in an Int8Array(128): index = rank * 16 + file,
// a1 = 0, h1 = 7, a8 = 112, h8 = 119. Half the array is padding, but that
// padding is the entire point: any move offset that would walk off a real
// board also walks into a padding square, and padding squares are exactly
// the ones where `index & 0x88` is nonzero. That one bit test replaces all
// the per-direction edge bookkeeping a plain 8x8 board would need, and it is
// why this representation is still the fast choice forty years after it was
// invented.
//
// Positions are mutated in place. generateMoves does the legality filtering
// (checks, pins, castling through check) so callers only ever see legal
// moves, but internally it leans on makeMove/unmakeMove to test each
// candidate rather than computing pins directly. That costs an extra
// make/unmake per pseudo-legal move, but make/unmake here never copies the
// board, so the trade is worth the simplicity: perft(5) from the start
// position still runs in a few seconds, not minutes.

// ---------------------------------------------------------------------------
// Piece encoding
// ---------------------------------------------------------------------------

export const PIECE = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
export const BLACK = 8;

/** 'w' or 'b' for a nonzero piece code. Do not call this on an empty square. */
export function colorOf(code) {
  return code & BLACK ? 'b' : 'w';
}

/** The piece type (1..6) for any piece code, white or black. */
export function typeOf(code) {
  return code & 7;
}

const PIECE_LETTERS = { [PIECE.P]: 'p', [PIECE.N]: 'n', [PIECE.B]: 'b', [PIECE.R]: 'r', [PIECE.Q]: 'q', [PIECE.K]: 'k' };
const PIECE_FROM_LETTER = { p: PIECE.P, n: PIECE.N, b: PIECE.B, r: PIECE.R, q: PIECE.Q, k: PIECE.K };

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}

// ---------------------------------------------------------------------------
// Squares
// ---------------------------------------------------------------------------

export function squareName(index) {
  const file = index & 7;
  const rank = index >> 4;
  return String.fromCharCode(97 + file) + (rank + 1);
}

export function parseSquare(name) {
  const file = name.charCodeAt(0) - 97;
  const rank = Number(name[1]) - 1;
  return rank * 16 + file;
}

function fileOf(sq) {
  return sq & 7;
}

function rankOf(sq) {
  return sq >> 4;
}

function fileLetter(sq) {
  return String.fromCharCode(97 + fileOf(sq));
}

// Named corners and the king's home square on each side, used all over
// castling and castling-rights bookkeeping below.
const A1 = 0, B1 = 1, C1 = 2, D1 = 3, E1 = 4, F1 = 5, G1 = 6, H1 = 7;
const A8 = 112, B8 = 113, C8 = 114, D8 = 115, E8 = 116, F8 = 117, G8 = 118, H8 = 119;

// ---------------------------------------------------------------------------
// Move shape
// ---------------------------------------------------------------------------

export const CASTLE = { WK: 1, WQ: 2, BK: 4, BQ: 8 };
export const FLAG = { CAPTURE: 1, DOUBLE: 2, EP: 4, CASTLE: 8, PROMOTION: 16 };

function addMove(list, from, to, piece, captured, promotion, flags) {
  list.push({ from, to, piece, captured, promotion, flags });
}

function addPromotions(list, from, to, piece, captured, extraFlags) {
  addMove(list, from, to, piece, captured, PIECE.Q, extraFlags | FLAG.PROMOTION);
  addMove(list, from, to, piece, captured, PIECE.R, extraFlags | FLAG.PROMOTION);
  addMove(list, from, to, piece, captured, PIECE.B, extraFlags | FLAG.PROMOTION);
  addMove(list, from, to, piece, captured, PIECE.N, extraFlags | FLAG.PROMOTION);
}

// ---------------------------------------------------------------------------
// Zobrist hashing
//
// Keys are built from a seeded PRNG so the same position always hashes to
// the same number on every run, in every process. Each key is two 26-bit
// halves glued together (hi * 2^26 + lo), which keeps every key, and every
// XOR of keys, safely inside the 52 bits of precision a JS double carries
// exactly. The native ^ operator can't be used directly on numbers this big
// (it truncates to 32 bits), so xor52 below does the XOR on each half
// separately, where the native operator is safe, then glues the halves back
// together the same way the keys were built.
// ---------------------------------------------------------------------------

const HALF = 0x4000000; // 2^26

function xor52(a, b) {
  const ahi = Math.floor(a / HALF), alo = a % HALF;
  const bhi = Math.floor(b / HALF), blo = b % HALF;
  return (ahi ^ bhi) * HALF + (alo ^ blo);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeKey(rng) {
  const hi = Math.floor(rng() * HALF);
  const lo = Math.floor(rng() * HALF);
  return hi * HALF + lo;
}

function buildZobrist() {
  // Fixed seed on purpose: two runs of this file must agree on every hash.
  const rng = mulberry32(0x5eed1e55);
  const piece = [];
  for (let code = 0; code <= 14; code++) {
    const row = new Array(128);
    for (let sq = 0; sq < 128; sq++) row[sq] = makeKey(rng);
    piece[code] = row;
  }
  const side = makeKey(rng);
  const rightsBits = [makeKey(rng), makeKey(rng), makeKey(rng), makeKey(rng)]; // WK, WQ, BK, BQ
  const castle = new Array(16);
  for (let mask = 0; mask < 16; mask++) {
    let key = 0;
    if (mask & CASTLE.WK) key = xor52(key, rightsBits[0]);
    if (mask & CASTLE.WQ) key = xor52(key, rightsBits[1]);
    if (mask & CASTLE.BK) key = xor52(key, rightsBits[2]);
    if (mask & CASTLE.BQ) key = xor52(key, rightsBits[3]);
    castle[mask] = key;
  }
  const ep = new Array(128);
  for (let sq = 0; sq < 128; sq++) ep[sq] = makeKey(rng);
  return { piece, side, castle, ep };
}

const ZOBRIST = buildZobrist();

function epKey(ep) {
  return ep === -1 ? 0 : ZOBRIST.ep[ep];
}

function computeHash(pos) {
  let h = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = pos.board[sq];
    if (code !== 0) h = xor52(h, ZOBRIST.piece[code][sq]);
  }
  if (pos.turn === 'b') h = xor52(h, ZOBRIST.side);
  h = xor52(h, ZOBRIST.castle[pos.castling]);
  h = xor52(h, epKey(pos.ep));
  return h;
}

export function hash(pos) {
  return pos.hash;
}

// ---------------------------------------------------------------------------
// FEN
// ---------------------------------------------------------------------------

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Build a Position from a FEN string. Defaults to the standard start position. */
export function createPosition(fen = START_FEN) {
  const [placement, turnField, castlingField, epField, halfmoveField, fullmoveField] = fen.trim().split(/\s+/);

  const board = new Int8Array(128);
  const kings = { w: -1, b: -1 };

  const ranks = placement.split('/');
  for (let r = 0; r < 8; r++) {
    const rank = 7 - r; // FEN lists rank 8 first
    let file = 0;
    for (const ch of ranks[r]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      const type = PIECE_FROM_LETTER[ch.toLowerCase()];
      const color = ch === ch.toUpperCase() ? 0 : BLACK;
      const sq = rank * 16 + file;
      board[sq] = type + color;
      if (type === PIECE.K) kings[color ? 'b' : 'w'] = sq;
      file += 1;
    }
  }

  let castling = 0;
  if (castlingField && castlingField !== '-') {
    if (castlingField.includes('K')) castling |= CASTLE.WK;
    if (castlingField.includes('Q')) castling |= CASTLE.WQ;
    if (castlingField.includes('k')) castling |= CASTLE.BK;
    if (castlingField.includes('q')) castling |= CASTLE.BQ;
  }

  const pos = {
    board,
    turn: turnField === 'b' ? 'b' : 'w',
    castling,
    ep: epField && epField !== '-' ? parseSquare(epField) : -1,
    halfmove: halfmoveField !== undefined ? Number(halfmoveField) : 0,
    fullmove: fullmoveField !== undefined ? Number(fullmoveField) : 1,
    kings,
    hash: 0,
    history: [],
  };
  pos.hash = computeHash(pos);
  // Seed history with the starting position itself, so a game that returns
  // here (a knight shuffled out and back, say) counts it as one occurrence
  // rather than losing it because it predates the first makeMove.
  pos.history.push(pos.hash);
  return pos;
}

/** Render a Position back to FEN. Always round-trips through createPosition. */
export function toFen(pos) {
  const rows = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const code = pos.board[rank * 16 + file];
      if (code === 0) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += empty;
        empty = 0;
      }
      const letter = PIECE_LETTERS[typeOf(code)];
      row += colorOf(code) === 'w' ? letter.toUpperCase() : letter;
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }

  let castling = '';
  if (pos.castling & CASTLE.WK) castling += 'K';
  if (pos.castling & CASTLE.WQ) castling += 'Q';
  if (pos.castling & CASTLE.BK) castling += 'k';
  if (pos.castling & CASTLE.BQ) castling += 'q';
  if (castling === '') castling = '-';

  const ep = pos.ep === -1 ? '-' : squareName(pos.ep);

  return `${rows.join('/')} ${pos.turn} ${castling} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_OFFSETS = [16, -16, 1, -1, 17, 15, -17, -15];
const BISHOP_OFFSETS = [17, 15, -17, -15];
const ROOK_OFFSETS = [16, -16, 1, -1];

/** Is `square` attacked by any piece of `byColor` ('w' | 'b') in the current position? */
export function isAttacked(pos, square, byColor) {
  const board = pos.board;

  // Pawns: reverse the pawn's own attack direction to look back at it.
  const pawnStep = byColor === 'w' ? -1 : 1;
  const pawnCode = PIECE.P + (byColor === 'b' ? BLACK : 0);
  for (const d of [17, 15]) {
    const s = square + pawnStep * d;
    if ((s & 0x88) === 0 && board[s] === pawnCode) return true;
  }

  for (const d of KNIGHT_OFFSETS) {
    const s = square + d;
    if ((s & 0x88) === 0) {
      const code = board[s];
      if (code !== 0 && typeOf(code) === PIECE.N && colorOf(code) === byColor) return true;
    }
  }

  for (const d of KING_OFFSETS) {
    const s = square + d;
    if ((s & 0x88) === 0) {
      const code = board[s];
      if (code !== 0 && typeOf(code) === PIECE.K && colorOf(code) === byColor) return true;
    }
  }

  for (const d of BISHOP_OFFSETS) {
    let s = square + d;
    while ((s & 0x88) === 0) {
      const code = board[s];
      if (code !== 0) {
        if (colorOf(code) === byColor && (typeOf(code) === PIECE.B || typeOf(code) === PIECE.Q)) return true;
        break;
      }
      s += d;
    }
  }

  for (const d of ROOK_OFFSETS) {
    let s = square + d;
    while ((s & 0x88) === 0) {
      const code = board[s];
      if (code !== 0) {
        if (colorOf(code) === byColor && (typeOf(code) === PIECE.R || typeOf(code) === PIECE.Q)) return true;
        break;
      }
      s += d;
    }
  }

  return false;
}

/** Is the side to move currently in check? */
export function inCheck(pos) {
  return isAttacked(pos, pos.kings[pos.turn], opposite(pos.turn));
}

// ---------------------------------------------------------------------------
// Pseudo-legal move generation
//
// Nothing here worries about pins or leaving the king in check. That is
// generateMoves' job below, applied uniformly by actually making the move
// and looking at the board. Keeping the two concerns apart is what makes
// this whole file readable.
// ---------------------------------------------------------------------------

function addStepMoves(pos, from, piece, color, offsets, list) {
  for (const d of offsets) {
    const to = from + d;
    if (to & 0x88) continue;
    const target = pos.board[to];
    if (target === 0) addMove(list, from, to, piece, 0, 0, 0);
    else if (colorOf(target) !== color) addMove(list, from, to, piece, target, 0, FLAG.CAPTURE);
  }
}

function addSlideMoves(pos, from, piece, color, offsets, list) {
  for (const d of offsets) {
    let to = from + d;
    while ((to & 0x88) === 0) {
      const target = pos.board[to];
      if (target === 0) {
        addMove(list, from, to, piece, 0, 0, 0);
        to += d;
        continue;
      }
      if (colorOf(target) !== color) addMove(list, from, to, piece, target, 0, FLAG.CAPTURE);
      break;
    }
  }
}

function addPawnMoves(pos, from, piece, color, list) {
  const board = pos.board;
  const forward = color === 'w' ? 16 : -16;
  const startLo = color === 'w' ? 16 : 96;
  const startHi = startLo + 7;
  const promoLo = color === 'w' ? 112 : 0;
  const promoHi = promoLo + 7;

  const one = from + forward;
  if ((one & 0x88) === 0 && board[one] === 0) {
    if (one >= promoLo && one <= promoHi) addPromotions(list, from, one, piece, 0, 0);
    else addMove(list, from, one, piece, 0, 0, 0);

    if (from >= startLo && from <= startHi) {
      const two = from + forward * 2;
      if (board[two] === 0) addMove(list, from, two, piece, 0, 0, FLAG.DOUBLE);
    }
  }

  const capOffsets = color === 'w' ? [17, 15] : [-17, -15];
  for (const d of capOffsets) {
    const to = from + d;
    if (to & 0x88) continue;
    const target = board[to];
    if (target !== 0) {
      if (colorOf(target) === color) continue;
      if (to >= promoLo && to <= promoHi) addPromotions(list, from, to, piece, target, FLAG.CAPTURE);
      else addMove(list, from, to, piece, target, 0, FLAG.CAPTURE);
    } else if (to === pos.ep) {
      const capturedPawn = PIECE.P + (color === 'w' ? BLACK : 0);
      addMove(list, from, to, piece, capturedPawn, 0, FLAG.CAPTURE | FLAG.EP);
    }
  }
}

function addCastleMoves(pos, from, color, list) {
  const opp = opposite(color);
  const board = pos.board;
  if (color === 'w') {
    if (
      pos.castling & CASTLE.WK &&
      board[F1] === 0 && board[G1] === 0 &&
      !isAttacked(pos, E1, opp) && !isAttacked(pos, F1, opp) && !isAttacked(pos, G1, opp)
    ) {
      addMove(list, from, G1, PIECE.K, 0, 0, FLAG.CASTLE);
    }
    if (
      pos.castling & CASTLE.WQ &&
      board[D1] === 0 && board[C1] === 0 && board[B1] === 0 &&
      !isAttacked(pos, E1, opp) && !isAttacked(pos, D1, opp) && !isAttacked(pos, C1, opp)
    ) {
      addMove(list, from, C1, PIECE.K, 0, 0, FLAG.CASTLE);
    }
  } else {
    if (
      pos.castling & CASTLE.BK &&
      board[F8] === 0 && board[G8] === 0 &&
      !isAttacked(pos, E8, opp) && !isAttacked(pos, F8, opp) && !isAttacked(pos, G8, opp)
    ) {
      addMove(list, from, G8, PIECE.K + BLACK, 0, 0, FLAG.CASTLE);
    }
    if (
      pos.castling & CASTLE.BQ &&
      board[D8] === 0 && board[C8] === 0 && board[B8] === 0 &&
      !isAttacked(pos, E8, opp) && !isAttacked(pos, D8, opp) && !isAttacked(pos, C8, opp)
    ) {
      addMove(list, from, C8, PIECE.K + BLACK, 0, 0, FLAG.CASTLE);
    }
  }
}

function generatePseudoMoves(pos) {
  const list = [];
  const color = pos.turn;
  const board = pos.board;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = board[sq];
    if (code === 0 || colorOf(code) !== color) continue;
    const type = typeOf(code);
    if (type === PIECE.P) addPawnMoves(pos, sq, code, color, list);
    else if (type === PIECE.N) addStepMoves(pos, sq, code, color, KNIGHT_OFFSETS, list);
    else if (type === PIECE.B) addSlideMoves(pos, sq, code, color, BISHOP_OFFSETS, list);
    else if (type === PIECE.R) addSlideMoves(pos, sq, code, color, ROOK_OFFSETS, list);
    else if (type === PIECE.Q) {
      addSlideMoves(pos, sq, code, color, BISHOP_OFFSETS, list);
      addSlideMoves(pos, sq, code, color, ROOK_OFFSETS, list);
    } else if (type === PIECE.K) {
      addStepMoves(pos, sq, code, color, KING_OFFSETS, list);
      addCastleMoves(pos, sq, color, list);
    }
  }
  return list;
}

/** Every legal move for the side to move. */
export function generateMoves(pos) {
  const color = pos.turn;
  const opp = opposite(color);
  const pseudo = generatePseudoMoves(pos);
  const legal = [];
  for (const move of pseudo) {
    const undo = makeMove(pos, move);
    if (!isAttacked(pos, pos.kings[color], opp)) legal.push(move);
    unmakeMove(pos, undo);
  }
  return legal;
}

// ---------------------------------------------------------------------------
// Make / unmake
//
// Losing castling rights only ever happens for three reasons: the king
// moved, a rook moved off its home square, or a rook got captured on its
// home square. Rather than branch on which of those three happened, mask
// off whatever rights belong to the move's `from` and `to` squares on every
// move. A non-corner, non-king square carries no bits in that mask, so this
// is a no-op for the vast majority of moves, and it happens to also cover
// castling itself (the king leaving e1 clears both white rights, which is
// exactly correct).
// ---------------------------------------------------------------------------

const CASTLE_MASK = new Int8Array(128);
CASTLE_MASK[E1] = CASTLE.WK | CASTLE.WQ;
CASTLE_MASK[H1] = CASTLE.WK;
CASTLE_MASK[A1] = CASTLE.WQ;
CASTLE_MASK[E8] = CASTLE.BK | CASTLE.BQ;
CASTLE_MASK[H8] = CASTLE.BK;
CASTLE_MASK[A8] = CASTLE.BQ;

function castleRookSquares(kingTo) {
  if (kingTo === G1) return [H1, F1];
  if (kingTo === C1) return [A1, D1];
  if (kingTo === G8) return [H8, F8];
  return [A8, D8]; // C8
}

/** Apply `move` to `pos` in place. Returns an Undo record for unmakeMove. */
export function makeMove(pos, move) {
  const board = pos.board;
  const color = colorOf(move.piece);

  const undo = {
    move,
    prevCastling: pos.castling,
    prevEp: pos.ep,
    prevHalfmove: pos.halfmove,
    prevFullmove: pos.fullmove,
    prevHash: pos.hash,
  };

  board[move.from] = 0;
  pos.hash = xor52(pos.hash, ZOBRIST.piece[move.piece][move.from]);

  if (move.captured !== 0) {
    if (move.flags & FLAG.EP) {
      const capSq = move.to + (color === 'w' ? -16 : 16);
      board[capSq] = 0;
      pos.hash = xor52(pos.hash, ZOBRIST.piece[move.captured][capSq]);
    } else {
      pos.hash = xor52(pos.hash, ZOBRIST.piece[move.captured][move.to]);
    }
  }

  const placed = move.promotion ? move.promotion + (color === 'b' ? BLACK : 0) : move.piece;
  board[move.to] = placed;
  pos.hash = xor52(pos.hash, ZOBRIST.piece[placed][move.to]);

  if (move.flags & FLAG.CASTLE) {
    const [rookFrom, rookTo] = castleRookSquares(move.to);
    const rook = board[rookFrom];
    board[rookFrom] = 0;
    board[rookTo] = rook;
    pos.hash = xor52(pos.hash, ZOBRIST.piece[rook][rookFrom]);
    pos.hash = xor52(pos.hash, ZOBRIST.piece[rook][rookTo]);
  }

  if (typeOf(move.piece) === PIECE.K) pos.kings[color] = move.to;

  const newCastling = pos.castling & ~CASTLE_MASK[move.from] & ~CASTLE_MASK[move.to];
  pos.hash = xor52(pos.hash, xor52(ZOBRIST.castle[pos.castling], ZOBRIST.castle[newCastling]));
  pos.castling = newCastling;

  const newEp = move.flags & FLAG.DOUBLE ? (move.from + move.to) >> 1 : -1;
  pos.hash = xor52(pos.hash, xor52(epKey(pos.ep), epKey(newEp)));
  pos.ep = newEp;

  pos.halfmove = typeOf(move.piece) === PIECE.P || move.captured !== 0 ? 0 : pos.halfmove + 1;
  if (color === 'b') pos.fullmove += 1;

  pos.turn = opposite(color);
  pos.hash = xor52(pos.hash, ZOBRIST.side);
  pos.history.push(pos.hash);

  return undo;
}

/** Restore `pos` to exactly the state it had before the move `undo` came from. */
export function unmakeMove(pos, undo) {
  const board = pos.board;
  const move = undo.move;
  const color = colorOf(move.piece);

  pos.turn = color;
  pos.castling = undo.prevCastling;
  pos.ep = undo.prevEp;
  pos.halfmove = undo.prevHalfmove;
  pos.fullmove = undo.prevFullmove;
  pos.hash = undo.prevHash;
  pos.history.pop();

  if (move.flags & FLAG.CASTLE) {
    const [rookFrom, rookTo] = castleRookSquares(move.to);
    board[rookFrom] = board[rookTo];
    board[rookTo] = 0;
  }

  if (move.flags & FLAG.EP) {
    board[move.to] = 0;
    const capSq = move.to + (color === 'w' ? -16 : 16);
    board[capSq] = move.captured;
  } else {
    board[move.to] = move.captured;
  }

  board[move.from] = move.piece;

  if (typeOf(move.piece) === PIECE.K) pos.kings[color] = move.from;
}

// ---------------------------------------------------------------------------
// SAN
// ---------------------------------------------------------------------------

function disambiguation(pos, move) {
  const others = generateMoves(pos).filter(
    (m) => m.piece === move.piece && m.to === move.to && m.from !== move.from
  );
  if (others.length === 0) return '';
  const sameFile = others.some((o) => fileOf(o.from) === fileOf(move.from));
  const sameRank = others.some((o) => rankOf(o.from) === rankOf(move.from));
  if (!sameFile) return fileLetter(move.from);
  if (!sameRank) return String(rankOf(move.from) + 1);
  return squareName(move.from);
}

function checkSuffix(pos, move) {
  const undo = makeMove(pos, move);
  let suffix = '';
  if (inCheck(pos)) suffix = generateMoves(pos).length === 0 ? '#' : '+';
  unmakeMove(pos, undo);
  return suffix;
}

/** Standard Algebraic Notation for `move`. Call this before making the move. */
export function toSAN(pos, move) {
  if (move.flags & FLAG.CASTLE) {
    const base = move.to === G1 || move.to === G8 ? 'O-O' : 'O-O-O';
    return base + checkSuffix(pos, move);
  }

  const type = typeOf(move.piece);
  let san = '';

  if (type === PIECE.P) {
    if (move.flags & FLAG.CAPTURE) san += fileLetter(move.from) + 'x';
    san += squareName(move.to);
    if (move.promotion) san += '=' + PIECE_LETTERS[move.promotion].toUpperCase();
  } else {
    san += PIECE_LETTERS[type].toUpperCase();
    san += disambiguation(pos, move);
    if (move.flags & FLAG.CAPTURE) san += 'x';
    san += squareName(move.to);
  }

  return san + checkSuffix(pos, move);
}

// ---------------------------------------------------------------------------
// UCI
// ---------------------------------------------------------------------------

/** 'e2e4', 'e7e8q'. */
export function moveToUci(move) {
  let uci = squareName(move.from) + squareName(move.to);
  if (move.promotion) uci += PIECE_LETTERS[move.promotion];
  return uci;
}

/** The legal move matching a UCI string, or null if none does. */
export function moveFromUci(pos, uci) {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  const promoLetter = uci.length > 4 ? uci[4].toLowerCase() : null;
  const promotion = promoLetter ? PIECE_FROM_LETTER[promoLetter] : 0;
  for (const move of generateMoves(pos)) {
    if (move.from === from && move.to === to && (move.promotion || 0) === promotion) return move;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Game status
// ---------------------------------------------------------------------------

function squareColor(sq) {
  return (fileOf(sq) + rankOf(sq)) % 2;
}

// Only the exact draws the rules ask for: bare kings, a lone minor against a
// king, or opposite-color-of-square bishops facing off. Anything else (two
// knights, mismatched bishops, a bishop plus a knight) still needs mating,
// so it is left alone even though some of those are also famously hard.
function isInsufficientMaterial(pos) {
  const minors = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = pos.board[sq];
    if (code === 0) continue;
    const type = typeOf(code);
    if (type === PIECE.K) continue;
    if (type === PIECE.P || type === PIECE.R || type === PIECE.Q) return false;
    minors.push({ color: colorOf(code), type, square: sq });
  }

  if (minors.length === 0) return true;
  if (minors.length === 1) return true;
  if (
    minors.length === 2 &&
    minors[0].type === PIECE.B &&
    minors[1].type === PIECE.B &&
    minors[0].color !== minors[1].color &&
    squareColor(minors[0].square) === squareColor(minors[1].square)
  ) {
    return true;
  }
  return false;
}

function countOccurrences(history, value) {
  let count = 0;
  for (const h of history) if (h === value) count += 1;
  return count;
}

/** { over, result: 'white' | 'black' | 'draw' | null, reason } for the current position. */
export function status(pos) {
  const moves = generateMoves(pos);
  if (moves.length === 0) {
    if (inCheck(pos)) return { over: true, result: pos.turn === 'w' ? 'black' : 'white', reason: 'checkmate' };
    return { over: true, result: 'draw', reason: 'stalemate' };
  }
  if (pos.halfmove >= 100) return { over: true, result: 'draw', reason: 'fifty' };
  if (countOccurrences(pos.history, pos.hash) >= 3) return { over: true, result: 'draw', reason: 'repetition' };
  if (isInsufficientMaterial(pos)) return { over: true, result: 'draw', reason: 'material' };
  return { over: false, result: null, reason: null };
}

// ---------------------------------------------------------------------------
// Perft
// ---------------------------------------------------------------------------

/** Leaf node count at `depth` plies from `pos`. Mutates and restores `pos`. */
export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = generateMoves(pos);
  if (depth === 1) return moves.length; // bulk-count the last ply, no need to make/unmake it
  let nodes = 0;
  for (const move of moves) {
    const undo = makeMove(pos, move);
    nodes += perft(pos, depth - 1);
    unmakeMove(pos, undo);
  }
  return nodes;
}
