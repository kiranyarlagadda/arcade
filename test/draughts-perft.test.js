// Perft walks the full legal move tree to a fixed depth and counts leaf
// nodes. The counts below are the standard published node counts for
// English draughts from the start position, treating a whole multi-jump as
// one move and enforcing mandatory capture the way this engine does. If any
// of these are off, the bug is in generateMoves (mandatory capture, the
// multi-jump search, or promotion), not in this table.
//
// Depths 8 and 9 are slow, so they live behind PERFT_DEEP and are skipped by
// default. Run them with:
//   PERFT_DEEP=1 npx vitest run test/draughts-perft.test.js

import { describe, expect, it } from 'vitest';
import { createPosition, perft, START_FEN } from '../src/games/draughts/rules.js';

describe('perft: start position', () => {
  it('matches known node counts through depth 7', () => {
    expect(perft(createPosition(START_FEN), 1)).toBe(7);
    expect(perft(createPosition(START_FEN), 2)).toBe(49);
    expect(perft(createPosition(START_FEN), 3)).toBe(302);
    expect(perft(createPosition(START_FEN), 4)).toBe(1469);
    expect(perft(createPosition(START_FEN), 5)).toBe(7361);
    expect(perft(createPosition(START_FEN), 6)).toBe(36768);
    expect(perft(createPosition(START_FEN), 7)).toBe(179740);
  });

  describe.skipIf(!process.env.PERFT_DEEP)('deep', () => {
    it('matches depth 8', () => {
      expect(perft(createPosition(START_FEN), 8)).toBe(845931);
    });

    it('matches depth 9', () => {
      expect(perft(createPosition(START_FEN), 9)).toBe(3963680);
    });
  });
});
