import { describe, expect, it } from 'vitest';
import {
  createPosition,
  toFen,
  generateMoves,
  makeMove,
  unmakeMove,
  status,
  toSAN,
  moveToUci,
  moveFromUci,
  parseSquare,
  START_FEN,
  FLAG,
} from '../src/games/chess/rules.js';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const EN_PASSANT_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function play(pos, uci) {
  return makeMove(pos, moveFromUci(pos, uci));
}

describe('FEN round trip', () => {
  it.each([
    ['start position', START_FEN],
    ['kiwipete', KIWIPETE],
    ['a position with an en passant target', EN_PASSANT_FEN],
  ])('%s survives createPosition -> toFen unchanged', (_label, fen) => {
    expect(toFen(createPosition(fen))).toBe(fen);
  });
});

describe('castling legality', () => {
  // King on e1, rooks on a1 and h1, both rights, nothing else in the way.
  const CLEAR = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1';

  it('is legal on both sides when nothing blocks it and the king is safe', () => {
    const moves = generateMoves(createPosition(CLEAR));
    expect(moves.some((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('g1'))).toBe(true);
    expect(moves.some((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('c1'))).toBe(true);
  });

  it('is blocked by a piece between the king and the rook', () => {
    const moves = generateMoves(createPosition('4k3/8/8/8/8/8/8/R3KB1R w KQ - 0 1'));
    expect(moves.some((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('g1'))).toBe(false);
    expect(moves.some((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('c1'))).toBe(true);
  });

  it('is illegal out of check, on either side', () => {
    // Black rook on e7 pins the king to the e-file.
    const moves = generateMoves(createPosition('4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1'));
    expect(moves.some((m) => m.flags & FLAG.CASTLE)).toBe(false);
  });

  it('is illegal through an attacked square, even with the king itself safe', () => {
    // Black rook on f7 covers f1, which the king must cross to reach g1.
    const moves = generateMoves(createPosition('4k3/5r2/8/8/8/8/8/R3K2R w KQ - 0 1'));
    expect(moves.some((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('g1'))).toBe(false);
    // The queenside path (d1, c1) is untouched by that rook.
    expect(moves.some((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('c1'))).toBe(true);
  });
});

describe('en passant', () => {
  it('is offered the move immediately after a double push', () => {
    const pos = createPosition();
    play(pos, 'e2e4');
    play(pos, 'a7a6');
    play(pos, 'e4e5');
    play(pos, 'd7d5');

    const moves = generateMoves(pos);
    const ep = moves.find((m) => m.flags & FLAG.EP);
    expect(ep).toBeDefined();
    expect(ep.to).toBe(parseSquare('d6'));
  });

  it('disappears once a move is played instead of taking it', () => {
    const pos = createPosition();
    play(pos, 'e2e4');
    play(pos, 'a7a6');
    play(pos, 'e4e5');
    play(pos, 'd7d5');
    play(pos, 'a2a3'); // decline the capture

    const moves = generateMoves(pos);
    expect(moves.some((m) => m.flags & FLAG.EP)).toBe(false);
  });
});

describe('promotion', () => {
  it('generates all four promotion pieces for a pawn reaching the last rank', () => {
    const pos = createPosition('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const promotions = generateMoves(pos).filter(
      (m) => m.from === parseSquare('a7') && m.to === parseSquare('a8')
    );
    expect(promotions).toHaveLength(4);
    expect(promotions.map((m) => m.promotion).sort()).toEqual([2, 3, 4, 5]);
  });
});

describe('makeMove / unmakeMove', () => {
  it('restores the position exactly across 200 random legal moves', () => {
    const pos = createPosition();
    for (let i = 0; i < 200; i++) {
      const moves = generateMoves(pos);
      if (moves.length === 0) break; // game ended on this random walk, nothing left to test

      const move = pickRandom(moves);
      const fenBefore = toFen(pos);
      const hashBefore = pos.hash;
      const historyLengthBefore = pos.history.length;

      const undo = makeMove(pos, move);
      unmakeMove(pos, undo);

      expect(toFen(pos)).toBe(fenBefore);
      expect(pos.hash).toBe(hashBefore);
      expect(pos.history.length).toBe(historyLengthBefore);

      makeMove(pos, move); // commit for real so the walk actually goes somewhere new
    }
  });
});

describe('status', () => {
  it('detects fool\'s mate', () => {
    const pos = createPosition();
    play(pos, 'f2f3');
    play(pos, 'e7e5');
    play(pos, 'g2g4');
    play(pos, 'd8h4');
    expect(status(pos)).toEqual({ over: true, result: 'black', reason: 'checkmate' });
  });

  it('detects stalemate', () => {
    const pos = createPosition('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(status(pos)).toEqual({ over: true, result: 'draw', reason: 'stalemate' });
  });

  it('detects threefold repetition from a knight shuffle', () => {
    const pos = createPosition();
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    for (const uci of shuffle) play(pos, uci); // back to the start: 2nd occurrence
    for (const uci of shuffle) play(pos, uci); // back again: 3rd occurrence
    expect(status(pos)).toEqual({ over: true, result: 'draw', reason: 'repetition' });
  });

  it('detects insufficient material with a lone bishop', () => {
    const pos = createPosition('4k3/8/8/8/8/8/8/4KB2 w - - 0 1');
    expect(status(pos)).toEqual({ over: true, result: 'draw', reason: 'material' });
  });
});

describe('toSAN', () => {
  it('renders a plain pawn push', () => {
    const pos = createPosition();
    const move = moveFromUci(pos, 'e2e4');
    expect(toSAN(pos, move)).toBe('e4');
  });

  it('renders a plain knight development', () => {
    const pos = createPosition();
    const move = moveFromUci(pos, 'g1f3');
    expect(toSAN(pos, move)).toBe('Nf3');
  });

  it('renders a pawn capture', () => {
    const pos = createPosition();
    play(pos, 'e2e4');
    play(pos, 'd7d5');
    const move = moveFromUci(pos, 'e4d5');
    expect(toSAN(pos, move)).toBe('exd5');
  });

  it('renders kingside castling', () => {
    const pos = createPosition('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    const move = generateMoves(pos).find((m) => m.flags & FLAG.CASTLE && m.to === parseSquare('g1'));
    expect(toSAN(pos, move)).toBe('O-O');
  });

  it('renders a checking promotion', () => {
    const pos = createPosition('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
    const move = moveFromUci(pos, 'e7e8q');
    expect(toSAN(pos, move)).toBe('e8=Q+');
  });

  it('disambiguates by file when two knights can reach the same square', () => {
    const pos = createPosition('1n2kn2/8/8/8/8/8/8/4K3 b - - 0 1');
    const move = generateMoves(pos).find(
      (m) => m.from === parseSquare('b8') && m.to === parseSquare('d7')
    );
    expect(toSAN(pos, move)).toBe('Nbd7');
  });

  it('appends # on a mating move', () => {
    const pos = createPosition();
    play(pos, 'f2f3');
    play(pos, 'e7e5');
    play(pos, 'g2g4');
    const mate = moveFromUci(pos, 'd8h4');
    expect(toSAN(pos, mate)).toBe('Qh4#');
  });
});

describe('UCI round trip', () => {
  it('recovers every legal move from the start position through its UCI string', () => {
    const pos = createPosition();
    for (const move of generateMoves(pos)) {
      const found = moveFromUci(pos, moveToUci(move));
      expect(found).toEqual(move);
    }
  });

  it('round trips promotion moves, including the promoted piece letter', () => {
    const pos = createPosition('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    for (const move of generateMoves(pos).filter((m) => m.promotion)) {
      const uci = moveToUci(move);
      expect(uci).toMatch(/^a7a8[qrbn]$/);
      expect(moveFromUci(pos, uci)).toEqual(move);
    }
  });

  it('returns null for a move that is not legal', () => {
    const pos = createPosition();
    expect(moveFromUci(pos, 'e2e5')).toBeNull();
  });
});
