// Perft (performance test, though "correctness test" is the honest name) walks
// the full legal move tree to a fixed depth and counts leaf nodes. The counts
// below are the standard published values for these six positions, so if any
// of them are off, the move generator has a bug somewhere in check detection,
// castling, en passant, or promotion. Divide the counts per root move against
// a known-good breakdown to find which branch is wrong.
//
// The depth-4 and depth-5 cases are slow, so they live behind PERFT_DEEP and
// are skipped by default. Run them with:
//   PERFT_DEEP=1 npx vitest run test/perft.test.js

import { describe, expect, it } from 'vitest';
import { createPosition, perft, START_FEN } from '../src/games/chess/rules.js';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POSITION_3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POSITION_4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POSITION_5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
const POSITION_6 = 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10';

describe('perft: start position', () => {
  it('matches known node counts through depth 3', () => {
    expect(perft(createPosition(START_FEN), 1)).toBe(20);
    expect(perft(createPosition(START_FEN), 2)).toBe(400);
    expect(perft(createPosition(START_FEN), 3)).toBe(8902);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 4', () => {
      expect(perft(createPosition(START_FEN), 4)).toBe(197281);
    });

    it('matches depth 5', () => {
      expect(perft(createPosition(START_FEN), 5)).toBe(4865609);
    });
  });
});

describe('perft: kiwipete', () => {
  it('matches known node counts through depth 3', () => {
    expect(perft(createPosition(KIWIPETE), 1)).toBe(48);
    expect(perft(createPosition(KIWIPETE), 2)).toBe(2039);
    expect(perft(createPosition(KIWIPETE), 3)).toBe(97862);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 4', () => {
      expect(perft(createPosition(KIWIPETE), 4)).toBe(4085603);
    });
  });
});

describe('perft: position 3', () => {
  it('matches known node counts through depth 4', () => {
    expect(perft(createPosition(POSITION_3), 1)).toBe(14);
    expect(perft(createPosition(POSITION_3), 2)).toBe(191);
    expect(perft(createPosition(POSITION_3), 3)).toBe(2812);
    expect(perft(createPosition(POSITION_3), 4)).toBe(43238);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 5', () => {
      expect(perft(createPosition(POSITION_3), 5)).toBe(674624);
    });
  });
});

describe('perft: position 4', () => {
  it('matches known node counts through depth 3', () => {
    expect(perft(createPosition(POSITION_4), 1)).toBe(6);
    expect(perft(createPosition(POSITION_4), 2)).toBe(264);
    expect(perft(createPosition(POSITION_4), 3)).toBe(9467);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 4', () => {
      expect(perft(createPosition(POSITION_4), 4)).toBe(422333);
    });
  });
});

describe('perft: position 5', () => {
  it('matches known node counts through depth 3', () => {
    expect(perft(createPosition(POSITION_5), 1)).toBe(44);
    expect(perft(createPosition(POSITION_5), 2)).toBe(1486);
    expect(perft(createPosition(POSITION_5), 3)).toBe(62379);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 4', () => {
      expect(perft(createPosition(POSITION_5), 4)).toBe(2103487);
    });
  });
});

describe('perft: position 6', () => {
  it('matches known node counts through depth 3', () => {
    expect(perft(createPosition(POSITION_6), 1)).toBe(46);
    expect(perft(createPosition(POSITION_6), 2)).toBe(2079);
    expect(perft(createPosition(POSITION_6), 3)).toBe(89890);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 4', () => {
      expect(perft(createPosition(POSITION_6), 4)).toBe(3894594);
    });
  });
});
