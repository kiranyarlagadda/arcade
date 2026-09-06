// Draughts: click or drag to move, the engine worker answers for whichever
// side I am not playing. rules.js owns every rule (legality, mandatory
// capture, promotion, game over); board.js owns drawing the board; this
// file is the glue between them, plus the sidebar, the worker wire-up, and
// everything the player keeps between visits. Same shape as chess/index.js
// on purpose, right down to the persistence keys and the dispose order.
//
// The one thing chess never had to deal with: a move here can be a whole
// capture chain, not just one hop, and two different chains can land on the
// same square. Selecting a piece shows a dot per distinct final square; if
// two chains disagree only partway through, the dots switch to "next square
// in the chain" and the player steps through until only one chain is left,
// at which point it plays as a single move, same as if it had never been
// ambiguous at all.

import {
  createPosition,
  generateMoves,
  makeMove,
  toFen,
  status,
  colorOf,
  moveToStr,
  moveFromStr,
  START_FEN,
} from './rules.js';
import { createBoard } from './board.js';

// ---------------------------------------------------------------------------
// Everything this game keeps in localStorage. Wrapped in try/catch: private
// browsing and locked-down embeds can throw on any storage access, and a
// missing preference should just fall back quietly rather than crash a game.
// ---------------------------------------------------------------------------

const PREFIX = 'arcade:draughts:';

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
// Layout. One stylesheet, injected once per page the same way chess's own
// index.js does it, never torn down on dispose since it is shared by every
// draughts board on the page, not owned by any one of them. Colours are the
// same hardcoded hex copies of design/tokens.css that board.js uses, for the
// same reason: tokens.css is a design-time tool file that never ships with
// the package.
// ---------------------------------------------------------------------------

let styleInjected = false;
function ensureStyle() {
  if (styleInjected || document.getElementById('draughts-game-style')) {
    styleInjected = true;
    return;
  }
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'draughts-game-style';
  style.textContent = `
arcade-game[name="draughts"] .draughts-wrap { display: flex; width: 100%; height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; box-sizing: border-box; }
arcade-game[name="draughts"] .draughts-wrap *, arcade-game[name="draughts"] .draughts-wrap *::before, arcade-game[name="draughts"] .draughts-wrap *::after { box-sizing: border-box; }
arcade-game[name="draughts"] .draughts-board-holder { position: relative; height: 100%; aspect-ratio: 1 / 1; flex: 0 0 auto; background: #04050a; }
arcade-game[name="draughts"] .draughts-board { display: block; width: 100%; height: 100%; touch-action: none; }
arcade-game[name="draughts"] .draughts-square { cursor: default; }
arcade-game[name="draughts"] .draughts-square-dark { cursor: pointer; }
arcade-game[name="draughts"] .draughts-piece { cursor: grab; transition: transform 120ms ease; }
@media (prefers-reduced-motion: reduce) {
  arcade-game[name="draughts"] .draughts-piece { transition: none; }
}
arcade-game[name="draughts"] .draughts-coord { font: 600 12px ui-monospace, "SF Mono", Menlo, monospace; fill: #9aa3b8; opacity: 0.65; user-select: none; }
arcade-game[name="draughts"] .draughts-sidebar { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: #0e1118; color: #eef1f8; overflow: hidden; }
arcade-game[name="draughts"] .draughts-status { font-size: 15px; font-weight: 600; }
arcade-game[name="draughts"] .draughts-level { font-size: 12px; color: #9aa3b8; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
arcade-game[name="draughts"] .draughts-moves { flex: 1 1 auto; min-height: 0; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.10); border-bottom: 1px solid rgba(255,255,255,0.10); padding: 4px 2px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; }
arcade-game[name="draughts"] .draughts-move-row { display: grid; grid-template-columns: 26px 1fr 1fr; gap: 6px; padding: 1px 0; }
arcade-game[name="draughts"] .draughts-move-num { color: #5c6478; }
arcade-game[name="draughts"] .draughts-record { font-size: 12px; color: #9aa3b8; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
arcade-game[name="draughts"] .draughts-newgame { align-self: flex-start; background: #161b27; color: #eef1f8; border: 1px solid rgba(255,255,255,0.10); border-radius: 6px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
arcade-game[name="draughts"] .draughts-newgame:hover { border-color: #ffb454; }
`;
  document.head.appendChild(style);
}

