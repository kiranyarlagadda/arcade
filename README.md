# arcade

Browser games I built from scratch, each one a drop-in custom element.

```html
<script type="module">import 'arcade';</script>

<arcade-game name="aim" mode="classic"></arcade-game>
```

That is the whole API. The element sizes itself, lazy-loads the named game,
pauses while scrolled off screen or backgrounded, and cleans up completely
when removed from the page.

## Games

| `name` | What it is |
|---|---|
| `aim` | An aim trainer. Classic mode keeps three targets alive in a 3x3 grid; freeshot scatters them anywhere in the arena. Cursor or raw (pointer-locked) input, configurable duration, target count, and size. |

## Configuring a game

Every game declares a set of params, and each one is an attribute:

```html
<arcade-game name="aim" mode="freeshot" duration="60" targets="8"></arcade-game>
```

Attributes are read when the game loads and watched afterwards, so changing
one at runtime calls the game's `setParams` with the merged values.

```js
el.setAttribute('duration', '60');   // takes effect on the next run
```

Read the schema at runtime to build your own controls, which is exactly what
the demo does:

```js
el.paramSchema;   // { mode: { label, type, default, options }, ... }
```

## The element contract

`<arcade-game>` is `display: block`, sizes to `width: 100%` with a `3 / 2`
aspect ratio, and is focusable so a game can read keyboard input while it has
focus.

```
el.paramSchema   // the current game's param schema, or null until it loads
el.game          // the current game instance, or null
el.pause()
el.resume()
el.restart()     // calls the game's own restart, if it has one
```

A game dispatches its own lifecycle on the element:

```js
el.addEventListener('game-state', (e) => console.log(e.detail.state));
// idle, countdown, running, paused, results

el.addEventListener('game-result', (e) => console.log(e.detail));
// { name, mode, stats, best }
```

## Adding a game

1. Create `src/games/yourgame/index.js`
2. Export `meta` and `create`:

```js
export const meta = {
  title: 'Your Game',
  blurb: 'One sentence.',
  tags: ['reflex'],
  params: {
    speed: { type: 'number', label: 'Speed', default: 1, min: 0.1, max: 3, step: 0.1 },
  },
};

export function create({ container, params, element }) {
  // container and element are both the <arcade-game> node. Build your canvas
  // inside it and size it off its box; there is no shadow root to hide behind.
  return {
    pause() {},
    resume() {},
    setParams(next) {},   // optional
    restart() {},          // optional
    dispose() {},           // required: remove every listener, timer, rAF,
                             // observer, exit pointer lock, remove the canvas.
                             // Must be safe to call twice.
  };
}
```

3. Register it in the `GAMES` map in `src/arcade-game.js`

Dispatch `game-state` and `game-result` on `element` as your game's run
progresses, per the contract above. The full commentary lives at the top of
`src/arcade-game.js`.

## Adding an aim mode

Modes live in `src/games/aim/modes/`, one file each, registered in
`src/games/aim/modes/index.js`. A mode exports:

```js
export const yourMode = {
  id: 'yourmode',
  title: 'Your Mode',
  liveCount: 4,
  layout(w, h) {
    // return { arena, cells? } for the current canvas size
  },
  spawn({ arena, cells, live, radius, rng, lastCleared }) {
    // return { x, y, r, cell? } for a new target. Pure: no Math.random, no
    // DOM reads. rng is injected so tests can seed it.
  },
};
```

See `modes/classic.js` and `modes/freeshot.js` for the two that ship today.

## Running the demo

```bash
npm install
npm run dev      # http://localhost:5181
```

The demo builds a controls panel straight from the loaded game's `paramSchema`
and writes attributes back onto the element, which is the same thing your own
page would do with a router or a settings form.

## Tests

```bash
npm test
```

`stats.test.js` checks the pure scoring math, `modes.test.js` checks spawn
placement across hundreds of seeded draws, `options.test.js` checks the
localStorage round trip, and `dispose.test.js` mounts and unmounts the element
fifty times while counting every listener, timer, animation frame, and
observer to make sure none of them outlive the element.

## Design

`design/` holds the asset generator: `build.py`, the SVG templates it renders
from, and `tokens.css`, the colour palette every game's canvas drawing is
built against. It is a standalone tool, not part of the package the games
ship in.

## Licence

MIT
