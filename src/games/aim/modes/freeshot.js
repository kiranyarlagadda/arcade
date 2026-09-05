// Freeshot: targets appear anywhere in the open arena. No grid, no cells,
// just a margin so a target never spawns half off the edge, and a check
// against every live target so a fresh one never lands on top of another.

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ x: number, y: number, r: number }} Target
 */

const SPAWN_ATTEMPTS = 50;

export const freeshot = {
  id: 'freeshot',
  title: 'Freeshot',
  liveCount: 6,

  /**
   * @param {number} w
   * @param {number} h
   * @returns {{ arena: Rect }}
   */
  layout(w, h) {
    const margin = Math.min(w, h) * 0.05;
    return { arena: { x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 } };
  },

  /**
   * @param {{ arena: Rect, live: Target[], radius: number, rng: () => number }} args
   * @returns {Target}
   */
  spawn({ arena, live, radius, rng }) {
    const minX = arena.x + radius;
    const maxX = arena.x + arena.w - radius;
    const minY = arena.y + radius;
    const maxY = arena.y + arena.h - radius;
    const spanX = Math.max(0, maxX - minX);
    const spanY = Math.max(0, maxY - minY);

    let best = { x: minX + spanX / 2, y: minY + spanY / 2 };
    let bestClearance = -Infinity;

    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const x = minX + rng() * spanX;
      const y = minY + rng() * spanY;
      let clearance = Infinity;
      for (const target of live) {
        const d = Math.hypot(x - target.x, y - target.y) - (radius + target.r);
        if (d < clearance) clearance = d;
      }
      if (live.length === 0) return { x, y, r: radius };
      if (clearance >= 0) return { x, y, r: radius };
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = { x, y };
      }
    }
    return { x: best.x, y: best.y, r: radius };
  },
};
