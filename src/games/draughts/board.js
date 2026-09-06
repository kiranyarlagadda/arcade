// Pure rendering: build the board's SVG tree and keep it in sync with
// whatever state index.js hands it. Nothing in here knows a rule of draughts
// and it owns no event listener beyond the timers it schedules for its own
// animation; index.js is the one place that reads pointer events and the
// rules engine and turns them into calls on the object this file returns.
//
// I kept this as its own file rather than stretching chess/board.js to
// cover both games. The two boards agree on the big picture (800x800 SVG,
// slate squares, coordinates, orientation flip) but disagree on enough
// specifics, only the dark half of the board is playable, discs are round
// and sit at 84% of the square rather than filling it, and a move can be a
// multi-hop chain that slides through several squares before it is done,
// that folding them into one file would have meant more branching than
// sharing. Every existing chess test still passes unchanged because chess's
// board.js was never touched.

import { squareName, parseSquare } from './rules.js';
import { PIECE_SYMBOLS, symbolId } from './pieces.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const BOARD_PX = 800;
export const SQUARE_PX = 100;
export const DISC_PX = SQUARE_PX * 0.84;

// Copied straight from design/tokens.css, same reasoning as chess/board.js:
// these are SVG presentation attributes, and tokens.css is a design-time
// file that never ships with the package.
const COLORS = {
  sqLight: '#3b4459',
  sqDark: '#242b3c',
  lastMove: 'rgba(255,180,84,.28)',
  selected: '#ffb454',
  legal: '#5eead4',
  capture: '#ff5c7a',
  dim: 'rgba(4,5,10,.35)',
};

const HOP_MS = 120;
const CAPTURE_FLASH_MS = 180;

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  }
  return node;
}

// The four disc symbols only need to exist once per page, not once per
// board, mirroring chess/board.js's ensurePieceDefs and arcade-game.js's own
// ensureBaseStyle: never torn back down when a game is disposed.
let defsReady = false;
function ensurePieceDefs() {
  if (defsReady || document.getElementById('draughts-piece-defs')) {
    defsReady = true;
    return;
  }
  defsReady = true;
  const holder = svgEl('svg', { id: 'draughts-piece-defs', 'aria-hidden': 'true' });
  holder.style.position = 'absolute';
  holder.style.width = '0';
  holder.style.height = '0';
  holder.style.overflow = 'hidden';
  const defs = svgEl('defs');
  defs.innerHTML = PIECE_SYMBOLS;
  holder.appendChild(defs);
  document.body.appendChild(holder);
}

/**
 * Build a fresh board and return the handle index.js drives it with.
 * @returns {object}
 */
