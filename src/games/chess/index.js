// Chess: click or drag to move, the engine worker answers for whichever
// side I am not playing. rules.js owns every rule (legality, check, mates,
// draws); board.js owns drawing the board; this file is the glue between
// them, plus the sidebar, the worker wire-up, and everything the player
// keeps between visits.
//
// The state machine is small on purpose: a position, whether it is my turn,
// whether a square is selected, and whether a promotion picker is waiting on
// an answer. Everything else (the move list, the record, the status line)
// just renders off that whenever it changes.

import {
  createPosition,
  generateMoves,
  makeMove,
  toFen,
  toSAN,
  moveFromUci,
  status,
  inCheck,
  colorOf,
  parseSquare,
  PIECE,
  FLAG,
  START_FEN,
} from './rules.js';
import { createBoard } from './board.js';
import { symbolId } from './pieces.js';

// Where each rook ends up on a castle, keyed by which square the king lands
// on. Worked out once at load time since parseSquare never changes its mind.
const KINGSIDE_TO = { w: parseSquare('g1'), b: parseSquare('g8') };

// ---------------------------------------------------------------------------
// Everything this game keeps in localStorage. Wrapped in try/catch: private
// browsing and locked-down embeds can throw on any storage access, and a
// missing preference should just fall back quietly rather than crash a game.
// ---------------------------------------------------------------------------

const PREFIX = 'arcade:chess:';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full. The game still plays, it just is not remembered.
  }
}

function loadOptions() {
  return readJSON('options', {});
}

function saveOptions(options) {
  writeJSON('options', options);
}

function loadRecord() {
  return readJSON('record', {});
}

function saveRecord(record) {
  writeJSON('record', record);
}

// ---------------------------------------------------------------------------
// Layout. One stylesheet, injected once per page the same way
// arcade-game.js injects its own base style, never torn down on dispose
// since it is shared by every chess board on the page, not owned by any one
// of them. Colours are the same hardcoded hex copies of design/tokens.css
// that board.js uses, for the same reason: tokens.css is a design-time file
// that never ships with the package.
// ---------------------------------------------------------------------------

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || document.getElementById('chess-game-style')) {
    styleInjected = true;
    return;
  }
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'chess-game-style';
  style.textContent = `
arcade-game[name="chess"] .chess-wrap { display: flex; width: 100%; height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; box-sizing: border-box; }
arcade-game[name="chess"] .chess-wrap *, arcade-game[name="chess"] .chess-wrap *::before, arcade-game[name="chess"] .chess-wrap *::after { box-sizing: border-box; }
arcade-game[name="chess"] .chess-board-holder { position: relative; height: 100%; aspect-ratio: 1 / 1; flex: 0 0 auto; background: #04050a; }
arcade-game[name="chess"] .chess-board { display: block; width: 100%; height: 100%; touch-action: none; }
arcade-game[name="chess"] .chess-square { cursor: pointer; }
arcade-game[name="chess"] .chess-piece { cursor: grab; transition: transform 120ms ease; }
@media (prefers-reduced-motion: reduce) {
  arcade-game[name="chess"] .chess-piece { transition: none; }
}
arcade-game[name="chess"] .chess-coord { font: 600 12px ui-monospace, "SF Mono", Menlo, monospace; fill: #9aa3b8; opacity: 0.65; user-select: none; }
arcade-game[name="chess"] .chess-sidebar { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: #0e1118; color: #eef1f8; overflow: hidden; }
arcade-game[name="chess"] .chess-status { font-size: 15px; font-weight: 600; }
arcade-game[name="chess"] .chess-level { font-size: 12px; color: #9aa3b8; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
arcade-game[name="chess"] .chess-moves { flex: 1 1 auto; min-height: 0; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.10); border-bottom: 1px solid rgba(255,255,255,0.10); padding: 4px 2px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
arcade-game[name="chess"] .chess-move-row { display: grid; grid-template-columns: 26px 1fr 1fr; gap: 6px; padding: 1px 0; }
arcade-game[name="chess"] .chess-move-num { color: #5c6478; }
arcade-game[name="chess"] .chess-record { font-size: 12px; color: #9aa3b8; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
arcade-game[name="chess"] .chess-newgame { align-self: flex-start; background: #161b27; color: #eef1f8; border: 1px solid rgba(255,255,255,0.10); border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
arcade-game[name="chess"] .chess-newgame:hover { border-color: #ffb454; }
arcade-game[name="chess"] .chess-promo { position: absolute; transform: translate(-50%, -50%); display: flex; gap: 4px; background: #161b27; border: 1px solid rgba(255,255,255,0.10); border-radius: 8px; padding: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 2; }
arcade-game[name="chess"] .chess-promo-btn { width: 44px; height: 44px; padding: 4px; background: #0e1118; border: 1px solid rgba(255,255,255,0.10); border-radius: 6px; cursor: pointer; }
arcade-game[name="chess"] .chess-promo-btn:hover { border-color: #ffb454; }
arcade-game[name="chess"] .chess-promo-btn svg { width: 100%; height: 100%; display: block; }
`;
  document.head.appendChild(style);
}

