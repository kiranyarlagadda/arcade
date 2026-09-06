// A complete draughts rules engine: legal move generation, make/unmake, FEN,
// and game-over detection. No dependencies, no DOM, just data. This is
// English draughts (checkers) on an 8 by 8 board, dark squares only, no
// flying kings, mandatory capture, one continuous multi-jump per turn.
//
// Tradition has black move first. In this package white ('w') is player
// one and moves first, the same way white moves first in the chess package
// next door, so the two games behave consistently from the engine's side.
//
// The board reuses chess's 0x88 layout: an Int8Array(128), index = rank * 16
// + file, a1 = 0, h1 = 7, a8 = 112, h8 = 119. Draughts only ever touches the
// dark squares, the ones where (file + rank) is even, but there is no reason
// to give them a denser encoding: the padding bit that makes 0x88 useful for
// walking off the board in one direction check is just as useful here, and
// reusing a layout the rest of this arcade already understands is worth more
// than the few dozen bytes a packed board would save.
//
// Positions are mutated in place. generateMoves needs no separate legality
// pass the way chess does (there is no check, no pin, no move that could
// expose anything): a capture sequence is legal by construction, and a slide
// is legal exactly when its target square is empty. The only real
// bookkeeping is mandatory capture (only capture moves are legal if any
// exist, anywhere on the board) and multi-jump (the whole sequence is one
// move, and it cannot stop early while a further jump is available for the
// same piece).

// ---------------------------------------------------------------------------
// Piece encoding
// ---------------------------------------------------------------------------

export const PIECE = { MAN: 1, KING: 2 };
export const BLACK = 8;

/** 'w' or 'b' for a nonzero piece code. Do not call this on an empty square. */
export function colorOf(code) {
  return code & BLACK ? 'b' : 'w';
}

/** The piece type (1 = man, 2 = king) for any piece code, white or black. */
export function typeOf(code) {
  return code & 7;
}

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
  const rank = Number(name.slice(1)) - 1;
  return rank * 16 + file;
}

function fileOf(sq) {
  return sq & 7;
}

function rankOf(sq) {
  return sq >> 4;
}

// ---------------------------------------------------------------------------
// Zobrist hashing
//
// Same trick as chess/rules.js: keys are two 26-bit halves glued together so
// every key, and every XOR of keys, stays inside the 52 bits a JS double
// carries exactly. There is far less state to fold in here than in chess (no
// castling rights, no en passant square), so the whole table is just piece
// codes on squares plus a side-to-move key.
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
  // Fixed seed on purpose, same reasoning as chess: two runs of this file
  // must always agree on every hash. A different seed from chess's own is
  // deliberate too, so the two games never collide if a caller ever mixed
  // their hashes into one table by mistake.
  const rng = mulberry32(0xd4a06e75);
  const piece = [];
  for (let code = 0; code <= 15; code++) {
    const row = new Array(128);
    for (let sq = 0; sq < 128; sq++) row[sq] = makeKey(rng);
    piece[code] = row;
  }
  const side = makeKey(rng);
  return { piece, side };
}

const ZOBRIST = buildZobrist();

function computeHash(pos) {
  let h = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = pos.board[sq];
    if (code !== 0) h = xor52(h, ZOBRIST.piece[code][sq]);
  }
  if (pos.turn === 'b') h = xor52(h, ZOBRIST.side);
  return h;
}

export function hash(pos) {
  return pos.hash;
}

// ---------------------------------------------------------------------------
// FEN
//
// Not chess FEN: '<W|B>:W<squares>:B<squares>', turn first, then each side's
// occupied squares comma separated, a king written with a leading K (Kd4).
// Either side's list may be empty. There is no field for halfmove or
// history: those describe how a game got here, not the position itself, so
// createPosition always starts them fresh.
// ---------------------------------------------------------------------------

export const START_FEN =
  'W:Wa1,c1,e1,g1,b2,d2,f2,h2,a3,c3,e3,g3:Bb6,d6,f6,h6,a7,c7,e7,g7,b8,d8,f8,h8';

function parseSide(board, field, color) {
  if (!field) return;
  const rest = field.slice(1); // drop the leading W or B
  if (!rest) return;
  const colorBit = color === 'b' ? BLACK : 0;
  for (const token of rest.split(',')) {
    const isKing = token[0] === 'K';
    const sq = parseSquare(isKing ? token.slice(1) : token);
    board[sq] = (isKing ? PIECE.KING : PIECE.MAN) + colorBit;
  }
}

