// A game-agnostic negamax search with alpha-beta pruning, iterative deepening,
// and a transposition table. It never touches a board directly: everything it
// knows about the game it is searching comes through the Game interface
// documented below, so the same engine drives chess, draughts, or whatever
// else plugs in next. Keep it that way. If you need to special-case a rule
// here, the special case belongs in the game's adapter instead.
//
// Game interface (an object, not a class):
//   moves(state)      -> Move[]                    legal moves, empty when the game is over
//   make(state, move)  -> undo                       mutates state, returns an undo record
//   unmake(state, undo)                              restores state from the undo record
//   evaluate(state)   -> number                     centipawn-ish score, from the side to move's view
//   terminal(state)   -> null | { result }          result is 'win' | 'loss' | 'draw', from the side to move's view
//   hash(state)       -> number                     transposition table key
//   isCapture(move)   -> boolean                    used for move ordering and quiescence
//   moveKey(move)     -> string                     stable move identity, used for TT lookups and reporting

/** Large enough that no real evaluation ever collides with a mate score, small enough to stay a safe int32. */
export const MATE = 1_000_000;

/**
 * Shuffle in place with Fisher-Yates, using the supplied rng. This is the
 * only place randomness touches the search: it breaks ties between root
 * moves that end up with equal scores, so the engine does not always play
 * the first equally-good move it happened to generate. Given the same rng
 * sequence the shuffle is exactly reproducible.
 * @param {any[]} arr
 * @param {() => number} rng
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

/**
 * Order moves in place: the transposition table's best move first, then
 * captures, then everything else in whatever order they arrived in. There is
 * no generic MVV-LVA (the engine does not know what a piece is worth), so
 * "captures before quiet moves" is as far as ordering goes without help from
 * the game itself.
 * @param {any[]} moves
 * @param {string | null} ttMoveKey
 * @param {object} game
 */
function orderMoves(moves, ttMoveKey, game) {
  const tagged = moves.map((move, i) => {
    let rank = 2;
    if (ttMoveKey !== null && game.moveKey(move) === ttMoveKey) rank = 0;
    else if (game.isCapture(move)) rank = 1;
    return { move, i, rank };
  });
  tagged.sort((a, b) => a.rank - b.rank || a.i - b.i);
  for (let i = 0; i < moves.length; i++) moves[i] = tagged[i].move;
}

/** Checks the wall clock and flips ctx.aborted once the deadline has passed. */
function checkClock(ctx) {
  if (!ctx.aborted && ctx.now() >= ctx.deadline) ctx.aborted = true;
}

/**
 * Captures-only search from a quiet-search leaf, so the static evaluation at
 * the bottom of the main search is not fooled by a position sitting in the
 * middle of a trade. Stand-pat gives the side to move the option of not
 * capturing at all, which is what keeps this from exploding into a full-width
 * search. Capped at 8 plies so a long forced capture chain cannot run away
 * with the whole time budget.
 */
