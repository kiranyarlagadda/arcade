import { describe, expect, it } from 'vitest';
import {
  createPosition,
  toFen,
  generateMoves,
  makeMove,
  unmakeMove,
  status,
  moveToStr,
  moveFromStr,
  parseSquare,
  colorOf,
  typeOf,
  PIECE,
  START_FEN,
} from '../src/games/draughts/rules.js';
import { search } from '../src/engine/search.js';
import { createState, game } from '../src/games/draughts/adapter.js';

const MIXED_KINGS_FEN = 'W:Wa1,Kc3,Ke7:Bb6,Kd8,h8';

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function play(pos, str) {
  return makeMove(pos, moveFromStr(pos, str));
}

describe('FEN round trip', () => {
  it.each([
    ['start position', START_FEN],
    ['a mixed kings and men position', MIXED_KINGS_FEN],
  ])('%s survives createPosition -> toFen unchanged', (_label, fen) => {
    expect(toFen(createPosition(fen))).toBe(fen);
  });
});

describe('piece encoding', () => {
  it('reads color and type off a code the way the frozen API describes', () => {
    expect(colorOf(PIECE.MAN)).toBe('w');
    expect(colorOf(PIECE.MAN + 8)).toBe('b');
    expect(typeOf(PIECE.KING + 8)).toBe(PIECE.KING);
  });
});

describe('men move only forward, kings move backward too', () => {
  it('gives a white man only its two forward diagonals', () => {
    // d4 with every neighbour empty: b2/f2 behind it, b6/f6/... ahead. Only
    // the two ahead (c5, e5) should ever show up for a man.
    const pos = createPosition('W:Wd4:B');
    const moves = generateMoves(pos);
    const targets = moves.map((m) => m.to).sort();
    expect(targets).toEqual([parseSquare('c5'), parseSquare('e5')].sort());
  });

  it('gives a black man only its two forward diagonals, the other way', () => {
    const pos = createPosition('B:W:Be5');
    const moves = generateMoves(pos);
    const targets = moves.map((m) => m.to).sort();
    expect(targets).toEqual([parseSquare('d4'), parseSquare('f4')].sort());
  });

  it('gives a king all four diagonals', () => {
    const pos = createPosition('W:WKd4:B');
    const moves = generateMoves(pos);
    const targets = moves.map((m) => m.to).sort();
    expect(targets).toEqual(['c3', 'c5', 'e3', 'e5'].map(parseSquare).sort());
  });
});

describe('mandatory capture', () => {
  it('removes every slide from the move list once any capture exists', () => {
    // White man on c3 can slide to b4/d4, but it can also jump the black man
    // on d4 landing on e5. Only the capture may be played.
    const pos = createPosition('W:Wc3,g3:Bd4');
    const moves = generateMoves(pos);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toHaveLength(1);
    expect(moves[0].to).toBe(parseSquare('e5'));
  });

  it('applies across the whole board, not just the piece that can slide', () => {
    // The man on g3 has no capture of its own, but a3's capture of b4 still
    // rules out every slide anywhere on the board, g3's included.
    const pos = createPosition('W:Wa3,g3:Bb4');
    const moves = generateMoves(pos);
    expect(moves.every((m) => m.captures.length > 0)).toBe(true);
    expect(moves.some((m) => m.from === parseSquare('g3'))).toBe(false);
  });
});

describe('multi-jump', () => {
  it('is one move covering the full path and every captured square', () => {
    // The spec's own example: a3 jumps b4 to c5, then jumps d6 to e7.
    const pos = createPosition('W:Wa3:Bb4,d6');
    const moves = generateMoves(pos);
    expect(moves).toHaveLength(1);

    const move = moves[0];
    expect(move.from).toBe(parseSquare('a3'));
    expect(move.to).toBe(parseSquare('e7'));
    expect(move.path).toEqual([parseSquare('c5'), parseSquare('e7')]);
    expect(move.captures).toEqual([parseSquare('b4'), parseSquare('d6')]);
    expect(moveToStr(move)).toBe('a3xc5xe7');
  });

  it('cannot stop early while a further jump is still available', () => {
    // Same position: landing on c5 with d6 still capturable means c5 is not
    // itself a legal move, only the full sequence to e7 is.
    const pos = createPosition('W:Wa3:Bb4,d6');
    const moves = generateMoves(pos);
    expect(moves.some((m) => m.to === parseSquare('c5'))).toBe(false);
  });

  it('may choose either branch when more than one continuation exists', () => {
    // King on d4 can jump c5 (landing b6) or e5 (landing f6); each is its
    // own complete move since neither branch has a further jump.
    const pos = createPosition('W:WKd4:Bc5,e5');
    const moves = generateMoves(pos);
    const destinations = moves.map((m) => m.to).sort();
    expect(destinations).toEqual([parseSquare('b6'), parseSquare('f6')].sort());
  });
});

