// Classic: a fixed 3x3 grid of cells inside the arena. A handful are live at
// once, and clearing one respawns a new target into an empty cell, never the
// one you just cleared, so you cannot camp a spot.

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ x: number, y: number, r: number, cell?: number }} Target
 */

export const classic = {
  id: 'classic',
  title: 'Classic',
  liveCount: 3,

  /**
   * @param {number} w
   * @param {number} h
   * @returns {{ arena: Rect, cells: Rect[] }}
   */
  layout(w, h) {
    const size = Math.min(w, h) * 0.86;
    const arena = { x: (w - size) / 2, y: (h - size) / 2, w: size, h: size };
    const cell = size / 3;
    const cells = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        cells.push({ x: arena.x + col * cell, y: arena.y + row * cell, w: cell, h: cell });
      }
    }
    return { arena, cells };
  },

  /**
   * @param {{ cells: Rect[], live: Target[], radius: number, rng: () => number, lastCleared?: number }} args
   * @returns {Target}
   */
  spawn({ cells, live, radius, rng, lastCleared }) {
    const occupied = new Set(live.map((t) => t.cell));
    const empty = [];
    for (let i = 0; i < cells.length; i++) {
      if (!occupied.has(i)) empty.push(i);
    }
    // Prefer an empty cell that is not the one just cleared. Only fall back
    // to including it if it is genuinely the only empty cell left, which
    // cannot happen with the default live count but is cheap to guard.
    const preferred = lastCleared === undefined ? empty : empty.filter((i) => i !== lastCleared);
    const pool = preferred.length > 0 ? preferred : empty;
    const cellIndex = pool[Math.floor(rng() * pool.length)];
    const cell = cells[cellIndex];
    return { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2, r: radius, cell: cellIndex };
  },
};
