// Importing this module registers the <arcade-game> custom element.
//
//   import 'arcade';
//   // then, anywhere in your HTML:
//   // <arcade-game name="aim"></arcade-game>
//
// The named exports are only needed if you want to build your own UI around it
// (a picker, a tab bar) rather than just dropping tags on a page.

import './arcade-game.js';

export { GAME_NAMES, GAMES } from './arcade-game.js';

// Titles and one-liners for a game picker, kept here so a page can show the
// whole roster without importing any game module. Keep in step with each
// game's meta.
export const GAME_INFO = {
  aim: { title: 'Aim Trainer', tag: 'reflex', blurb: 'Timed target runs, on a grid or loose.' },
  chess: { title: 'Chess', tag: 'strategy', blurb: 'Four levels, my own engine.' },
  draughts: { title: 'Draughts', tag: 'strategy', blurb: 'Checkers on the same engine as chess.' },
};
