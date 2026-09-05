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
