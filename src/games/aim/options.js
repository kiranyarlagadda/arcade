// Everything this game keeps in localStorage, in one place. Wrapped in
// try/catch throughout: private browsing and locked-down embeds can throw on
// any access to storage, and the game should just forget rather than crash.

const PREFIX = 'arcade:aim:';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable or full. The run still plays, it just is not remembered.
  }
}

/** Every param the player has changed via setParams, used as defaults on the next mount. */
export function loadOptions() {
  return readJSON('options', {});
}

export function saveOptions(options) {
  writeJSON('options', options);
}

/** { [`${mode}:${duration}`]: hits } */
export function loadBest() {
  return readJSON('best', {});
}

export function saveBest(best) {
  writeJSON('best', best);
}

export function bestKey(mode, duration) {
  return `${mode}:${duration}`;
}
