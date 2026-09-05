// The demo imports straight from source. A consumer would `import 'arcade'`.
import { GAME_NAMES } from '../src/index.js';

const game = document.getElementById('game');
const tabs = document.getElementById('tabs');
const controls = document.getElementById('controls');
const result = document.getElementById('result');
const snippet = document.getElementById('snippet');

function renderSnippet(name) {
  const attrs = name === 'aim' ? ' mode="classic"' : '';
  snippet.textContent = `<script type="module">import 'arcade'</script>\n<arcade-game name="${name}"${attrs}></arcade-game>`;
}

function buildTabs(active) {
  tabs.innerHTML = '';
  for (const name of GAME_NAMES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.setAttribute('aria-selected', String(name === active));
    button.addEventListener('click', () => {
      if (game.getAttribute('name') === name) return;
      game.setAttribute('name', name);
      buildTabs(name);
      renderSnippet(name);
      result.innerHTML = '<p class="hint">Play a run to see stats here.</p>';
    });
    tabs.appendChild(button);
  }
}

/** One row per key in the game's param schema, wired straight to attributes on the element. */
function buildControls(schema) {
  controls.innerHTML = '';
  const entries = Object.entries(schema ?? {});
  if (entries.length === 0) {
    controls.innerHTML = '<p class="hint">This game has no tweakable params.</p>';
    return;
  }

  for (const [key, spec] of entries) {
    const row = document.createElement('div');
    row.className = 'control';
    const label = document.createElement('label');
    const labelText = document.createElement('span');
    labelText.textContent = spec.label ?? key;
    label.appendChild(labelText);
    row.appendChild(label);

    const currentValue = game.getAttribute(key) ?? spec.default;

    if (spec.type === 'boolean') {
      const wrap = document.createElement('div');
      wrap.className = 'checkbox-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = currentValue !== 'false' && currentValue !== false;
      checkbox.addEventListener('change', () => game.setAttribute(key, String(checkbox.checked)));
      wrap.appendChild(checkbox);
      row.appendChild(wrap);
    } else if (spec.type === 'select') {
      const select = document.createElement('select');
      for (const option of spec.options ?? []) {
        const opt = document.createElement('option');
        opt.value = String(option);
        opt.textContent = String(option);
        select.appendChild(opt);
      }
      select.value = String(currentValue);
      select.addEventListener('change', () => game.setAttribute(key, select.value));
      row.appendChild(select);
    } else {
      const valueSpan = document.createElement('span');
      valueSpan.className = 'value';
      valueSpan.textContent = String(currentValue);
      label.appendChild(valueSpan);

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(spec.min ?? 0);
      range.max = String(spec.max ?? 100);
      range.step = String(spec.step ?? 1);
      range.value = String(currentValue);
      range.addEventListener('input', () => {
        valueSpan.textContent = range.value;
        game.setAttribute(key, range.value);
      });
      row.appendChild(range);
    }

    controls.appendChild(row);
  }
}

function renderResult(detail) {
  const { mode, stats, best } = detail;
  const rows = [
    ['mode', mode],
    ['hits', stats.hits],
    ['misses', stats.misses],
    ['accuracy', `${Math.round(stats.accuracy * 100)}%`],
    ['targets/sec', stats.targetsPerSecond.toFixed(2)],
    ['mean interval', stats.meanInterval === null ? 'n/a' : `${Math.round(stats.meanInterval)}ms`],
    ['best', best],
  ];

  const dl = document.createElement('dl');
  for (const [key, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  result.innerHTML = '';
  result.appendChild(dl);
}

game.addEventListener('game-ready', () => buildControls(game.paramSchema));
game.addEventListener('game-result', (e) => renderResult(e.detail));

buildTabs(game.getAttribute('name'));
renderSnippet(game.getAttribute('name'));
