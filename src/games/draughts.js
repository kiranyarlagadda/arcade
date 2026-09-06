// Entry point for draughts. The game itself lives in draughts/; this file
// exists so the chunk a bundler emits is called "draughts", not "index".
export { meta, create } from './draughts/index.js';