describe('a captured piece blocks the square it stands on until the sequence ends', () => {
  it('cannot be jumped a second time, and the search does not loop over it', () => {
    // A naive search that removes the jumped piece immediately, or that
    // never tracks what it has already captured this sequence, can bounce a
    // king back and forth over the same piece (c3 -> e5 -> c3 -> e5 -> ...)
    // forever, since e5 -> c3 looks like a fresh, legal jump over d4 every
    // time. There is exactly one legal move here.
    const pos = createPosition('W:WKc3:Bd4');
    const moves = generateMoves(pos);
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toBe(parseSquare('e5'));
    expect(moves[0].captures).toEqual([parseSquare('d4')]);
  });

  it('chains correctly when the same piece has two enemies to capture in a row', () => {
    // King at a1 jumps b2 landing c3, then jumps d4 landing e5. b2 is still
    // sitting on the board (occupied) the whole time this runs, and the
    // sequence still finds its way past it to the second piece without
    // trying to recapture it.
    const pos = createPosition('W:WKa1:Bb2,d4');
    const moves = generateMoves(pos);
    expect(moves).toHaveLength(1);
    expect(moves[0].path).toEqual([parseSquare('c3'), parseSquare('e5')]);
    expect(moves[0].captures).toEqual([parseSquare('b2'), parseSquare('d4')]);
  });
});

describe('promotion', () => {
  it('turns a man into a king when it reaches the far rank', () => {
    // c7's two forward diagonals, b8 and d8, both sit on the last rank, so
    // every move here should promote.
    const pos = createPosition('W:Wc7:B');
    const moves = generateMoves(pos);
    expect(moves.every((m) => m.promotion)).toBe(true);

    const move = moves[0];
    makeMove(pos, move);
    expect(typeOf(pos.board[move.to])).toBe(PIECE.KING);
  });

  it('ends the capture sequence on promotion even though the new king could jump on', () => {
    // c6 jumps d7 landing on e8 (promotion). From e8 a king could then jump
    // f7 to land on g6, but the move must end at e8 regardless.
    const pos = createPosition('W:Wc6:Bd7,f7');
    const moves = generateMoves(pos);
    expect(moves).toHaveLength(1);

    const move = moves[0];
    expect(move.to).toBe(parseSquare('e8'));
    expect(move.promotion).toBe(true);
    expect(move.captures).toEqual([parseSquare('d7')]);

    makeMove(pos, move);
    expect(typeOf(pos.board[parseSquare('e8')])).toBe(PIECE.KING);
    expect(pos.board[parseSquare('f7')]).not.toBe(0); // never captured, the move ended before it
  });
});

describe('makeMove / unmakeMove', () => {
  it('restores board, hash, halfmove, and history exactly over 300 random legal moves', () => {
    const pos = createPosition();
    for (let i = 0; i < 300; i++) {
      const moves = generateMoves(pos);
      if (moves.length === 0) break; // the random walk ended the game, nothing left to test

      const move = pickRandom(moves);
      const fenBefore = toFen(pos);
      const hashBefore = pos.hash;
      const halfmoveBefore = pos.halfmove;
      const historyBefore = pos.history.slice();

      const undo = makeMove(pos, move);
      unmakeMove(pos, undo);

      expect(toFen(pos)).toBe(fenBefore);
      expect(pos.hash).toBe(hashBefore);
      expect(pos.halfmove).toBe(halfmoveBefore);
      expect(pos.history).toEqual(historyBefore);

      makeMove(pos, move); // commit for real so the walk actually goes somewhere new
    }
  });
});

describe('status', () => {
  it('is a loss for the side to move when it has no legal move', () => {
    // White man boxed into the a1 corner: b2 is occupied so it cannot slide,
    // and c3 is occupied so it cannot capture over b2 either.
    const pos = createPosition('W:Wa1:Bb2,c3');
    expect(generateMoves(pos)).toHaveLength(0);
    expect(status(pos)).toEqual({ over: true, result: 'black', reason: 'nomoves' });
  });

  it('detects threefold repetition from a king shuffle', () => {
    // Opposite corners so the two kings are never anywhere near capture
    // range of each other; each only has one square to shuffle to and back.
    const start = createPosition('W:WKa1:BKh8');
    const cycle = ['a1-b2', 'h8-g7', 'b2-a1', 'g7-h8'];
    for (const str of cycle) play(start, str); // back to the start position: 2nd occurrence
    for (const str of cycle) play(start, str); // back again: 3rd occurrence
    expect(status(start)).toEqual({ over: true, result: 'draw', reason: 'repetition' });
  });

  it('is a draw after 80 plies without a capture or a man move', () => {
    const pos = createPosition('W:WKc3:BKf6');
    pos.halfmove = 79;
    play(pos, 'c3-d4'); // a quiet king move: halfmove becomes 80
    expect(status(pos)).toEqual({ over: true, result: 'draw', reason: 'progress' });
  });
});

describe('moveToStr / moveFromStr', () => {
  it('round trips every legal move from the start position', () => {
    const pos = createPosition();
    for (const move of generateMoves(pos)) {
      const found = moveFromStr(pos, moveToStr(move));
      expect(found).toEqual(move);
    }
  });

  it('round trips a multi-jump capture string', () => {
    const pos = createPosition('W:Wa3:Bb4,d6');
    const move = generateMoves(pos)[0];
    expect(moveToStr(move)).toBe('a3xc5xe7');
    expect(moveFromStr(pos, 'a3xc5xe7')).toEqual(move);
  });

  it('returns null for a string that names no legal move', () => {
    const pos = createPosition();
    expect(moveFromStr(pos, 'a3xb4xc5')).toBeNull();
  });
});

describe('engine search', () => {
  it('returns a legal move and never mutates the position', () => {
    const pos = createState();
    const fenBefore = toFen(pos);
    const result = search(game, pos, { timeMs: 300 });

    expect(toFen(pos)).toBe(fenBefore);
    expect(result.move).not.toBeNull();

    const legal = generateMoves(pos);
    expect(legal.some((m) => moveToStr(m) === moveToStr(result.move))).toBe(true);
  });
});
