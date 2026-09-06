import { describe, expect, it } from 'vitest';
import { search } from '../src/engine/search.js';

// Tic-tac-toe as the Game interface's toy implementation. Small enough that
// search() can solve it outright (it is a known draw with perfect play),
// which makes it a good stand-in for exercising the engine before chess
// exists: every rule of the interface still applies, there is just a lot
// less of it.

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] !== 0 && board[a] === board[b] && board[b] === board[c]) return board[a];
  }
  return 0;
}

function makeState() {
  return {
    board: new Array(9).fill(0),
    turn: 1, // 1 = X, 2 = O; X moves first
    toString() {
      return this.board.join('') + ':' + this.turn;
    },
  };
}

const ticTacToe = {
  moves(state) {
    if (winner(state.board) !== 0) return [];
    const out = [];
    for (let i = 0; i < 9; i++) if (state.board[i] === 0) out.push({ index: i });
    return out;
  },

  make(state, move) {
    const undo = { index: move.index, mover: state.turn };
    state.board[move.index] = state.turn;
    state.turn = state.turn === 1 ? 2 : 1;
    return undo;
  },

  unmake(state, undo) {
    state.board[undo.index] = 0;
    state.turn = undo.mover;
  },

  // A simple line-counting heuristic. Rarely matters here: the game is small
  // enough that search reaches real terminal states almost everywhere, but
  // evaluate still needs to be a real, side-to-move-relative function.
  evaluate(state) {
    const me = state.turn;
    const opp = me === 1 ? 2 : 1;
    let score = 0;
    for (const line of LINES) {
      const vals = line.map((i) => state.board[i]);
      const mine = vals.filter((v) => v === me).length;
      const theirs = vals.filter((v) => v === opp).length;
      if (mine > 0 && theirs === 0) score += mine;
      else if (theirs > 0 && mine === 0) score -= theirs;
    }
    return score;
  },

  terminal(state) {
    // winner() found a completed line: whoever just moved made it, so the
    // side to move now (state.turn, since make() already flipped it) is the
    // one who lost.
    if (winner(state.board) !== 0) return { result: 'loss' };
    if (state.board.every((c) => c !== 0)) return { result: 'draw' };
    return null;
  },

  hash(state) {
    let h = 0;
    let mult = 1;
    for (let i = 0; i < 9; i++) {
      h += state.board[i] * mult;
      mult *= 3;
    }
    return h * 4 + state.turn;
  },

  isCapture() {
    return false; // no captures in tic-tac-toe
  },

  moveKey(move) {
    return String(move.index);
  },
};

/** Deterministic PRNG (mulberry32) so a "random" test is actually reproducible. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function outcomeFor(state, engineSide) {
  const term = ticTacToe.terminal(state);
  if (!term) return null;
  if (term.result === 'draw') return 'draw';
  return state.turn === engineSide ? 'loss' : 'win';
}

/** Plays one full game, engine (full-depth search) against a random mover. */
function playGame(seed, engineSide) {
  const opponentRng = makeRng(seed);
  const state = makeState();

  for (let ply = 0; ply < 9; ply++) {
    const outcome = outcomeFor(state, engineSide);
    if (outcome) return outcome;

    const legal = ticTacToe.moves(state);
    let move;
    if (state.turn === engineSide) {
      // maxDepth: 9 is enough to fully solve any tic-tac-toe position, so
      // this never needs a time budget and never risks an abort.
      const result = search(ticTacToe, state, { maxDepth: 9, rng: makeRng(seed * 7919 + ply) });
      move = legal.find((m) => ticTacToe.moveKey(m) === result.moveKey);
    } else {
      move = legal[Math.floor(opponentRng() * legal.length)];
    }
    ticTacToe.make(state, move);
  }

  return outcomeFor(state, engineSide);
}

describe('search on tic-tac-toe', () => {
  it('never loses to random play across 200 seeded games, playing both sides', () => {
    for (let seed = 0; seed < 200; seed++) {
      const engineSide = seed % 2 === 0 ? 1 : 2;
      expect(playGame(seed, engineSide)).not.toBe('loss');
    }
  });

  it('finds an immediate winning move', () => {
    const state = makeState();
    // X X . / O O . / . . . -- X to move, wins by taking index 2.
    state.board = [1, 1, 0, 2, 2, 0, 0, 0, 0];
    const result = search(ticTacToe, state, { maxDepth: 9 });
    expect(result.moveKey).toBe('2');
  });

  it('blocks an immediate loss', () => {
    const state = makeState();
    // O O . / X . . / . . X -- X to move, no win available, must block at index 2.
    state.board = [2, 2, 0, 1, 0, 0, 0, 0, 1];
    const result = search(ticTacToe, state, { maxDepth: 9 });
    expect(result.moveKey).toBe('2');
  });

  it('reports a sanity nodes-per-second figure on the opening position', () => {
    const result = search(ticTacToe, makeState(), { maxDepth: 9 });
    expect(result.nodes).toBeGreaterThan(0);
    expect(result.score).toBeCloseTo(0); // tic-tac-toe from the start is a draw with best play (score can land on -0)
    // Not a real assertion, just documents the scale for humans reading test output.
    const nodesPerSecond = result.ms > 0 ? Math.round(result.nodes / (result.ms / 1000)) : Infinity;
    expect(nodesPerSecond).toBeGreaterThan(0);
  });

  it('returns rootScores sorted best first', () => {
    const result = search(ticTacToe, makeState(), { maxDepth: 9 });
    expect(result.rootScores.length).toBe(9);
    for (let i = 1; i < result.rootScores.length; i++) {
      expect(result.rootScores[i - 1].score).toBeGreaterThanOrEqual(result.rootScores[i].score);
    }
  });

  it('balances make/unmake after an aborted search, leaving state untouched', () => {
    const state = makeState();
    const before = state.toString();

    // A fake clock, driven by call count rather than wall time, so this is
    // exact and machine-speed-independent: the first several calls (the
    // "iteration finished, check the deadline" calls after each of the first
    // few depths) read as comfortably before the deadline, then a later call
    // that lands mid-recursion (the periodic every-2048-nodes clock check,
    // once the search is deep enough to have visited that many nodes) reads
    // as past it. That is a genuine abort inside negamax's recursion, not
    // just a clean stop between iterations.
    let calls = 0;
    const fakeNow = () => {
      calls += 1;
      return calls;
    };

    const result = search(ticTacToe, state, { maxDepth: 9, now: fakeNow, timeMs: 12 });

    expect(result.depth).toBeLessThan(9); // cut off before the full solve
    expect(state.toString()).toBe(before); // every make() was undone
  });
});