export const meta = {
  title: 'Chess',
  blurb: 'Play the built-in engine at four strengths on a board you click or drag, no downloads and no clock.',
  tags: ['strategy', 'engine', 'svg'],
  params: {
    level: { type: 'number', label: 'Level', default: 2, min: 1, max: 4, step: 1 },
    side: { type: 'select', label: 'Side', default: 'white', options: ['white', 'black', 'random'] },
    coords: { type: 'boolean', label: 'Coordinates', default: true },
  },
};

const REASON_TEXT = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  fifty: 'the fifty-move rule',
  repetition: 'repetition',
  material: 'insufficient material',
};

function resolveColor(side) {
  if (side === 'white') return 'w';
  if (side === 'black') return 'b';
  return Math.random() < 0.5 ? 'w' : 'b';
}

/**
 * @param {{ container: HTMLElement, params: Record<string, *>, element: HTMLElement }} args
 */
export function create({ container, params, element }) {
  ensureStyle();

  const stored = loadOptions();
  // A param counts as "already decided" if it arrived as an attribute or
  // was remembered from a previous visit, same rule aim/index.js uses.
  function initial(key) {
    if (element.hasAttribute(key)) return params[key];
    if (Object.prototype.hasOwnProperty.call(stored, key)) return stored[key];
    return params[key];
  }

  let current = {
    level: initial('level'),
    side: initial('side'),
    coords: initial('coords'),
  };

  // ---- DOM -----------------------------------------------------------------

  const wrap = document.createElement('div');
  wrap.className = 'chess-wrap';

  const boardHolder = document.createElement('div');
  boardHolder.className = 'chess-board-holder';

  const sidebar = document.createElement('div');
  sidebar.className = 'chess-sidebar';

  const statusEl = document.createElement('div');
  statusEl.className = 'chess-status';

  const levelEl = document.createElement('div');
  levelEl.className = 'chess-level';

  const movesEl = document.createElement('div');
  movesEl.className = 'chess-moves';

  const recordEl = document.createElement('div');
  recordEl.className = 'chess-record';

  const newGameBtn = document.createElement('button');
  newGameBtn.type = 'button';
  newGameBtn.className = 'chess-newgame';
  newGameBtn.textContent = 'New game';

  sidebar.append(statusEl, levelEl, movesEl, recordEl, newGameBtn);

  const board = createBoard();
  boardHolder.appendChild(board.svg);
  wrap.append(boardHolder, sidebar);
  container.appendChild(wrap);

  // ---- state -----------------------------------------------------------------

  let pos = createPosition(START_FEN);
  let humanColor = 'w';
  let selected = null;
  let sanHistory = [];
  let gameOver = false;
  let paused = false;
  let disposed = false;
  let pendingPromotion = null; // { fromSq, toSq, candidates }
  let promotionEl = null;
  let activeRequestId = null;
  let requestSeq = 0;
  let pendingResult = null; // a worker message that arrived while paused
  let endActiveDrag = null; // set while a drag is in progress, for dispose

  let worker = null;
  try {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('../../engine/worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = onWorkerMessage;
    }
  } catch {
    worker = null; // the engine is unavailable here; the human can still play both sides of the click
  }

  // ---- rendering helpers -----------------------------------------------------

  function renderMoveList() {
    movesEl.replaceChildren();
    for (let i = 0; i < sanHistory.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'chess-move-row';
      const num = document.createElement('span');
      num.className = 'chess-move-num';
      num.textContent = `${i / 2 + 1}.`;
      const white = document.createElement('span');
      white.textContent = sanHistory[i] ?? '';
      const black = document.createElement('span');
      black.textContent = sanHistory[i + 1] ?? '';
      row.append(num, white, black);
      movesEl.appendChild(row);
    }
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  function renderRecord() {
    const record = loadRecord();
    const r = record[current.level] ?? { win: 0, loss: 0, draw: 0 };
    recordEl.textContent = `${r.win}W ${r.loss}L ${r.draw}D`;
  }

  function updateStatus() {
    if (gameOver) return; // endGame already wrote the final line; do not overwrite it
    if (paused) {
      statusEl.textContent = 'Paused';
      return;
    }
    statusEl.textContent = pos.turn === humanColor ? 'Your move' : 'Thinking';
  }

  function updateCheckHighlight() {
    board.setCheck(inCheck(pos) ? pos.kings[pos.turn] : null);
  }

  function emitState(state) {
    element.dispatchEvent(new CustomEvent('game-state', { detail: { state }, bubbles: true, composed: true }));
  }

  function describeResult(result, reason) {
    const why = REASON_TEXT[reason] ?? reason;
    if (result === 'draw') return `Draw by ${why}`;
    return result === 'win' ? `You win by ${why}` : `You lose by ${why}`;
  }

  // ---- selection and moves ---------------------------------------------------

  function legalMovesFrom(sq) {
    return generateMoves(pos).filter((m) => m.from === sq);
  }

  function movesTo(fromSq, toSq) {
    return legalMovesFrom(fromSq).filter((m) => m.to === toSq);
  }

  function uniqueTargets(moves) {
    const seen = new Map();
    for (const m of moves) {
      if (!seen.has(m.to)) seen.set(m.to, { to: m.to, capture: (m.flags & FLAG.CAPTURE) !== 0 });
    }
    return [...seen.values()];
  }

  function selectSquare(sq) {
    selected = sq;
    board.setSelected(sq);
    board.setLegalTargets(uniqueTargets(legalMovesFrom(sq)));
  }

  function clearSelection() {
    selected = null;
    board.setSelected(null);
    board.setLegalTargets([]);
  }

  /** Every legal move whose `to` matches, since rules.js only ever fans one
   * destination into several moves for a promotion (one per piece choice). */
  function tryMove(fromSq, toSq) {
    const candidates = movesTo(fromSq, toSq);
    if (candidates.length === 0) return false;
    if (candidates.length === 1) {
      playMove(candidates[0]);
      return true;
    }
    openPromotionPicker(fromSq, toSq, candidates);
    return true;
  }

  /** What board.setPosition needs to animate exactly the piece(s) that moved. */
  function movedDescriptorFor(move) {
    const desc = { from: move.from, to: move.to };
    if (move.flags & FLAG.EP) {
      desc.captureSquare = move.to + (colorOf(move.piece) === 'w' ? -16 : 16);
    } else if (move.flags & FLAG.CAPTURE) {
      desc.captureSquare = move.to;
    }
    if (move.flags & FLAG.CASTLE) {
      const color = colorOf(move.piece);
      const kingside = move.to === KINGSIDE_TO[color];
      const rank = color === 'w' ? '1' : '8';
      desc.castleRookFrom = parseSquare((kingside ? 'h' : 'a') + rank);
      desc.castleRookTo = parseSquare((kingside ? 'f' : 'd') + rank);
    }
    return desc;
  }

  function playMove(move) {
    const san = toSAN(pos, move); // rules.js: this has to run before makeMove, it makes/unmakes internally for the +/# suffix
    const moved = movedDescriptorFor(move);
    makeMove(pos, move);
    sanHistory.push(san);

    board.setPosition(pos, moved);
    board.setLastMove(move.from, move.to);
    clearSelection();
    updateCheckHighlight();
    renderMoveList();

    const gameStatus = status(pos);
    if (gameStatus.over) {
      endGame(gameStatus);
      return;
    }
    updateStatus();
    maybeAskEngine();
  }

  function endGame(gameStatus) {
    gameOver = true;
    cancelEngineRequest();
    board.setDimmed(true);
    updateCheckHighlight();

    const result = gameStatus.result === 'draw' ? 'draw' : (gameStatus.result === 'white' ? 'w' : 'b') === humanColor ? 'win' : 'loss';

    const record = loadRecord();
    const levelRecord = record[current.level] ?? { win: 0, loss: 0, draw: 0 };
    levelRecord[result] += 1;
    record[current.level] = levelRecord;
    saveRecord(record);
    renderRecord();

    statusEl.textContent = describeResult(result, gameStatus.reason);
    emitState('results');
    element.dispatchEvent(
      new CustomEvent('game-result', {
        detail: {
          name: 'chess',
          mode: `level-${current.level}`,
          stats: { result, reason: gameStatus.reason, moves: pos.fullmove, plies: sanHistory.length },
          best: null,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ---- engine ------------------------------------------------------------

  function askEngine() {
    if (!worker) return; // no engine in this environment; the human just waits, per the brief
    requestSeq += 1;
    activeRequestId = requestSeq;
    worker.postMessage({ id: activeRequestId, type: 'think', game: 'chess', state: toFen(pos), level: current.level });
  }

  function maybeAskEngine() {
    if (gameOver || paused) return;
    if (pos.turn === humanColor) return;
    if (activeRequestId != null) return; // already waiting on one
    askEngine();
  }

  function cancelEngineRequest() {
    if (worker && activeRequestId != null) {
      worker.postMessage({ id: activeRequestId, type: 'cancel' });
    }
    activeRequestId = null;
    pendingResult = null; // whatever answers this now is answering a question that no longer stands
  }

  function handleEngineError(msg) {
    statusEl.textContent = `Engine error: ${msg.message}`;
  }

  function applyEngineResult(msg) {
    if (gameOver) return;
    const move = moveFromUci(pos, msg.moveKey);
    if (!move) {
      handleEngineError({ message: `illegal move from the engine: ${msg.moveKey}` });
      return;
    }
    playMove(move);
  }

  function deliver(msg) {
    if (msg.type === 'error') handleEngineError(msg);
    else if (msg.type === 'result') applyEngineResult(msg);
  }

  function onWorkerMessage(event) {
    const msg = event.data;
    if (!msg || msg.id !== activeRequestId) return; // a stale or cancelled request; ignore it per the protocol
    activeRequestId = null;
    if (paused) {
      pendingResult = msg; // apply it on resume instead, at most one queued
      return;
    }
    deliver(msg);
  }

  // ---- promotion picker ----------------------------------------------------

  function openPromotionPicker(fromSq, toSq, candidates) {
    pendingPromotion = { fromSq, toSq, candidates };
    const wrap = document.createElement('div');
    wrap.className = 'chess-promo';
    for (const type of [PIECE.Q, PIECE.R, PIECE.B, PIECE.N]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chess-promo-btn';
      const code = type + (humanColor === 'b' ? 8 : 0);
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 100 100');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      const id = symbolId(code);
      use.setAttribute('href', `#${id}`);
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${id}`);
      icon.appendChild(use);
      btn.appendChild(icon);
      btn.addEventListener('click', () => choosePromotion(type));
      wrap.appendChild(btn);
    }
    const target = board.squareElement(toSq);
    if (target) {
      const holderRect = boardHolder.getBoundingClientRect();
      const sqRect = target.getBoundingClientRect();
      wrap.style.left = `${sqRect.left - holderRect.left + sqRect.width / 2}px`;
      wrap.style.top = `${sqRect.top - holderRect.top + sqRect.height / 2}px`;
    }
    boardHolder.appendChild(wrap);
    promotionEl = wrap;
    document.addEventListener('keydown', onPromotionKeydown);
  }

  function choosePromotion(type) {
    if (!pendingPromotion) return;
    const move = pendingPromotion.candidates.find((m) => m.promotion === type);
    closePromotionDom();
    pendingPromotion = null;
    if (move) playMove(move);
  }

  function cancelPromotion() {
    if (!pendingPromotion) return;
    const { fromSq } = pendingPromotion;
    closePromotionDom();
    pendingPromotion = null;
    board.snapTo(fromSq);
    clearSelection();
  }

  function closePromotionDom() {
    if (promotionEl) {
      promotionEl.remove();
      promotionEl = null;
    }
    document.removeEventListener('keydown', onPromotionKeydown);
  }

  function onPromotionKeydown(e) {
    if (e.key === 'Escape') cancelPromotion();
  }

  // ---- pointer interaction: click to move, or drag ---------------------------

  function onBoardPointerDown(event) {
    if (event.button > 0) return;
    if (disposed || paused || gameOver || pendingPromotion) return;
    if (pos.turn !== humanColor) return;

    const sq = board.squareFromTarget(event.target);
    if (sq < 0) return;

    const code = pos.board[sq];
    const isOwnPiece = code !== 0 && colorOf(code) === humanColor;

    if (selected != null && !isOwnPiece) {
      if (tryMove(selected, sq)) return;
      clearSelection();
      return;
    }

    if (isOwnPiece) {
      selectSquare(sq);
      beginDrag(event, sq);
      return;
    }

    clearSelection();
  }

  function beginDrag(event, fromSq) {
    const use = board.pieceElement(fromSq);
    if (!use) return;
    const pointerId = event.pointerId;
    let dragging = false;

    function onMove(e) {
      if (pointerId != null && e.pointerId !== pointerId) return;
      const pt = board.pointToBoard(e.clientX, e.clientY);
      if (!pt) return;
      if (!dragging) {
        dragging = true;
        board.raiseToFront(fromSq);
      }
      board.dragTo(fromSq, pt.x, pt.y);
    }

    function finish(e) {
      if (pointerId != null && e.pointerId !== pointerId) return;
      cleanup();
      if (!dragging) return; // a plain click; selection from pointerdown already stands

      const pt = board.pointToBoard(e.clientX, e.clientY);
      const dropSq = pt ? board.squareFromBoardPoint(pt.x, pt.y) : -1;
      const candidates = dropSq >= 0 && dropSq !== fromSq ? movesTo(fromSq, dropSq) : [];
      if (candidates.length === 0) {
        board.snapTo(fromSq);
      } else if (candidates.length === 1) {
        playMove(candidates[0]);
        board.clearTransitionSoon(board.pieceElement(dropSq));
      } else {
        openPromotionPicker(fromSq, dropSq, candidates);
        board.clearTransitionSoon(use);
      }
    }

    function cleanup() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      try {
        event.target.releasePointerCapture?.(pointerId);
      } catch {
        // Was never captured, or unsupported here; the document listeners already covered the drag.
      }
      endActiveDrag = null;
    }

    try {
      event.target.setPointerCapture?.(pointerId);
    } catch {
      // Unsupported here (the test environment, some touch browsers); the document listeners still work.
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
    endActiveDrag = () => {
      cleanup();
      board.snapTo(fromSq);
    };
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Reset to `fen` without touching colour or orientation: what a restart's
   * fresh start and a test's game.load(fen) both need underneath them. */
  function resetTo(fen) {
    cancelEngineRequest();
    cancelPromotion();
    pos = createPosition(fen);
    sanHistory = [];
    gameOver = false;
    clearSelection();
    board.setPosition(pos);
    board.setLastMove(null, null);
    board.setDimmed(false);
    updateCheckHighlight();
    renderMoveList();

    const initialStatus = status(pos);
    if (initialStatus.over) {
      endGame(initialStatus);
      return;
    }
    updateStatus();
    emitState(paused ? 'paused' : 'running');
    maybeAskEngine();
  }

  function newGame() {
    if (disposed) return;
    humanColor = resolveColor(current.side);
    board.setOrientation(humanColor === 'b' ? 'black' : 'white');
    resetTo(START_FEN);
  }

  function load(fen) {
    if (disposed) return;
    resetTo(fen);
  }

  function pause() {
    if (disposed || gameOver || paused) return;
    paused = true;
    updateStatus();
    emitState('paused');
  }

  function resume() {
    if (disposed || gameOver || !paused) return;
    paused = false;
    updateStatus();
    emitState('running');
    if (pendingResult) {
      const msg = pendingResult;
      pendingResult = null;
      deliver(msg);
    } else {
      maybeAskEngine();
    }
  }

  function setParams(next) {
    current = { ...next };
    saveOptions({ ...current });
    board.setCoords(!!current.coords);
    levelEl.textContent = `Level ${current.level}`;
    renderRecord();
    // Level, side, and coordinates all take effect on the next new game,
    // the same way aim leaves a live run alone rather than reflowing it
    // under the player mid-move.
  }

  function onNewGameClick() {
    newGame();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelEngineRequest();
    endActiveDrag?.();
    cancelPromotion();
    closePromotionDom();
    board.svg.removeEventListener('pointerdown', onBoardPointerDown);
    newGameBtn.removeEventListener('click', onNewGameClick);
    worker?.terminate();
    board.dispose();
    wrap.remove();
  }

  board.svg.addEventListener('pointerdown', onBoardPointerDown);
  newGameBtn.addEventListener('click', onNewGameClick);

  board.setCoords(!!current.coords);
  levelEl.textContent = `Level ${current.level}`;
  renderRecord();
  newGame();

  return {
    pause,
    resume,
    setParams,
    restart: newGame,
    dispose,
    load,
    get playerColor() {
      return humanColor;
    },
    // FEN of the live position. Not part of the game contract itself, just a
    // small window in for tests (and anything else that wants to know
    // exactly where a game stands) rather than reaching into closed-over state.
    get fen() {
      return toFen(pos);
    },
  };
}
