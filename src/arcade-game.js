// <arcade-game name="aim"></arcade-game>
//
// A custom element that renders one game. Drop the tag on a page, give it a
// name, and it handles the rest: loading the game module, sizing the box,
// pausing while scrolled out of view or backgrounded, and cleaning up after
// itself when removed from the page.
//
//   <script type="module" src="/assets/arcade.js"></script>
//   <arcade-game name="aim" mode="freeshot"></arcade-game>
//
// ---------------------------------------------------------------------------
// ADDING A NEW GAME
// ---------------------------------------------------------------------------
// 1. Create src/games/<yourname>/index.js
// 2. Export `meta` and `create` (see the contract below), and add a one-line
//    src/games/<yourname>.js that re-exports them, so the chunk gets a name
// 3. Add it to GAMES in this file
// 4. GAME_NAMES follows automatically, it is derived from GAMES
//
// That is the whole process. You do not need to touch the element or the
// build config.
//
// ---------------------------------------------------------------------------
// THE GAME CONTRACT
// ---------------------------------------------------------------------------
// Every game's src/games/<name>/index.js exports exactly two things:
//
//   export const meta = {
//     title: 'Aim Trainer',
//     blurb: 'One sentence, first person.',
//     tags: ['reflex', 'canvas'],
//     params: {
//       mode: { type: 'select', label: 'Mode', default: 'classic', options: ['classic', 'freeshot'] },
//       duration: { type: 'select', label: 'Duration', default: 30, options: [30, 60] },
//       targets: { type: 'number', label: 'Targets', default: 3, min: 1, max: 12, step: 1 },
//     },
//   };
//
// Anything declared in `params` becomes an HTML attribute on the element:
//
//   <arcade-game name="aim" duration="60"></arcade-game>
//
// Attributes are read on mount and watched afterwards, so changing one at
// runtime calls the game's setParams with the merged values.
//
//   export function create({ container, params, element }) {
//     // container and element are both the <arcade-game> node itself: build
//     // your canvas inside it and size it off its box. Games do not get a
//     // shadow root, so append whatever DOM you need directly.
//     return {
//       resize(w, h) {},        // optional
//       pause() {},              // REQUIRED
//       resume() {},             // REQUIRED
//       setParams(next) {},      // optional: apply changed params live
//       restart() {},            // optional
//       dispose() {},             // REQUIRED: remove every listener, timer,
//                                 // rAF, observer, exit pointer lock, remove
//                                 // the canvas. Must be safe to call twice.
//     };
//   }
//
// A game dispatches its own lifecycle events on `element` (bubbling and
// composed, so they cross a shadow boundary if the page has one further up):
//
//   element.dispatchEvent(new CustomEvent('game-state', { detail: { state }, bubbles: true, composed: true }));
//   element.dispatchEvent(new CustomEvent('game-result', { detail: { name, mode, stats, best }, bubbles: true, composed: true }));
//
// `state` is one of idle, countdown, running, paused, results.

// Games are lazily imported, so a page only downloads the one it shows.
export const GAMES = {
  aim: () => import('./games/aim.js'),
};

export const GAME_NAMES = Object.keys(GAMES);

/**
 * Turn an attribute string into the type the game expects. Attributes are
 * always strings; a game wants numbers, booleans, or matching option values.
 * @param {{ type: string, default: *, min?: number, max?: number, options?: Array<*> }} spec
 * @param {string | null} raw
 */
function coerce(spec, raw) {
  if (raw === null || raw === undefined || raw === '') return spec.default;
  if (spec.type === 'number') {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return spec.default;
    const lo = spec.min ?? -Infinity;
    const hi = spec.max ?? Infinity;
    return Math.min(hi, Math.max(lo, n));
  }
  if (spec.type === 'boolean') return raw !== 'false' && raw !== '0';
  if (spec.type === 'select') {
    const match = (spec.options ?? []).find((option) => String(option) === raw);
    return match !== undefined ? match : spec.default;
  }
  return raw;
}