export const meta = {
  title: 'Draughts',
  blurb: 'Checkers on the same engine as chess, mandatory captures and all.',
  tags: ['strategy', 'engine', 'svg'],
  params: {
    level: { type: 'number', label: 'Level', default: 2, min: 1, max: 3, step: 1 },
    side: { type: 'select', label: 'Side', default: 'amber', options: ['amber', 'blue', 'random'] },
    coords: { type: 'boolean', label: 'Coordinates', default: true },
  },
};

const REASON_TEXT = {
  nomoves: 'no legal moves left',
  repetition: 'repetition',
};

const COLOR_NAME = { white: 'Amber', black: 'Blue' };

function resolveColor(side) {
  if (side === 'amber') return 'w';
  if (side === 'blue') return 'b';
  return Math.random() < 0.5 ? 'w' : 'b';
}

/**
 * @param {{ container: HTMLElement, params: Record<string, *>, element: HTMLElement }} args
 */
export function create({ container, params, element }) {
  ensureStyle();

  const stored = loadOptions();
  // A param counts as "already decided" if it arrived as an attribute or
  // was remembered from a previous visit, same rule chess/index.js uses.
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
  wrap.className = 'draughts-wrap';

  const boardHolder = document.createElement('div');
  boardHolder.className = 'draughts-board-holder';

  const sidebar = document.createElement('div');
  sidebar.className = 'draughts-sidebar';

  const statusEl = document.createElement('div');
  statusEl.className = 'draughts-status';

  const levelEl = document.createElement('div');
  levelEl.className = 'draughts-level';

  const movesEl = document.createElement('div');
  movesEl.className = 'draughts-moves';

  const recordEl = document.createElement('div');
  recordEl.className = 'draughts-record';

  const newGameBtn = document.createElement('button');
  newGameBtn.type = 'button';
  newGameBtn.className = 'draughts-newgame';
  newGameBtn.textContent = 'New game';

  sidebar.append(statusEl, levelEl, movesEl, recordEl, newGameBtn);

  const board = createBoard();
  boardHolder.appendChild(board.svg);
  wrap.append(boardHolder, sidebar);
  container.appendChild(wrap);

  // ---- state -----------------------------------------------------------------

  let pos = createPosition(START_FEN);
  let humanColor = 'w';
  let selected = null; // the from-square, while something is selected
  let movePool = []; // candidate moves relevant to the current selection
  let stepIndex = null; // null: movePool's `to` squares are the dots; a number: mid chain, path[stepIndex] are the dots
  let moveHistory = []; // one moveToStr() per ply
  let gameOver = false;
  let paused = false;
  let disposed = false;
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
    for (let i = 0; i < moveHistory.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'draughts-move-row';
      const num = document.createElement('span');
      num.className = 'draughts-move-num';
      num.textContent = `${i / 2 + 1}.`;
      const first = document.createElement('span');
      first.textContent = moveHistory[i] ?? '';
      const second = document.createElement('span');
      second.textContent = moveHistory[i + 1] ?? '';
      row.append(num, first, second);
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

  function emitState(state) {
    element.dispatchEvent(new CustomEvent('game-state', { detail: { state }, bubbles: true, composed: true }));
  }

  function describeResult(gameStatus) {
    const why = REASON_TEXT[gameStatus.reason] ?? gameStatus.reason;
    if (gameStatus.result === 'draw') return `Draw by ${why}`;
    return `${COLOR_NAME[gameStatus.result]} wins by ${why}`;
  }

  // ---- selection and moves ---------------------------------------------------

  function movesFrom(sq) {
    return generateMoves(pos).filter((m) => m.from === sq);
  }

  function renderTargets() {
    if (stepIndex == null) {
      board.setLegalTargets([...new Set(movePool.map((m) => m.to))]);
    } else {
      board.setLegalTargets([...new Set(movePool.map((m) => m.path[stepIndex]))]);
    }
  }

  function selectSquare(sq) {
    const candidates = movesFrom(sq);
    if (candidates.length === 0) {
      clearSelection();
      return;
    }
    selected = sq;
    movePool = candidates;
    const finalCounts = new Map();
    for (const m of candidates) finalCounts.set(m.to, (finalCounts.get(m.to) ?? 0) + 1);
    // Every sequence lands somewhere different: a dot per final square.
    // Two or more land on the same square: switch to stepping through the
    // chain one hop at a time until only one candidate is left standing.
    stepIndex = [...finalCounts.values()].some((n) => n > 1) ? 0 : null;
    board.setSelected(sq);
    renderTargets();
  }

  function clearSelection() {
    selected = null;
    movePool = [];
    stepIndex = null;
    board.setSelected(null);
    board.setLegalTargets([]);
  }

  /** A click on `sq` while something is selected: play a move if `sq` is a
   * final dot, narrow the chain if it is a step dot, or report that this
   * click was not a dot at all. */
  function advance(sq) {
    if (stepIndex == null) {
      const move = movePool.find((m) => m.to === sq);
      if (!move) return false;
      playMove(move);
      return true;
    }
    const filtered = movePool.filter((m) => m.path[stepIndex] === sq);
    if (filtered.length === 0) return false;
    if (filtered.length === 1) {
      playMove(filtered[0]);
      return true;
    }
    movePool = filtered;
    stepIndex += 1;
    renderTargets();
    return true;
  }

  function playMove(move) {
    const str = moveToStr(move);
    const { from, to, path, captures, promotion } = move;
    makeMove(pos, move);
    moveHistory.push(str);

    board.setPosition(pos, { from, to, path, captures, promotion });
    board.setLastMove(from, to);
    clearSelection();
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

    const result =
      gameStatus.result === 'draw' ? 'draw' : (gameStatus.result === 'white' ? 'w' : 'b') === humanColor ? 'win' : 'loss';

    const record = loadRecord();
    const levelRecord = record[current.level] ?? { win: 0, loss: 0, draw: 0 };
    levelRecord[result] += 1;
    record[current.level] = levelRecord;
    saveRecord(record);
    renderRecord();

    statusEl.textContent = describeResult(gameStatus);
    emitState('results');
    element.dispatchEvent(
      new CustomEvent('game-result', {
        detail: {
          name: 'draughts',
          mode: `level-${current.level}`,
          stats: { result, reason: gameStatus.reason, moves: Math.ceil(moveHistory.length / 2), plies: moveHistory.length },
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
    worker.postMessage({ id: activeRequestId, type: 'think', game: 'draughts', state: toFen(pos), level: current.level });
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
    const move = moveFromStr(pos, msg.moveKey);
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

  // ---- pointer interaction: click to move, or drag ---------------------------

  function onBoardPointerDown(event) {
    if (event.button > 0) return;
    if (disposed || paused || gameOver) return;
    if (pos.turn !== humanColor) return;

    const sq = board.squareFromTarget(event.target);
    if (sq < 0) return;

    if (selected != null) {
      if (advance(sq)) return;
      const candidates = movesFrom(sq);
      const code = pos.board[sq];
      const isOwnPiece = code !== 0 && colorOf(code) === humanColor;
      if (isOwnPiece && candidates.length > 0) {
        selectSquare(sq);
        beginDrag(event, sq, movePool);
        return;
      }
      clearSelection();
      return;
    }

    const code = pos.board[sq];
    const isOwnPiece = code !== 0 && colorOf(code) === humanColor;
    if (!isOwnPiece) return;
    const candidates = movesFrom(sq);
    if (candidates.length === 0) return; // this piece has no legal move, mandatory capture elsewhere or simply stuck
    selectSquare(sq);
    beginDrag(event, sq, movePool);
  }

  /** `candidates` is the full set of legal sequences from `fromSq`, captured
   * once at the start of the gesture so a drop can be matched against every
   * possible final square regardless of which dots are on screen right now. */
  function beginDrag(event, fromSq, candidates) {
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
      const matches = dropSq >= 0 && dropSq !== fromSq ? candidates.filter((m) => m.to === dropSq) : [];
      if (matches.length === 1) {
        const landedOn = matches[0].to;
        playMove(matches[0]);
        board.clearTransitionSoon(board.pieceElement(landedOn));
      } else {
        // No square to land on, or more than one chain still claims it:
        // snap back and let the player step through by clicking instead.
        board.snapTo(fromSq);
        selectSquare(fromSq);
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
    pos = createPosition(fen);
    moveHistory = [];
    gameOver = false;
    clearSelection();
    board.setPosition(pos);
    board.setLastMove(null, null);
    board.setDimmed(false);
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
    // the same way chess leaves a live run alone rather than reflowing it
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
