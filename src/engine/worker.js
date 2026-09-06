// The engine's Web Worker front end. UI code posts a position and a
// difficulty at it and gets a move back; the actual search never blocks the
// main thread. Games are loaded lazily and by name so a page that only plays
// chess never pays to parse a draughts move generator it will never call.
//
// Protocol, both directions via postMessage:
//   in  { id, type: 'think', game: 'chess', state, level, seed? }
//   out { id, type: 'result', moveKey, score, depth, nodes, ms }
//   in  { id, type: 'cancel' }               -> nothing is posted back for that id
//   out { id, type: 'error', message }       -> on anything going wrong

import { think, LEVELS } from './levels.js';

/** Loaders are lazy so importing this worker does not pull in every game up front. */
const GAMES = {
  chess: () => import('../games/chess/adapter.js'),
};

const gameModules = new Map(); // name -> Promise<module>
const transpositionTables = new Map(); // name -> Map, kept for the worker's whole life
const cancelledIds = new Set(); // ids a 'cancel' message has arrived for

/** Above this many entries a table has outlived its usefulness for the memory it costs. */
const TT_LIMIT = 200_000;

/** Seeded PRNG (mulberry32) so a seeded 'think' request is exactly reproducible in tests. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadGame(name) {
  let pending = gameModules.get(name);
  if (!pending) {
    const loader = GAMES[name];
    if (!loader) throw new Error(`unknown game: ${name}`);
    pending = loader();
    gameModules.set(name, pending);
  }
  return pending;
}

function tableFor(name) {
  let tt = transpositionTables.get(name);
  if (!tt) {
    tt = new Map();
    transpositionTables.set(name, tt);
  }
  return tt;
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'cancel') {
    cancelledIds.add(msg.id);
    return;
  }
  if (msg.type !== 'think') return;

  const { id, game: gameName, state, level, seed } = msg;
  try {
    const mod = await loadGame(gameName);
    const levelConfig = LEVELS[level];
    if (!levelConfig) throw new Error(`unknown level: ${level}`);

    const rng = seed == null ? Math.random : mulberry32(seed);
    const tt = tableFor(gameName);
    const position = mod.createState(state);

    // This is the "flag the clock callback checks" from the spec: once a
    // cancel arrives for this id, time reads as infinitely elapsed, which
    // trips the engine's own deadline check on its next 2048-node tick and
    // unwinds the search exactly like it ran out of time on its own.
    const now = () => (cancelledIds.has(id) ? Infinity : performance.now());

    const result = think(mod.game, position, levelConfig, { rng, now, tt });

    if (tt.size > TT_LIMIT) tt.clear();

    if (cancelledIds.has(id)) {
      cancelledIds.delete(id);
      return;
    }

    self.postMessage({
      id,
      type: 'result',
      moveKey: result.moveKey,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      ms: result.ms,
    });
  } catch (err) {
    cancelledIds.delete(id);
    self.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
