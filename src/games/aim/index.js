// Aim Trainer: click or tap the target before it moves. Two modes live in
// modes/, stats are pure functions in stats.js, and everything the player
// keeps between visits lives in options.js. This file is the glue: canvas
// setup, input handling, the run state machine, and drawing.

import { MODES } from './modes/index.js';
import { summarize } from './stats.js';
import { loadOptions, saveOptions, loadBest, saveBest, bestKey } from './options.js';

// Hex values copied straight from design/tokens.css. Hardcoded rather than
// read from CSS custom properties because the target is drawn on a canvas,
// not styled with CSS. Keep this in sync if that file's palette changes.
const colors = {
  bg: '#04050a',
  ink: '#eef1f8',
  dim: '#9aa3b8',
  line: 'rgba(255,255,255,0.10)',
  amber: '#ffb454',
  teal: '#5eead4',
  rose: '#ff5c7a',
};

// The target's four rings are drawn at these radii out of an outer ring of
// 44, matching design/build.py's target_svg() on a 100-unit box. Everything
// scales off that ratio so "radius" always means the outer ring.
const RING_UNIT = 44;

const CLASSIC_SIZE_FRACTION = { small: 0.22, medium: 0.3, large: 0.38 };
const FREESHOT_SIZE_PX = { small: 16, medium: 22, large: 30 };
const MODE_TARGET_DEFAULT = { classic: 3, freeshot: 6 };
const HIT_FADE_MS = 180;
const MISS_FADE_MS = 120;
const COUNTDOWN_SECONDS = 3;

