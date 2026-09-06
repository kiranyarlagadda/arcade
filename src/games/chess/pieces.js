// Piece artwork, extracted from design/chess/<light|dark>-<piece>.svg by a
// one-off script (see extract_pieces.py in the design notes) rather than
// retyped by hand, so the path data here is exactly what the designer drew.
// Each SVG's <g> already carries its own fill and stroke, matching
// tokens.css's --piece-light / --piece-dark pairs, so the symbols below need
// no extra colour handling at draw time. board.js references a symbol with
// a plain <use href="#piece-wK">.

/** One <symbol> per piece, keyed piece-<w|b><K|Q|R|B|N|P>, viewBox 0 0 100 100. */
export const PIECE_SYMBOLS = `
  <symbol id="piece-wK" viewBox="0 0 100 100"><g fill="#f0ead8" stroke="#0e1118" stroke-width="3" stroke-linejoin="round"><rect x="47" y="4" width="6" height="18" rx="1.5"/><rect x="41" y="9" width="18" height="6" rx="1.5"/><path d="M33 42 C33 28 41 21 50 21 C59 21 67 28 67 42 Z"/><rect x="34" y="42" width="32" height="7" rx="2.5"/><path d="M39 49 L34 80 H66 L61 49 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-wQ" viewBox="0 0 100 100"><g fill="#f0ead8" stroke="#0e1118" stroke-width="3" stroke-linejoin="round"><circle cx="36" cy="13" r="3.5"/><circle cx="50" cy="7" r="3.5"/><circle cx="64" cy="13" r="3.5"/><path d="M31 42 L36 16 L44 32 L50 10 L56 32 L64 16 L69 42 Z"/><rect x="34" y="42" width="32" height="7" rx="2.5"/><path d="M39 49 L34 80 H66 L61 49 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-wR" viewBox="0 0 100 100"><g fill="#f0ead8" stroke="#0e1118" stroke-width="3" stroke-linejoin="round"><path d="M30 12 h9 v7 h6 v-7 h10 v7 h6 v-7 h9 v17 H30 Z"/><path d="M36 29 H64 L67 78 H33 Z"/><rect x="30" y="76" width="40" height="6" rx="2"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-wB" viewBox="0 0 100 100"><g fill="#f0ead8" stroke="#0e1118" stroke-width="3" stroke-linejoin="round"><circle cx="50" cy="11" r="4.5"/><path d="M50 16 C63 25 67 40 59 53 H41 C33 40 37 25 50 16 Z"/><rect x="37" y="53" width="26" height="7" rx="2.5"/><path d="M41 60 L36 80 H64 L59 60 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/><path fill="none" stroke="#0e1118" stroke-width="3" stroke-linecap="round" d="M54 24 L44 42"/></g></symbol>
  <symbol id="piece-wN" viewBox="0 0 100 100"><g fill="#f0ead8" stroke="#0e1118" stroke-width="3" stroke-linejoin="round"><path d="M35 82 C37 70 41 62 39 57 L26 50 C21 47 22 39 26 36 L39 30 C43 27 45 21 46 13 L52 22 L59 13 C64 23 67 34 68 48 C69 62 67 72 65 82 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/><circle fill="#0e1118" stroke="none" cx="47" cy="35" r="2.6"/><circle fill="#0e1118" stroke="none" cx="29" cy="41" r="1.6"/><path fill="none" stroke="#0e1118" stroke-width="3" stroke-linecap="round" d="M60 30 L65 32 M61 40 L66 42"/></g></symbol>
  <symbol id="piece-wP" viewBox="0 0 100 100"><g fill="#f0ead8" stroke="#0e1118" stroke-width="3" stroke-linejoin="round"><circle cx="50" cy="32" r="13"/><rect x="37" y="46" width="26" height="7" rx="2.5"/><path d="M41 53 L35 80 H65 L59 53 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-bK" viewBox="0 0 100 100"><g fill="#171b26" stroke="#b9c2d6" stroke-width="3" stroke-linejoin="round"><rect x="47" y="4" width="6" height="18" rx="1.5"/><rect x="41" y="9" width="18" height="6" rx="1.5"/><path d="M33 42 C33 28 41 21 50 21 C59 21 67 28 67 42 Z"/><rect x="34" y="42" width="32" height="7" rx="2.5"/><path d="M39 49 L34 80 H66 L61 49 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-bQ" viewBox="0 0 100 100"><g fill="#171b26" stroke="#b9c2d6" stroke-width="3" stroke-linejoin="round"><circle cx="36" cy="13" r="3.5"/><circle cx="50" cy="7" r="3.5"/><circle cx="64" cy="13" r="3.5"/><path d="M31 42 L36 16 L44 32 L50 10 L56 32 L64 16 L69 42 Z"/><rect x="34" y="42" width="32" height="7" rx="2.5"/><path d="M39 49 L34 80 H66 L61 49 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-bR" viewBox="0 0 100 100"><g fill="#171b26" stroke="#b9c2d6" stroke-width="3" stroke-linejoin="round"><path d="M30 12 h9 v7 h6 v-7 h10 v7 h6 v-7 h9 v17 H30 Z"/><path d="M36 29 H64 L67 78 H33 Z"/><rect x="30" y="76" width="40" height="6" rx="2"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
  <symbol id="piece-bB" viewBox="0 0 100 100"><g fill="#171b26" stroke="#b9c2d6" stroke-width="3" stroke-linejoin="round"><circle cx="50" cy="11" r="4.5"/><path d="M50 16 C63 25 67 40 59 53 H41 C33 40 37 25 50 16 Z"/><rect x="37" y="53" width="26" height="7" rx="2.5"/><path d="M41 60 L36 80 H64 L59 60 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/><path fill="none" stroke="#b9c2d6" stroke-width="3" stroke-linecap="round" d="M54 24 L44 42"/></g></symbol>
  <symbol id="piece-bN" viewBox="0 0 100 100"><g fill="#171b26" stroke="#b9c2d6" stroke-width="3" stroke-linejoin="round"><path d="M35 82 C37 70 41 62 39 57 L26 50 C21 47 22 39 26 36 L39 30 C43 27 45 21 46 13 L52 22 L59 13 C64 23 67 34 68 48 C69 62 67 72 65 82 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/><circle fill="#b9c2d6" stroke="none" cx="47" cy="35" r="2.6"/><circle fill="#b9c2d6" stroke="none" cx="29" cy="41" r="1.6"/><path fill="none" stroke="#b9c2d6" stroke-width="3" stroke-linecap="round" d="M60 30 L65 32 M61 40 L66 42"/></g></symbol>
  <symbol id="piece-bP" viewBox="0 0 100 100"><g fill="#171b26" stroke="#b9c2d6" stroke-width="3" stroke-linejoin="round"><circle cx="50" cy="32" r="13"/><rect x="37" y="46" width="26" height="7" rx="2.5"/><path d="M41 53 L35 80 H65 L59 53 Z"/><rect x="24" y="82" width="52" height="10" rx="3"/></g></symbol>
`;

const TYPE_LETTER = { 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };

/**
 * Map a rules.js piece code (1..6 white, 9..14 black) to its symbol id.
 * @param {number} code
 */
export function symbolId(code) {
  const color = code & 8 ? 'b' : 'w';
  const letter = TYPE_LETTER[code & 7];
  return `piece-${color}${letter}`;
}
