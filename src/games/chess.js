// Entry point for chess. The game itself lives in chess/; this file exists
// so the chunk a bundler emits is called "chess", not "index".
export { meta, create } from './chess/index.js';