function quiescence(game, state, alpha, beta, ply, qDepth, ctx) {
  ctx.nodes++;
  if (ctx.nodes % 2048 === 0) checkClock(ctx);
  if (ctx.aborted) return 0;

  const term = game.terminal(state);
  if (term) return terminalScore(term, ply);

  const standPat = game.evaluate(state);
  if (qDepth >= 8) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const captures = game.moves(state).filter((m) => game.isCapture(m));
  for (const move of captures) {
    const undo = game.make(state, move);
    const score = -quiescence(game, state, -beta, -alpha, ply + 1, qDepth + 1, ctx);
    game.unmake(state, undo);
    if (ctx.aborted) return 0;

    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

/** A 'loss' further away is preferred to one sooner, so mate distance is baked into the score. */
function terminalScore(term, ply) {
  if (term.result === 'loss') return -(MATE - ply);
  if (term.result === 'win') return MATE - ply;
  return 0;
}

/**
 * Negamax with alpha-beta pruning and a transposition table. Returns the
 * score of `state` from the point of view of the side to move, at the given
 * depth. Balances every make() with an unmake() even when the clock aborts
 * the search partway through, so the caller's state is never left mutated.
 */
function negamax(game, state, depth, alpha, beta, ply, ctx) {
  ctx.nodes++;
  if (ctx.nodes % 2048 === 0) checkClock(ctx);
  if (ctx.aborted) return 0;

  const term = game.terminal(state);
  if (term) return terminalScore(term, ply);

  if (depth <= 0) {
    return ctx.quiescence ? quiescence(game, state, alpha, beta, ply, 0, ctx) : game.evaluate(state);
  }

  const alphaOrig = alpha;
  const hashKey = game.hash(state);
  const ttEntry = ctx.tt.get(hashKey);
  let ttMoveKey = null;
  if (ttEntry) {
    ttMoveKey = ttEntry.bestKey ?? null;
    if (ttEntry.depth >= depth) {
      if (ttEntry.flag === 'exact') return ttEntry.score;
      if (ttEntry.flag === 'lower' && ttEntry.score > alpha) alpha = ttEntry.score;
      else if (ttEntry.flag === 'upper' && ttEntry.score < beta) beta = ttEntry.score;
      if (alpha >= beta) return ttEntry.score;
    }
  }

  const moves = game.moves(state);
  if (moves.length === 0) {
    // The contract says moves() is only empty when terminal() already caught
    // the game being over. If a game implementation slips up, fall back to a
    // static eval rather than let an infinite score leak into the TT.
    return game.evaluate(state);
  }
  orderMoves(moves, ttMoveKey, game);

  let bestScore = -Infinity;
  let bestKey = null;
  for (const move of moves) {
    const undo = game.make(state, move);
    const score = -negamax(game, state, depth - 1, -beta, -alpha, ply + 1, ctx);
    game.unmake(state, undo);
    if (ctx.aborted) return 0;

    if (score > bestScore) {
      bestScore = score;
      bestKey = game.moveKey(move);
    }
    if (bestScore > alpha) alpha = bestScore;
    if (alpha >= beta) break;
  }

  let flag = 'exact';
  if (bestScore <= alphaOrig) flag = 'upper';
  else if (bestScore >= beta) flag = 'lower';
  ctx.tt.set(hashKey, { depth, score: bestScore, flag, bestKey });

  return bestScore;
}

/**
 * One full-width root search at a fixed depth. Returns null if the clock cut
 * it off partway, so the caller knows to discard it and keep the previous
 * (fully completed) iteration instead. `ctx.partial` is kept up to date move
 * by move, purely as a last-resort fallback for the pathological case where
 * even depth 1 cannot finish.
 */
function searchRoot(game, state, depth, ctx) {
  const moves = game.moves(state);
  const hashKey = game.hash(state);
  const ttEntry = ctx.tt.get(hashKey);
  const ttMoveKey = ttEntry?.bestKey ?? null;

  shuffle(moves, ctx.rng);
  orderMoves(moves, ttMoveKey, game);

  const alphaStart = -Infinity;
  const beta = Infinity;
  let alpha = alphaStart;
  const rootScores = [];
  let bestScore = -Infinity;
  let bestMove = null;
  let bestMoveKey = null;

  for (const move of moves) {
    const undo = game.make(state, move);
    const score = -negamax(game, state, depth - 1, -beta, -alpha, 1, ctx);
    game.unmake(state, undo);
    if (ctx.aborted) return null;

    const moveKey = game.moveKey(move);
    rootScores.push({ move, moveKey, score });
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      bestMoveKey = moveKey;
    }
    if (bestScore > alpha) alpha = bestScore;

    ctx.partial = {
      move: bestMove,
      moveKey: bestMoveKey,
      score: bestScore,
      rootScores: [...rootScores].sort((a, b) => b.score - a.score),
    };
  }

  rootScores.sort((a, b) => b.score - a.score);
  if (hashKey !== undefined) {
    let flag = 'exact';
    if (bestScore <= alphaStart) flag = 'upper';
    ctx.tt.set(hashKey, { depth, score: bestScore, flag, bestKey: bestMoveKey });
  }
  return { move: bestMove, moveKey: bestMoveKey, score: bestScore, rootScores };
}

/**
 * Search `state` for the best move, iterative deepening from depth 1 until
 * either the time budget runs out or `maxDepth` is reached.
 * @param {object} game a Game implementation, see the module comment
 * @param {*} state the position to search from; never mutated on return
 * @param {{
 *   timeMs?: number,
 *   maxDepth?: number,
 *   quiescence?: boolean,
 *   tt?: Map<number, object>,
 *   rng?: () => number,
 *   now?: () => number,
 *   onIteration?: (result: object) => void,
 * }} options
 * @returns {{ move: *, moveKey: string | null, score: number, depth: number, nodes: number, ms: number, rootScores: {move: *, moveKey: string, score: number}[] }}
 */
export function search(game, state, options = {}) {
  const {
    timeMs,
    maxDepth = 64,
    quiescence: useQuiescence = false,
    tt = new Map(),
    rng = Math.random,
    now = () => performance.now(),
    onIteration,
  } = options;

  const startTime = now();
  const deadline = timeMs == null ? Infinity : startTime + timeMs;
  const ctx = { tt, rng, now, deadline, quiescence: useQuiescence, nodes: 0, aborted: false, partial: null };

  const term = game.terminal(state);
  if (term) {
    return { move: null, moveKey: null, score: terminalScore(term, 0), depth: 0, nodes: 0, ms: now() - startTime, rootScores: [] };
  }

  let best = null;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const result = searchRoot(game, state, depth, ctx);
    if (result === null) break; // clock cut this iteration off; keep whatever `best` already holds
    best = { ...result, depth };
    if (onIteration) onIteration({ ...best, nodes: ctx.nodes, ms: now() - startTime });
    if (now() >= deadline) break;
  }

  // Only possible if depth 1 itself never finished (an absurdly small time
  // budget, or a runaway branching factor). Fall back to the partial root
  // scan so the caller always gets a legal move back rather than nothing.
  if (best === null) {
    if (ctx.partial && ctx.partial.move) {
      best = { ...ctx.partial, depth: 1 };
    } else {
      // Not even one root move finished. Any legal move beats no move.
      const moves = game.moves(state);
      const move = moves[0] ?? null;
      const moveKey = move ? game.moveKey(move) : null;
      best = { move, moveKey, score: 0, depth: 0, rootScores: move ? [{ move, moveKey, score: 0 }] : [] };
    }
  }

  return { ...best, nodes: ctx.nodes, ms: now() - startTime };
}