export const meta = {
  title: 'Aim Trainer',
  blurb: 'I built this as a warm-up before ranked sessions and never quite stopped tuning it.',
  tags: ['reflex', 'canvas'],
  params: {
    mode: { type: 'select', label: 'Mode', default: 'classic', options: ['classic', 'freeshot'] },
    duration: { type: 'select', label: 'Duration', default: 30, options: [30, 60] },
    targets: { type: 'number', label: 'Targets', default: 3, min: 1, max: 12, step: 1 },
    size: { type: 'select', label: 'Target size', default: 'medium', options: ['small', 'medium', 'large'] },
    input: { type: 'select', label: 'Input', default: 'cursor', options: ['cursor', 'raw'] },
    sensitivity: { type: 'number', label: 'Sensitivity', default: 1, min: 0.1, max: 5, step: 0.05 },
    crosshair: { type: 'select', label: 'Crosshair', default: 'dot', options: ['dot', 'cross', 'circle'] },
  },
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback for canvas implementations without roundRect.
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The four concentric rings from design/build.py's target_svg(), "live" state. */
function drawTargetMarks(ctx, x, y, r) {
  const s = r / RING_UNIT;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colors.amber;
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.arc(0, 0, 44 * s, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = colors.amber;
  ctx.beginPath();
  ctx.arc(0, 0, 33 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(0, 0, 21 * s, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = colors.amber;
  ctx.beginPath();
  ctx.arc(0, 0, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Teal dot plus eight radial ticks, the "hit" state, fading with `alpha`. */
function drawHitBurst(ctx, x, y, r, alpha) {
  const s = r / RING_UNIT;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = colors.teal;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 4 * s;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    ctx.beginPath();
    ctx.moveTo(sinA * 44 * s, -cosA * 44 * s);
    ctx.lineTo(sinA * 32 * s, -cosA * 32 * s);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(0, 0, 30 * s, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = colors.teal;
  ctx.beginPath();
  ctx.arc(0, 0, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A rose cross where a miss landed, fading with `alpha`. */
function drawMissMark(ctx, x, y, r, alpha) {
  const s = r / RING_UNIT;
  const half = 12 * s;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colors.rose;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.moveTo(-half, -half);
  ctx.lineTo(half, half);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(half, -half);
  ctx.lineTo(-half, half);
  ctx.stroke();
  ctx.restore();
}

function drawCrosshair(ctx, x, y, kind) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colors.ink;
  ctx.fillStyle = colors.ink;
  ctx.lineWidth = 2;
  if (kind === 'cross') {
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
  } else if (kind === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * @param {{ container: HTMLElement, params: Record<string, *>, element: HTMLElement }} args
 */
export function create({ container, params, element }) {
  const stored = loadOptions();

  // A param counts as "already decided" if it arrived as an attribute or was
  // remembered from a previous visit. Only a truly untouched `targets` gets
  // the mode's own default, which is how switching modes can retune the live
  // target count without stomping a value the player actually picked.
  function initial(key) {
    if (element.hasAttribute(key)) return params[key];
    if (Object.prototype.hasOwnProperty.call(stored, key)) return stored[key];
    return params[key];
  }

  let explicitTargets = element.hasAttribute('targets') || Object.prototype.hasOwnProperty.call(stored, 'targets');
  let lastRawTargets = params.targets;

  /** @type {{ mode: string, duration: number, targets: number, size: string, input: string, sensitivity: number, crosshair: string }} */
  let current = {
    mode: initial('mode'),
    duration: initial('duration'),
    size: initial('size'),
    input: initial('input'),
    sensitivity: initial('sensitivity'),
    crosshair: initial('crosshair'),
    targets: explicitTargets ? initial('targets') : (MODE_TARGET_DEFAULT[initial('mode')] ?? initial('targets')),
  };

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';
  container.appendChild(canvas);

  /** @type {CanvasRenderingContext2D | null} */
  let ctx = canvas.getContext('2d');

  let cssW = 1;
  let cssH = 1;
  let arena = null;
  let cells = null;

  let reducedMotionQuery = null;
  let reducedMotion = false;
  try {
    reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    reducedMotion = reducedMotionQuery?.matches ?? false;
  } catch {
    reducedMotionQuery = null;
  }
  const onReducedMotionChange = (e) => {
    reducedMotion = e.matches;
  };
  reducedMotionQuery?.addEventListener?.('change', onReducedMotionChange);

  let state = 'idle';
  let hostPaused = false;
  let lockPaused = false;
  let resumeTo = null;
  let locked = false;
  let inputModeForRun = 'cursor';
  let disposed = false;

  let raf = null;
  let lastFrameTime = null;
  let countdownElapsedMs = 0;
  let runElapsedMs = 0;
  let runDurationMs = 0;

  let liveTargets = [];
  let effects = [];
  let hits = 0;
  let misses = 0;
  let hitTimes = [];

  let crosshairX = 0;
  let crosshairY = 0;

  function currentModeDef() {
    return MODES[current.mode] ?? MODES.classic;
  }

  function measureContainer() {
    return {
      width: Math.max(1, container.clientWidth || 1),
      height: Math.max(1, container.clientHeight || 1),
    };
  }

  function layout() {
    const { width, height } = measureContainer();
    cssW = width;
    cssH = height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const built = currentModeDef().layout(cssW, cssH);
    arena = built.arena;
    cells = built.cells ?? null;
    drawOnce();
  }

  const resizeObserver = new ResizeObserver(() => layout());
  resizeObserver.observe(container);

  function targetRadius() {
    if (currentModeDef().id === 'classic' && cells) {
      const frac = CLASSIC_SIZE_FRACTION[current.size] ?? CLASSIC_SIZE_FRACTION.medium;
      return cells[0].w * frac;
    }
    const px = FREESHOT_SIZE_PX[current.size] ?? FREESHOT_SIZE_PX.medium;
    return px * (Math.min(cssW, cssH) / 360);
  }

  function liveCountForRun() {
    const requested = clamp(Math.round(current.targets) || 1, 1, 12);
    if (currentModeDef().id === 'classic' && cells) return Math.max(1, Math.min(requested, cells.length - 1));
    return requested;
  }

  function spawnOne(lastCleared) {
    const radius = targetRadius();
    const target = currentModeDef().spawn({ arena, cells, live: liveTargets, radius, rng: Math.random, lastCleared });
    liveTargets.push(target);
  }

  function spawnInitialTargets() {
    liveTargets = [];
    const n = liveCountForRun();
    for (let i = 0; i < n; i++) spawnOne(undefined);
  }

  function addEffect(type, x, y, r) {
    const duration = reducedMotion ? 16 : type === 'hit' ? HIT_FADE_MS : MISS_FADE_MS;
    effects.push({ type, x, y, r, start: performance.now(), duration });
  }

  function pruneEffects(now) {
    if (effects.length === 0) return;
    effects = effects.filter((e) => now - e.start < e.duration);
  }

  function drawEffects(now) {
    for (const e of effects) {
      const age = now - e.start;
      const alpha = reducedMotion ? 1 : Math.max(0, 1 - age / e.duration);
      if (e.type === 'hit') drawHitBurst(ctx, e.x, e.y, e.r, alpha);
      else drawMissMark(ctx, e.x, e.y, e.r, alpha);
    }
  }

  function emitState() {
    element.dispatchEvent(new CustomEvent('game-state', { detail: { state }, bubbles: true, composed: true }));
  }

  function drawArenaBackground() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    if (cells) {
      for (const c of cells) {
        roundRectPath(ctx, c.x + 3, c.y + 3, c.w - 6, c.h - 6, 10);
        ctx.stroke();
      }
    } else if (arena) {
      roundRectPath(ctx, arena.x, arena.y, arena.w, arena.h, 16);
      ctx.stroke();
    }
  }

  function drawHud() {
    const remaining = Math.max(0, Math.ceil((runDurationMs - runElapsedMs) / 1000));
    const attempts = hits + misses;
    const accuracy = attempts > 0 ? Math.round((hits / attempts) * 100) : 100;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = '600 14px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillStyle = colors.dim;
    ctx.fillText(`${remaining}s`, 12, 12);
    ctx.fillText(`${hits} hits`, 12, 30);
    ctx.fillText(`${accuracy}% acc`, 12, 48);
    ctx.restore();
  }

  function drawIdle() {
    if (!ctx) return;
    drawArenaBackground();
    const best = loadBest()[bestKey(current.mode, current.duration)] ?? 0;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.ink;
    ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Click to start', cssW / 2, cssH / 2 - 14);
    ctx.fillStyle = colors.dim;
    ctx.font = '13px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillText(`${current.mode} · ${current.duration}s · best ${best}`, cssW / 2, cssH / 2 + 14);
    ctx.restore();
  }

  function drawCountdown(n) {
    if (!ctx) return;
    drawArenaBackground();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.amber;
    ctx.font = '700 64px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(n), cssW / 2, cssH / 2);
    ctx.restore();
  }

  function drawRunning(now) {
    if (!ctx) return;
    drawArenaBackground();
    for (const t of liveTargets) drawTargetMarks(ctx, t.x, t.y, t.r);
    drawEffects(now);
    drawHud();
    if (inputModeForRun === 'raw' && locked) drawCrosshair(ctx, crosshairX, crosshairY, current.crosshair);
  }

  function drawResults() {
    if (!ctx) return;
    drawArenaBackground();
    const summary = summarize({ hits, misses, hitTimes, duration: current.duration });
    const best = loadBest()[bestKey(current.mode, current.duration)] ?? 0;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.ink;
    ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Run complete', cssW / 2, cssH / 2 - 66);
    ctx.font = '13px ui-monospace, "SF Mono", Menlo, monospace';
    ctx.fillStyle = colors.dim;
    const hitWord = summary.hits === 1 ? 'hit' : 'hits';
    const missWord = summary.misses === 1 ? 'miss' : 'misses';
    const lines = [
      `${summary.hits} ${hitWord}, ${summary.misses} ${missWord}`,
      `${Math.round(summary.accuracy * 100)}% accuracy`,
      `${summary.targetsPerSecond.toFixed(2)} targets/sec`,
      summary.meanInterval === null ? 'mean interval: n/a' : `${Math.round(summary.meanInterval)}ms mean interval`,
      `best: ${best}`,
      'click or press space to run again',
    ];
    lines.forEach((line, i) => ctx.fillText(line, cssW / 2, cssH / 2 - 30 + i * 20));
    ctx.restore();
  }

  function drawOnce() {
    const now = performance.now();
    if (state === 'idle') drawIdle();
    else if (state === 'countdown') drawCountdown(Math.max(1, Math.ceil(COUNTDOWN_SECONDS - countdownElapsedMs / 1000)));
    else if (state === 'running' || state === 'paused') drawRunning(now);
    else if (state === 'results') drawResults();
  }

  function startRaf() {
    if (raf !== null) return;
    lastFrameTime = null;
    raf = requestAnimationFrame(frame);
  }

  function stopRaf() {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  }

  function frame(now) {
    const dt = lastFrameTime === null ? 0 : now - lastFrameTime;
    lastFrameTime = now;

    if (state === 'countdown') {
      countdownElapsedMs += dt;
      const remaining = COUNTDOWN_SECONDS - countdownElapsedMs / 1000;
      if (remaining <= 0) startRun();
      else drawCountdown(Math.ceil(remaining));
    } else if (state === 'running') {
      runElapsedMs += dt;
      pruneEffects(now);
      if (runElapsedMs >= runDurationMs) endRun();
      else drawRunning(now);
    } else if (effects.length > 0) {
      pruneEffects(now);
      drawOnce();
    }

    if (state === 'running' || state === 'countdown' || effects.length > 0) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = null;
    }
  }

  function startCountdown() {
    stopRaf();
    effects = [];
    layout();
    liveTargets = [];
    state = 'countdown';
    countdownElapsedMs = 0;
    lastFrameTime = null;
    emitState();
    startRaf();
  }

  function startRun() {
    state = 'running';
    hits = 0;
    misses = 0;
    hitTimes = [];
    runElapsedMs = 0;
    runDurationMs = current.duration * 1000;
    if (inputModeForRun === 'raw' && arena) {
      crosshairX = arena.x + arena.w / 2;
      crosshairY = arena.y + arena.h / 2;
    }
    spawnInitialTargets();
    emitState();
  }

  function endRun() {
    state = 'results';
    stopRaf();
    const summary = summarize({ hits, misses, hitTimes, duration: current.duration });
    const key = bestKey(current.mode, current.duration);
    const bestMap = loadBest();
    const previousBest = bestMap[key] ?? 0;
    const best = Math.max(previousBest, hits);
    if (best !== previousBest) {
      bestMap[key] = best;
      saveBest(bestMap);
    }
    releaseLockIfHeld();
    emitState();
    element.dispatchEvent(
      new CustomEvent('game-result', {
        detail: { name: 'aim', mode: current.mode, stats: summary, best },
        bubbles: true,
        composed: true,
      }),
    );
    drawOnce();
  }

  function registerHit(target) {
    hits++;
    hitTimes.push(performance.now());
    addEffect('hit', target.x, target.y, target.r);
    liveTargets = liveTargets.filter((t) => t !== target);
    spawnOne(target.cell);
    if (raf === null) startRaf(); // keep the fade animating even between frames
  }

  function registerMiss(x, y) {
    misses++;
    addEffect('miss', x, y, targetRadius());
    if (raf === null) startRaf();
  }

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function decideInputMode(e) {
    let coarse = false;
    try {
      coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    } catch {
      coarse = false;
    }
    const touch = e.pointerType === 'touch' || coarse;
    if (touch) return 'cursor';
    return current.input === 'raw' ? 'raw' : 'cursor';
  }

  function requestLock() {
    try {
      const result = canvas.requestPointerLock({ unadjustedMovement: true });
      result?.catch?.(() => {
        try {
          canvas.requestPointerLock();
        } catch {
          // Pointer lock unsupported here; the run continues in cursor coordinates.
        }
      });
    } catch {
      try {
        canvas.requestPointerLock();
      } catch {
        // Pointer lock unsupported here; the run continues in cursor coordinates.
      }
    }
  }

  function releaseLockIfHeld() {
    try {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    } catch {
      // Nothing to release.
    }
  }

  function enterPaused() {
    if (state !== 'running' && state !== 'countdown') return;
    resumeTo = state;
    state = 'paused';
    stopRaf();
    emitState();
    drawOnce();
  }

  function leavePaused() {
    if (state !== 'paused') return;
    if (hostPaused || lockPaused) return;
    state = resumeTo ?? 'running';
    resumeTo = null;
    emitState();
    startRaf();
  }

  function onPointerDown(e) {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }

    if (state === 'idle') {
      inputModeForRun = decideInputMode(e);
      startCountdown();
      if (inputModeForRun === 'raw') requestLock();
      return;
    }
    if (state === 'results') {
      startCountdown();
      return;
    }
    if (state === 'paused') {
      if (lockPaused) requestLock();
      return;
    }
    if (state !== 'running') return;

    let x;
    let y;
    if (inputModeForRun === 'raw' && locked) {
      x = crosshairX;
      y = crosshairY;
    } else {
      const p = canvasPoint(e);
      x = p.x;
      y = p.y;
    }

    const target = liveTargets.find((t) => Math.hypot(x - t.x, y - t.y) <= t.r);
    if (target) registerHit(target);
    else registerMiss(x, y);
  }

  function onDocumentPointerMove(e) {
    if (!locked || !arena) return;
    crosshairX = clamp(crosshairX + e.movementX * current.sensitivity, arena.x, arena.x + arena.w);
    crosshairY = clamp(crosshairY + e.movementY * current.sensitivity, arena.y, arena.y + arena.h);
  }

  function onPointerLockChange() {
    locked = document.pointerLockElement === canvas;
    canvas.style.cursor = locked ? 'none' : 'crosshair';
    if (inputModeForRun !== 'raw') return;
    if (!locked) {
      lockPaused = true;
      enterPaused();
    } else {
      lockPaused = false;
      leavePaused();
    }
  }

  function onKeyDown(e) {
    if ((e.code === 'Space' || e.key === ' ') && state === 'results') {
      e.preventDefault();
      startCountdown();
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointermove', onDocumentPointerMove);

  layout();
  emitState(); // announce the initial idle state

  function pause() {
    hostPaused = true;
    enterPaused();
  }

  function resume() {
    hostPaused = false;
    leavePaused();
  }

  function restart() {
    stopRaf();
    effects = [];
    resumeTo = null;
    hostPaused = false;
    lockPaused = false;
    startCountdown();
  }

  function setParams(next) {
    const rawTargetsChanged = next.targets !== lastRawTargets;
    lastRawTargets = next.targets;
    if (rawTargetsChanged) explicitTargets = true;
    const resolvedTargets = explicitTargets ? next.targets : (MODE_TARGET_DEFAULT[next.mode] ?? next.targets);

    const modeChanged = next.mode !== current.mode;
    current = { ...next, targets: resolvedTargets };
    saveOptions({ ...current });

    // A live run keeps its own arena and targets; new params take effect on
    // the next run rather than reflowing targets under the player's cursor.
    if (state === 'idle' || state === 'results' || state === 'paused') {
      if (modeChanged) layout();
      else drawOnce();
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopRaf();
    canvas.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('pointermove', onDocumentPointerMove);
    reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
    resizeObserver.disconnect();
    releaseLockIfHeld();
    canvas.remove();
  }

  return { pause, resume, setParams, restart, dispose };
}