/** Build a Position from a FEN string. Defaults to the standard start position. */
export function createPosition(fen = START_FEN) {
  const [turnField, wField, bField] = fen.trim().split(':');

  const board = new Int8Array(128);
  parseSide(board, wField, 'w');
  parseSide(board, bField, 'b');

  const pos = {
    board,
    turn: turnField.trim().toUpperCase() === 'B' ? 'b' : 'w',
    halfmove: 0,
    hash: 0,
    history: [],
  };
  pos.hash = computeHash(pos);
  // Seed history with the position itself, the same reasoning as chess: a
  // position that recurs later should count its first appearance too.
  pos.history.push(pos.hash);
  return pos;
}

/** Render a Position back to FEN. Always round-trips through createPosition. */
export function toFen(pos) {
  const w = [];
  const b = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = pos.board[sq];
    if (code === 0) continue;
    const name = (typeOf(code) === PIECE.KING ? 'K' : '') + squareName(sq);
    if (colorOf(code) === 'w') w.push(name);
    else b.push(name);
  }
  return `${pos.turn.toUpperCase()}:W${w.join(',')}:B${b.join(',')}`;
}

// ---------------------------------------------------------------------------
// Move generation
//
// Two passes: first look for a capture from every piece the side to move
// has; if that turns up anything, mandatory capture means those are the only
// legal moves and slides never even get generated. Otherwise fall back to
// plain one-step slides.
// ---------------------------------------------------------------------------

// Board offsets for the four diagonal directions. +16 is one rank up, so
// +15/+17 step one rank up while stepping one file left/right, and the
// negatives step one rank down the same way. White's forward is up the
// board (towards rank 8); black's is down it.
const KING_DIRS = [15, 17, -15, -17];
const MAN_DIRS = { w: [15, 17], b: [-15, -17] };

function isPromotionSquare(sq, color) {
  const rank = rankOf(sq);
  return color === 'w' ? rank === 7 : rank === 0;
}

/**
 * Depth-first search for every complete capture sequence available to the
 * piece on `from`. Pushes one Move per maximal branch into `out` (a branch
 * ends when the piece has no further jump available, or when a man promotes,
 * which always ends the move on the spot).
 *
 * Nothing here mutates `pos.board`: captured pieces stay right where they
 * are for the whole search (they are only actually removed by makeMove,
 * once a full sequence has been chosen), so a piece already captured this
 * sequence is tracked separately in `capturedSet` and simply refused as a
 * target again. That is what stops a piece from being jumped twice, and
 * it is also what stops the search from looping forever bouncing a king
 * back and forth over the same piece: once a square is in `capturedSet` it
 * can never be jumped again, so a search with N enemy pieces on the board
 * cannot recurse more than N deep.
 *
 * The one square that does need special-casing is `from` itself: the real
 * board still shows the moving piece sitting there, since we have not
 * actually moved anything yet, so a landing square is only treated as
 * occupied when it holds a piece AND is not the square this piece started
 * on.
 */
function findCaptures(pos, from, piece, color, out) {
  const isKing = typeOf(piece) === PIECE.KING;
  const dirs = isKing ? KING_DIRS : MAN_DIRS[color];
  const path = [];
  const captured = [];
  const capturedSet = new Set();

  function extend(current) {
    let found = false;
    for (const d of dirs) {
      const mid = current + d;
      if (mid & 0x88) continue;
      const midCode = pos.board[mid];
      if (midCode === 0 || colorOf(midCode) === color || capturedSet.has(mid)) continue;

      const to = current + d * 2;
      if (to & 0x88) continue;
      if (to !== from && pos.board[to] !== 0) continue;

      found = true;
      path.push(to);
      captured.push(mid);
      capturedSet.add(mid);

      if (!isKing && isPromotionSquare(to, color)) {
        // A man's promotion ends the move right here, even if the square it
        // just landed on could jump again as a king.
        out.push({ from, to, piece, path: path.slice(), captures: captured.slice(), promotion: true });
      } else if (!extend(to)) {
        out.push({ from, to, piece, path: path.slice(), captures: captured.slice(), promotion: false });
      }

      path.pop();
      captured.pop();
      capturedSet.delete(mid);
    }
    return found;
  }

  extend(from);
}

function findSlides(pos, from, piece, color, out) {
  const isKing = typeOf(piece) === PIECE.KING;
  const dirs = isKing ? KING_DIRS : MAN_DIRS[color];
  for (const d of dirs) {
    const to = from + d;
    if (to & 0x88) continue;
    if (pos.board[to] !== 0) continue;
    out.push({
      from,
      to,
      piece,
      path: [to],
      captures: [],
      promotion: !isKing && isPromotionSquare(to, color),
    });
  }
}