/** Merge a game's declared defaults with whatever attributes are actually set. */
function readParams(schema, element) {
  const out = {};
  for (const [key, spec] of Object.entries(schema ?? {})) {
    out[key] = coerce(spec, element.getAttribute(key));
  }
  return out;
}

let baseStyleInjected = false;

/**
 * The box every game renders into looks the same regardless of which game is
 * loaded, so it is a plain global stylesheet rather than something each game
 * has to set up itself.
 */
function ensureBaseStyle() {
  if (baseStyleInjected || document.getElementById('arcade-game-style')) return;
  baseStyleInjected = true;
  const style = document.createElement('style');
  style.id = 'arcade-game-style';
  style.textContent =
    'arcade-game { display: block; position: relative; width: 100%; aspect-ratio: 3 / 2; outline: none; }';
  document.head.appendChild(style);
}

export class ArcadeGame extends HTMLElement {
  // `name` is the only fixed attribute. Param attributes vary per game and
  // are not known until a game module loads, so they are watched with a
  // MutationObserver instead of this static list.
  static observedAttributes = ['name'];

  /** @type {ReturnType<typeof import('./games/aim/index.js').create> | null} */
  game = null;

  /** @type {Record<string, object> | null} */
  paramSchema = null;

  #schema = null;
  #token = 0;
  #teardown = [];
  #docHidden = false;
  #offscreen = false;

  connectedCallback() {
    ensureBaseStyle();
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');

    this.#docHidden = document.hidden;

    const onVisibility = () => {
      this.#docHidden = document.hidden;
      this.#applyVisibility();
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.#teardown.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const io = new IntersectionObserver((entries) => {
      this.#offscreen = !entries[entries.length - 1].isIntersecting;
      this.#applyVisibility();
    });
    io.observe(this);
    this.#teardown.push(() => io.disconnect());

    const mo = new MutationObserver((records) => {
      if (!this.#schema || !this.game?.setParams) return;
      const relevant = records.some(
        (record) => record.attributeName !== 'name' && record.attributeName in this.#schema,
      );
      if (relevant) this.game.setParams(readParams(this.#schema, this));
    });
    mo.observe(this, { attributes: true });
    this.#teardown.push(() => mo.disconnect());

    this.#load(this.getAttribute('name'));
  }

  disconnectedCallback() {
    this.#teardown.forEach((off) => off());
    this.#teardown = [];
    this.game?.dispose?.();
    this.game = null;
    this.paramSchema = null;
    this.#schema = null;
    this.#token++; // invalidate any in-flight import
  }

  attributeChangedCallback(attr, previous, next) {
    if (attr === 'name' && previous !== next && this.isConnected) this.#load(next);
  }

  /** Pause the running game, e.g. when scrolled off screen or backgrounded. */
  pause() {
    this.game?.pause?.();
  }

  /** Resume a paused game. */
  resume() {
    if (this.#docHidden || this.#offscreen) return;
    this.game?.resume?.();
  }

  /** Restart the current game, if it supports it. */
  restart() {
    this.game?.restart?.();
  }

  #applyVisibility() {
    if (this.#docHidden || this.#offscreen) this.game?.pause?.();
    else this.game?.resume?.();
  }

  async #load(name) {
    const token = ++this.#token;

    this.game?.dispose?.();
    this.game = null;
    this.paramSchema = null;
    this.#schema = null;

    if (!name || !GAMES[name]) return;

    const module = await GAMES[name]();
    // A newer load started, or the element left the page, while this import
    // was in flight. Drop this result rather than build a game nobody wants.
    if (token !== this.#token || !this.isConnected) return;

    this.#schema = module.meta?.params ?? null;
    this.paramSchema = this.#schema;
    this.game = module.create({
      container: this,
      params: readParams(this.#schema, this),
      element: this,
    });

    this.dispatchEvent(
      new CustomEvent('game-ready', { detail: { name, meta: module.meta }, bubbles: true, composed: true }),
    );

    this.#applyVisibility();
  }
}

if (!customElements.get('arcade-game')) {
  customElements.define('arcade-game', ArcadeGame);
}