export function createBoard() {
  ensurePieceDefs();

  const svg = svgEl('svg', { viewBox: `0 0 ${BOARD_PX} ${BOARD_PX}` });
  svg.classList.add('draughts-board');

  const squaresLayer = svgEl('g');
  const lastMoveLayer = svgEl('g');
  const selectedLayer = svgEl('g');
  const coordsLayer = svgEl('g');
  const piecesLayer = svgEl('g');
  const captureFlashLayer = svgEl('g');
  const markersLayer = svgEl('g');
  const dimLayer = svgEl('g');
  svg.append(
    squaresLayer,
    lastMoveLayer,
    selectedLayer,
    coordsLayer,
    piecesLayer,
    captureFlashLayer,
    markersLayer,
    dimLayer,
  );

  // Decoration only, never a click target: without this a teal move dot
  // would eat the click meant for the square underneath it.
  for (const layer of [lastMoveLayer, selectedLayer, coordsLayer, captureFlashLayer, markersLayer, dimLayer]) {
    layer.style.pointerEvents = 'none';
  }

  let orientation = 'white';
  let coordsOn = true;
  const squareEls = new Map(); // square index -> <rect>
  const pieceEls = new Map(); // square index -> <use> currently sitting there

  // Every setTimeout this board schedules for itself (a hop, a capture
  // flash) is tracked here so dispose() can cancel whatever has not fired
  // yet, same audit chess/board.js runs for its rAF ids.
  const pendingTimers = new Set();
  function scheduleTimer(fn, ms) {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      fn();
    }, ms);
    pendingTimers.add(id);
    return id;
  }

  const pendingFrames = new Set();
  function clearTransitionSoon(use) {
    if (!use) return;
    const id = requestAnimationFrame(() => {
      pendingFrames.delete(id);
      use.style.transition = '';
    });
    pendingFrames.add(id);
  }

  function withoutAnimating(use, fn) {
    use.style.transition = 'none';
    fn();
    clearTransitionSoon(use);
  }

  function colRow(sq) {
    const file = sq & 7;
    const rank = sq >> 4;
    const col = orientation === 'white' ? file : 7 - file;
    const row = orientation === 'white' ? 7 - rank : rank;
    return { col, row };
  }

  function xy(sq) {
    const { col, row } = colRow(sq);
    return { x: col * SQUARE_PX, y: row * SQUARE_PX };
  }

  function isDark(file, rank) {
    return (file + rank) % 2 === 0;
  }

  function buildSquares() {
    squaresLayer.replaceChildren();
    coordsLayer.replaceChildren();
    squareEls.clear();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = rank * 16 + file;
        const { x, y } = xy(sq);
        const { col, row } = colRow(sq);
        const dark = isDark(file, rank);
        const rect = svgEl('rect', {
          x, y, width: SQUARE_PX, height: SQUARE_PX,
          fill: dark ? COLORS.sqDark : COLORS.sqLight,
        });
        rect.classList.add('draughts-square');
        if (dark) rect.classList.add('draughts-square-dark');
        rect.dataset.square = squareName(sq);
        squaresLayer.appendChild(rect);
        squareEls.set(sq, rect);

        if (row === 7) {
          const label = svgEl('text', { x: x + SQUARE_PX - 8, y: y + SQUARE_PX - 8, 'text-anchor': 'end' });
          label.classList.add('draughts-coord');
          label.textContent = String.fromCharCode(97 + file);
          coordsLayer.appendChild(label);
        }
        if (col === 0) {
          const label = svgEl('text', { x: x + 8, y: y + 18 });
          label.classList.add('draughts-coord');
          label.textContent = String(rank + 1);
          coordsLayer.appendChild(label);
        }
      }
    }
    coordsLayer.style.display = coordsOn ? '' : 'none';
  }

  buildSquares();

  function placeAt(use, sq) {
    const { x, y } = xy(sq);
    const inset = (SQUARE_PX - DISC_PX) / 2;
    use.setAttribute('transform', `translate(${x + inset},${y + inset})`);
    use.dataset.square = squareName(sq);
  }

  function createPieceAt(sq, code) {
    const use = svgEl('use', { width: DISC_PX, height: DISC_PX });
    use.classList.add('draughts-piece');
    const id = symbolId(code);
    use.setAttribute('href', `#${id}`);
    use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${id}`);
    use.dataset.piece = id;
    placeAt(use, sq);
    piecesLayer.appendChild(use);
    pieceEls.set(sq, use);
    withoutAnimating(use, () => {}); // the initial placement should never transition in
    return use;
  }

  /** Slide `use` through `path` one hop at a time, 120ms per hop (instant
   * under reduced motion), then call `onDone`. Purely cosmetic: whatever
   * called this has already updated the bookkeeping this board relies on. */
  function animateHops(use, path, onDone) {
    const hopMs = prefersReducedMotion() ? 0 : HOP_MS;
    let i = 0;
    function step() {
      if (i >= path.length) {
        onDone?.();
        return;
      }
      placeAt(use, path[i]);
      i++;
      scheduleTimer(step, hopMs);
    }
    step();
  }

  function flashCapture(sq) {
    const { x, y } = xy(sq);
    const rect = svgEl('rect', { x, y, width: SQUARE_PX, height: SQUARE_PX, fill: COLORS.capture, opacity: 0.55 });
    captureFlashLayer.appendChild(rect);
    scheduleTimer(() => rect.remove(), CAPTURE_FLASH_MS);
  }

  /**
   * Reconcile the board to `pos`. `moved`, when given, is the move that
   * produced this position: `{ from, to, path, captures, promotion }`
   * straight off rules.js's Move shape. The moving disc slides through
   * `path`; every captured square gets its piece removed and a brief flash;
   * a promotion swaps the symbol once the slide lands. Mount, game.load,
   * and restart all call this with no `moved` at all, which is exactly
   * right for them: there is no single move to animate, only a position to
   * show.
   */
  function setPosition(pos, moved) {
    let skipSquare = null;

    if (moved) {
      const use = pieceEls.get(moved.from);
      if (use) {
        pieceEls.delete(moved.from);
        pieceEls.set(moved.to, use);
        skipSquare = moved.to;
        animateHops(use, moved.path, () => {
          const code = pos.board[moved.to];
          if (code && symbolId(code) !== use.dataset.piece) {
            use.remove();
            pieceEls.delete(moved.to);
            createPieceAt(moved.to, code);
          }
        });
      }
      for (const capSq of moved.captures ?? []) flashCapture(capSq);
    }

    const wanted = new Map();
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const code = pos.board[sq];
      if (code) wanted.set(sq, code);
    }

    // Catches everything the fast path above did not handle: a captured
    // piece disappearing, a load/restart with no `moved` at all. The piece
    // mid-slide is left alone, its own animation callback settles it.
    for (const [sq, use] of [...pieceEls]) {
      if (sq === skipSquare) continue;
      const code = wanted.get(sq);
      if (code === undefined || symbolId(code) !== use.dataset.piece) {
        use.remove();
        pieceEls.delete(sq);
      }
    }
    for (const [sq, code] of wanted) {
      if (pieceEls.has(sq)) continue;
      createPieceAt(sq, code);
    }
  }

  function setOrientation(color) {
    orientation = color === 'black' ? 'black' : 'white';
    buildSquares();
    // A flip is not a move worth animating: every piece just reappears at
    // its new screen position.
    for (const [sq, use] of pieceEls) withoutAnimating(use, () => placeAt(use, sq));
  }

  function setCoords(on) {
    coordsOn = !!on;
    coordsLayer.style.display = coordsOn ? '' : 'none';
  }

  function setSelected(sq) {
    selectedLayer.replaceChildren();
    if (sq == null) return;
    const { x, y } = xy(sq);
    selectedLayer.appendChild(
      svgEl('rect', {
        x: x + 3, y: y + 3, width: SQUARE_PX - 6, height: SQUARE_PX - 6,
        fill: 'none', stroke: COLORS.selected, 'stroke-width': 3,
      }),
    );
  }

  /** @param {number[]} squares every square that is a legal next step from whatever is selected */
  function setLegalTargets(squares) {
    markersLayer.replaceChildren();
    for (const sq of squares) {
      const { x, y } = xy(sq);
      const dot = svgEl('circle', { cx: x + SQUARE_PX / 2, cy: y + SQUARE_PX / 2, r: 13, fill: COLORS.legal });
      dot.classList.add('draughts-target');
      dot.dataset.square = squareName(sq);
      markersLayer.appendChild(dot);
    }
  }

  function setLastMove(from, to) {
    lastMoveLayer.replaceChildren();
    if (from == null || to == null) return;
    for (const sq of [from, to]) {
      const { x, y } = xy(sq);
      lastMoveLayer.appendChild(svgEl('rect', { x, y, width: SQUARE_PX, height: SQUARE_PX, fill: COLORS.lastMove }));
    }
  }

  function setDimmed(on) {
    dimLayer.replaceChildren();
    if (!on) return;
    dimLayer.appendChild(svgEl('rect', { x: 0, y: 0, width: BOARD_PX, height: BOARD_PX, fill: COLORS.dim }));
  }

  function squareElement(sq) {
    return squareEls.get(sq);
  }

  function pieceElement(sq) {
    return pieceEls.get(sq);
  }

  /** Resolve a pointer event's target back to a square index, or -1. */
  function squareFromTarget(target) {
    const el = target && typeof target.closest === 'function' ? target.closest('[data-square]') : null;
    return el ? parseSquare(el.dataset.square) : -1;
  }

  /** Client coordinates -> this board's own 0..800 user-unit space, for drag. */
  function pointToBoard(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD_PX,
      y: ((clientY - rect.top) / rect.height) * BOARD_PX,
    };
  }

  function squareFromBoardPoint(x, y) {
    const col = Math.floor(x / SQUARE_PX);
    const row = Math.floor(y / SQUARE_PX);
    if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
    const file = orientation === 'white' ? col : 7 - col;
    const rank = orientation === 'white' ? 7 - row : row;
    return rank * 16 + file;
  }

  /** Lift a piece out of document flow visually (front of the pieces layer) for dragging. */
  function raiseToFront(sq) {
    const use = pieceEls.get(sq);
    if (use) piecesLayer.appendChild(use);
  }

  /** Follow the pointer during a drag. Never transitions: the pointer already supplies the motion. */
  function dragTo(sq, boardX, boardY) {
    const use = pieceEls.get(sq);
    if (!use) return;
    use.style.transition = 'none';
    use.setAttribute('transform', `translate(${boardX - DISC_PX / 2},${boardY - DISC_PX / 2})`);
  }

  /** Snap a piece back to its own square, instantly, e.g. an aborted drag. */
  function snapTo(sq) {
    const use = pieceEls.get(sq);
    if (!use) return;
    withoutAnimating(use, () => placeAt(use, sq));
  }

  /** Cancel every timer and frame this board still has scheduled. Safe to call once, on teardown. */
  function dispose() {
    for (const id of pendingTimers) clearTimeout(id);
    pendingTimers.clear();
    for (const id of pendingFrames) cancelAnimationFrame(id);
    pendingFrames.clear();
  }

  return {
    svg,
    setPosition,
    setOrientation,
    setCoords,
    setSelected,
    setLegalTargets,
    setLastMove,
    setDimmed,
    squareElement,
    pieceElement,
    squareFromTarget,
    pointToBoard,
    squareFromBoardPoint,
    raiseToFront,
    dragTo,
    snapTo,
    clearTransitionSoon,
    dispose,
  };
}