/** Every legal move for the side to move: capture sequences if any exist, otherwise slides. */
export function generateMoves(pos) {
  const color = pos.turn;
  const board = pos.board;

  const captures = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = board[sq];
    if (code === 0 || colorOf(code) !== color) continue;
    findCaptures(pos, sq, code, color, captures);
  }
  if (captures.length > 0) return captures;

  const slides = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const code = board[sq];
    if (code === 0 || colorOf(code) !== color) continue;
    findSlides(pos, sq, code, color, slides);
  }
  return slides;
}

// ---------------------------------------------------------------------------
// Make / unmake
// ---------------------------------------------------------------------------

/** Apply `move` to `pos` in place. Returns an Undo record for unmakeMove. */
export function makeMove(pos, move) {
  const board = pos.board;
  const color = colorOf(move.piece);
  const capturedCodes = move.captures.map((sq) => board[sq]);
  const irreversible = move.captures.length > 0 || typeOf(move.piece) === PIECE.MAN;

  const undo = {
    move,
    capturedCodes,
    irreversible,
    prevHalfmove: pos.halfmove,
    prevHash: pos.hash,
    // Only meaningful when `irreversible` is true: the history array from
    // before it got replaced, kept by reference so unmake can hand it right
    // back without having to reconstruct anything.
    prevHistory: irreversible ? pos.history : null,
  };

  board[move.from] = 0;
  pos.hash = xor52(pos.hash, ZOBRIST.piece[move.piece][move.from]);

  for (let i = 0; i < move.captures.length; i++) {
    const sq = move.captures[i];
    const code = capturedCodes[i];
    board[sq] = 0;
    pos.hash = xor52(pos.hash, ZOBRIST.piece[code][sq]);
  }

  const placed = move.promotion ? PIECE.KING + (color === 'b' ? BLACK : 0) : move.piece;
  board[move.to] = placed;
  pos.hash = xor52(pos.hash, ZOBRIST.piece[placed][move.to]);

  pos.turn = opposite(color);
  pos.hash = xor52(pos.hash, ZOBRIST.side);

  if (irreversible) {
    // A capture or a man's advance can never be walked back, so no position
    // from before it can ever recur. Starting history fresh here is not
    // just bookkeeping tidiness, it is what makes the repetition check
    // below correct without also needing to know which moves are undoable.
    pos.halfmove = 0;
    pos.history = [pos.hash];
  } else {
    pos.halfmove += 1;
    pos.history.push(pos.hash);
  }

  return undo;
}

/** Restore `pos` to exactly the state it had before the move `undo` came from. */
export function unmakeMove(pos, undo) {
  const board = pos.board;
  const move = undo.move;
  const color = colorOf(move.piece);

  pos.turn = color;
  pos.halfmove = undo.prevHalfmove;
  pos.hash = undo.prevHash;
  if (undo.irreversible) pos.history = undo.prevHistory;
  else pos.history.pop();

  board[move.to] = 0;
  for (let i = 0; i < move.captures.length; i++) {
    board[move.captures[i]] = undo.capturedCodes[i];
  }
  board[move.from] = move.piece;
}

// ---------------------------------------------------------------------------
// Move notation
//
// 'a3-b4' for a slide, 'a3xc5xe7' for a capture sequence: the from square,
// then every landing square in path order, joined by '-' or 'x' depending on
// whether anything got captured along the way.
// ---------------------------------------------------------------------------

export function moveToStr(move) {
  const squares = [move.from, ...move.path].map(squareName);
  return squares.join(move.captures.length > 0 ? 'x' : '-');
}

export function moveFromStr(pos, str) {
  const sep = str.includes('x') ? 'x' : '-';
  const squares = str.split(sep).map(parseSquare);
  const from = squares[0];
  const path = squares.slice(1);
  for (const move of generateMoves(pos)) {
    if (move.from !== from || move.path.length !== path.length) continue;
    if (move.path.every((sq, i) => sq === path[i])) return move;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Game status
// ---------------------------------------------------------------------------

function countOccurrences(history, value) {
  let count = 0;
  for (const h of history) if (h === value) count += 1;
  return count;
}

/** { over, result: 'white' | 'black' | 'draw' | null, reason } for the current position. */
export function status(pos) {
  const moves = generateMoves(pos);
  if (moves.length === 0) {
    // Unlike chess's stalemate, having no move here is a loss, not a draw:
    // the side to move simply cannot continue, so the other side wins.
    return { over: true, result: pos.turn === 'w' ? 'black' : 'white', reason: 'nomoves' };
  }
  if (pos.halfmove >= 80) {
    return { over: true, result: 'draw', reason: 'progress' };
  }
  if (countOccurrences(pos.history, pos.hash) >= 3) {
    return { over: true, result: 'draw', reason: 'repetition' };
  }
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
