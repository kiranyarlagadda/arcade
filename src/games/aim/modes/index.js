// Modes are a small registry rather than a switch statement scattered through
// the game, so adding one is: write a file, add it here.
//
// A mode exports:
//   id, title           - identity
//   liveCount           - how many targets this mode likes to keep live by default
//   layout(w, h)         - { arena, cells? } for the current canvas size
//   spawn({ arena, cells, live, radius, rng, lastCleared }) -> { x, y, r, cell? }
//
// spawn must be pure: no Math.random, no reading the DOM. The rng is injected
// so tests can seed it and assert on exact placement.

import { classic } from './classic.js';
import { freeshot } from './freeshot.js';

export const MODES = { classic, freeshot };
