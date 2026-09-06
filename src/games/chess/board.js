// Pure rendering: build the board's SVG tree and keep it in sync with
// whatever state index.js hands it. Nothing in here knows a rule of chess or
// owns a single event listener; it only draws squares, pieces, and the
// overlays that mark selection, legal moves, the last move, and check.
// index.js is the one place that reads pointer events and the rules engine
// and turns them into calls on the object this file returns.

import { squareName, parseSquare } from './rules.js';
import { PIECE_SYMBOLS, symbolId } from './pieces.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const BOARD_PX = 800;
export const SQUARE_PX = 100;

// Copied straight from design/tokens.css. Hardcoded rather than read off a
// CSS custom property because these are SVG presentation attributes, and
// tokens.css is a design-time tool file that never ships with the package
// (see README's Design section) so nothing here can just @import it.
const COLORS = {
  sqLight: '#3b4459',
  sqDark: '#242b3c',
  lastMove: 'rgba(255,180,84,.28)',
  selected: '#ffb454',
  legal: '#5eead4',
  check: '#ff5c7a',
  dim: 'rgba(4,5,10,.35)',
};

function svgEl(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  }
  return node;
}

// The twelve piece symbols only need to exist once per page, not once per
// board: every <use> everywhere just references #piece-wK and friends. This
// mirrors arcade-game.js's own ensureBaseStyle, right down to never tearing
// the injected node back down when a game is disposed.
let defsReady = false;
function ensurePieceDefs() {
  if (defsReady || document.getElementById('chess-piece-defs')) {
    defsReady = true;
    return;
  }
  defsReady = true;
  const holder = svgEl('svg', { id: 'chess-piece-defs', 'aria-hidden': 'true' });
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
  svg.classList.add('chess-board');

  const squaresLayer = svgEl('g');
  const lastMoveLayer = svgEl('g');
  const selectedLayer = svgEl('g');
  const checkLayer = svgEl('g');
  const coordsLayer = svgEl('g');
  const piecesLayer = svgEl('g');
  const markersLayer = svgEl('g');
  const dimLayer = svgEl('g');
  svg.append(squaresLayer, lastMoveLayer, selectedLayer, checkLayer, coordsLayer, piecesLayer, markersLayer, dimLayer);

  // Every one of these is decoration drawn over the board, never a click
  // target: without this a teal move dot would eat the click meant for the
  // square underneath it.
  for (const layer of [lastMoveLayer, selectedLayer, checkLayer, coordsLayer, markersLayer, dimLayer]) {
    layer.style.pointerEvents = 'none';
  }

  let orientation = 'white';
  let coordsOn = true;
  const squareEls = new Map(); // square index -> <rect>
  const pieceEls = new Map(); // square index -> <use> currently sitting there

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

  function buildSquares() {
    squaresLayer.replaceChildren();
    coordsLayer.replaceChildren();
    squareEls.clear();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const sq = rank * 16 + file;
        const { x, y } = xy(sq);
        const { col, row } = colRow(sq);
        const light = (file + rank) % 2 === 1;
        const rect = svgEl('rect', {
          x, y, width: SQUARE_PX, height: SQUARE_PX,
          fill: light ? COLORS.sqLight : COLORS.sqDark,
        });
        rect.classList.add('chess-square');
        rect.dataset.square = squareName(sq);
        squaresLayer.appendChild(rect);
        squareEls.set(sq, rect);

        // Real boards only label their outer edge: file letters along the
        // bottom row, rank numbers down the left column, whichever those
        // are once orientation has picked which corner is which.
        if (row === 7) {
          const label = svgEl('text', { x: x + SQUARE_PX - 8, y: y + SQUARE_PX - 8, 'text-anchor': 'end' });
          label.classList.add('chess-coord');
          label.textContent = String.fromCharCode(97 + file);
          coordsLayer.appendChild(label);
        }
        if (col === 0) {
          const label = svgEl('text', { x: x + 8, y: y + 18 });
          label.classList.add('chess-coord');
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
    use.setAttribute('transform', `translate(${x},${y})`);
    use.dataset.square = squareName(sq);
  }

  // rAF ids scheduled below to re-enable a transition after one instant
  // change. Tracked so dispose() can cancel whatever has not fired yet: the
  // dispose audit counts every outstanding frame, and there is no point
  // letting one fire against a board that has already been torn down.
  const pendingFrames = new Set();

  /** Clear `use`'s inline transition override on the next frame, so a later transform change animates again. */
  function clearTransitionSoon(use) {
    if (!use) return;
    const id = requestAnimationFrame(() => {
      pendingFrames.delete(id);
      use.style.transition = '';
    });
    pendingFrames.add(id);
  }

  /** Snap `use`'s next transform change to skip the CSS transition, once. */
  function withoutAnimating(use, fn) {
    use.style.transition = 'none';
    fn();
    clearTransitionSoon(use);
  }

  /**
   * Reconcile the board to `pos`. `moved`, when given, names the move that
   * produced this position ({ from, to, captureSquare?, castleRookFrom?,
   * castleRookTo? }) so the piece that actually moved slides there instead
   * of the whole board snapping to place. Mount, game.load, and restart all
   * call this with no `moved` at all, which is exactly right for them: there
   * is no single move to animate from, only a position to show.
   */
  function setPosition(pos, moved) {
    const wanted = new Map();
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const code = pos.board[sq];
      if (code) wanted.set(sq, code);
    }

    if (moved) {
      if (moved.captureSquare != null && moved.captureSquare !== moved.to) {
        const captured = pieceEls.get(moved.captureSquare);
        if (captured) {
          captured.remove();
          pieceEls.delete(moved.captureSquare);
        }
      }
      slide(moved.from, moved.to);
      if (moved.castleRookFrom != null) slide(moved.castleRookFrom, moved.castleRookTo);
    }

    // Catch everything the fast path above did not: a promotion changes
    // which symbol belongs on a square, a plain capture leaves a piece
    // sitting on the destination already, and a load/restart has no
    // `moved` at all, so this is the only pass that runs.
    for (const [sq, use] of [...pieceEls]) {
      const code = wanted.get(sq);
      if (code === undefined || symbolId(code) !== use.dataset.piece) {
        use.remove();
        pieceEls.delete(sq);
      }
    }
    for (const [sq, code] of wanted) {
      if (pieceEls.has(sq)) continue;
      const use = svgEl('use', { width: SQUARE_PX, height: SQUARE_PX });
      use.classList.add('chess-piece');
      const id = symbolId(code);
      use.setAttribute('href', `#${id}`);
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${id}`);
      use.dataset.piece = id;
      placeAt(use, sq);
      piecesLayer.appendChild(use);
      pieceEls.set(sq, use);
      withoutAnimating(use, () => {}); // the initial placement above should never transition in
    }
  }

  function slide(from, to) {
    const use = pieceEls.get(from);
    if (!use) return;
    const displaced = pieceEls.get(to);
    if (displaced && displaced !== use) displaced.remove();
    pieceEls.delete(from);
    pieceEls.set(to, use);
    placeAt(use, to);
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

  /** @param {Array<{ to: number, capture: boolean }>} targets */
  function setLegalTargets(targets) {
    markersLayer.replaceChildren();
    for (const t of targets) {
      const { x, y } = xy(t.to);
      const cx = x + SQUARE_PX / 2;
      const cy = y + SQUARE_PX / 2;
      if (t.capture) {
        markersLayer.appendChild(svgEl('circle', { cx, cy, r: 44, fill: 'none', stroke: COLORS.legal, 'stroke-width': 6 }));
      } else {
        markersLayer.appendChild(svgEl('circle', { cx, cy, r: 13, fill: COLORS.legal }));
      }
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

  function setCheck(sq) {
    checkLayer.replaceChildren();
    if (sq == null) return;
    const { x, y } = xy(sq);
    checkLayer.appendChild(
      svgEl('circle', {
        cx: x + SQUARE_PX / 2, cy: y + SQUARE_PX / 2, r: 46,
        fill: 'none', stroke: COLORS.check, 'stroke-width': 6,
      }),
    );
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
    use.setAttribute('transform', `translate(${boardX - SQUARE_PX / 2},${boardY - SQUARE_PX / 2})`);
  }

  /** Snap a piece back to its own square, instantly, e.g. an aborted drag. */
  function snapTo(sq) {
    const use = pieceEls.get(sq);
    if (!use) return;
    withoutAnimating(use, () => placeAt(use, sq));
  }

  /** Cancel every frame this board still has scheduled. Safe to call once, on teardown. */
  function dispose() {
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
    setCheck,
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
