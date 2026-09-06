// Disc artwork, extracted from design/draughts/p1.svg, p1-king.svg, p2.svg,
// and p2-king.svg by a one-off script (see design/build.py's neighbors, or
// just re-run the extraction: strip the outer <svg>, keep the viewBox and
// the drawing underneath it) rather than retyped by hand, so the path data
// here is exactly what the designer drew. p1 is amber (white, player one),
// p2 is blue (black, player two); the king variant adds the little crown
// mark on top of the same disc. board.js references a symbol with a plain
// <use href="#piece-wm">.

/** One <symbol> per disc, keyed piece-<w|b><m|k>, viewBox 0 0 100 100. */
export const PIECE_SYMBOLS = `
  <symbol id="piece-wm" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ffb454"/><circle cx="50" cy="50" r="40" fill="none" stroke="#04050a" stroke-opacity="0.55" stroke-width="3"/><circle cx="50" cy="50" r="29" fill="none" stroke="#04050a" stroke-opacity="0.35" stroke-width="3"/></symbol>
  <symbol id="piece-wk" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ffb454"/><circle cx="50" cy="50" r="40" fill="none" stroke="#04050a" stroke-opacity="0.55" stroke-width="3"/><circle cx="50" cy="50" r="29" fill="none" stroke="#04050a" stroke-opacity="0.35" stroke-width="3"/><path d="M35 61 L40 42 L47 52 L50 38 L53 52 L60 42 L65 61 Z" fill="#04050a" fill-opacity="0.85"/><rect x="35" y="61" width="30" height="4" rx="1.5" fill="#04050a" fill-opacity="0.85"/></symbol>
  <symbol id="piece-bm" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#7fb0ff"/><circle cx="50" cy="50" r="40" fill="none" stroke="#04050a" stroke-opacity="0.55" stroke-width="3"/><circle cx="50" cy="50" r="29" fill="none" stroke="#04050a" stroke-opacity="0.35" stroke-width="3"/></symbol>
  <symbol id="piece-bk" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#7fb0ff"/><circle cx="50" cy="50" r="40" fill="none" stroke="#04050a" stroke-opacity="0.55" stroke-width="3"/><circle cx="50" cy="50" r="29" fill="none" stroke="#04050a" stroke-opacity="0.35" stroke-width="3"/><path d="M35 61 L40 42 L47 52 L50 38 L53 52 L60 42 L65 61 Z" fill="#04050a" fill-opacity="0.85"/><rect x="35" y="61" width="30" height="4" rx="1.5" fill="#04050a" fill-opacity="0.85"/></symbol>
`;

/**
 * Map a rules.js piece code (1 white man, 2 white king, 9 black man,
 * 10 black king) to its symbol id.
 * @param {number} code
 */
export function symbolId(code) {
  const color = code & 8 ? 'b' : 'w';
  const letter = (code & 7) === 2 ? 'k' : 'm';
  return `piece-${color}${letter}`;
}
