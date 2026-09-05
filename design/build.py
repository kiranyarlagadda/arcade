#!/usr/bin/env python3
"""Arcade asset generator. One source of truth for every SVG in design/.

Run `python3 build.py` to regenerate the SVG files and the design sheet.
Geometry lives here so the sheet and the standalone files can never drift.
"""
from pathlib import Path

HERE = Path(__file__).parent

# ---------------------------------------------------------------- tokens
T = {
    "bg": "#04050a", "surface": "#0e1118", "raised": "#161b27",
    "line": "rgba(255,255,255,0.10)",
    "ink": "#eef1f8", "dim": "#9aa3b8", "faint": "#5c6478",
    "amber": "#ffb454", "blue": "#7fb0ff", "teal": "#5eead4", "rose": "#ff5c7a",
    "sq-light": "#3b4459", "sq-dark": "#242b3c",
    "piece-light": "#f0ead8", "piece-light-line": "#0e1118",
    "piece-dark": "#171b26", "piece-dark-line": "#b9c2d6",
}

# ----------------------------------------------------------------- chess
# All pieces share a 100x100 box, a plinth at y=82..92 and a 3px outline.
BASE = '<rect x="24" y="82" width="52" height="10" rx="3"/>'

CHESS = {
    "pawn": [
        '<circle cx="50" cy="32" r="13"/>',
        '<rect x="37" y="46" width="26" height="7" rx="2.5"/>',
        '<path d="M41 53 L35 80 H65 L59 53 Z"/>',
        BASE,
    ],
    "rook": [
        '<path d="M30 12 h9 v7 h6 v-7 h10 v7 h6 v-7 h9 v17 H30 Z"/>',
        '<path d="M36 29 H64 L67 78 H33 Z"/>',
        '<rect x="30" y="76" width="40" height="6" rx="2"/>',
        BASE,
    ],
    "knight": [
        '<path d="M35 82 C37 70 41 62 39 57 L26 50 C21 47 22 39 26 36 L39 30 '
        'C43 27 45 21 46 13 L52 22 L59 13 C64 23 67 34 68 48 C69 62 67 72 65 82 Z"/>',
        BASE,
        '<circle class="detail" cx="47" cy="35" r="2.6"/>',
        '<circle class="detail" cx="29" cy="41" r="1.6"/>',
        '<path class="detail-line" d="M60 30 L65 32 M61 40 L66 42"/>',
    ],
    "bishop": [
        '<circle cx="50" cy="11" r="4.5"/>',
        '<path d="M50 16 C63 25 67 40 59 53 H41 C33 40 37 25 50 16 Z"/>',
        '<rect x="37" y="53" width="26" height="7" rx="2.5"/>',
        '<path d="M41 60 L36 80 H64 L59 60 Z"/>',
        BASE,
        '<path class="detail-line" d="M54 24 L44 42"/>',
    ],
    "queen": [
        '<circle cx="36" cy="13" r="3.5"/><circle cx="50" cy="7" r="3.5"/><circle cx="64" cy="13" r="3.5"/>',
        '<path d="M31 42 L36 16 L44 32 L50 10 L56 32 L64 16 L69 42 Z"/>',
        '<rect x="34" y="42" width="32" height="7" rx="2.5"/>',
        '<path d="M39 49 L34 80 H66 L61 49 Z"/>',
        BASE,
    ],
    "king": [
        '<rect x="47" y="4" width="6" height="18" rx="1.5"/><rect x="41" y="9" width="18" height="6" rx="1.5"/>',
        '<path d="M33 42 C33 28 41 21 50 21 C59 21 67 28 67 42 Z"/>',
        '<rect x="34" y="42" width="32" height="7" rx="2.5"/>',
        '<path d="M39 49 L34 80 H66 L61 49 Z"/>',
        BASE,
    ],
}

def chess_svg(name, side, standalone=True):
    fill = T["piece-light"] if side == "light" else T["piece-dark"]
    line = T["piece-light-line"] if side == "light" else T["piece-dark-line"]
    # Colours are attributes, not a <style> block: many pieces share one document
    # on the board, and a class rule would let the last piece restyle them all.
    body = "".join(CHESS[name])
    body = body.replace('class="detail"', f'fill="{line}" stroke="none"')
    body = body.replace('class="detail-line"', f'fill="none" stroke="{line}" stroke-width="3" stroke-linecap="round"')
    inner = f'<g fill="{fill}" stroke="{line}" stroke-width="3" stroke-linejoin="round">{body}</g>'
    if standalone:
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{inner}</svg>'
    return f'<svg viewBox="0 0 100 100" class="piece" aria-label="{side} {name}">{inner}</svg>'

# -------------------------------------------------------------- draughts
def draughts_svg(side, king=False, standalone=True):
    fill = T["amber"] if side == "p1" else T["blue"]
    body = (f'<circle cx="50" cy="50" r="40" fill="{fill}"/>'
            f'<circle cx="50" cy="50" r="40" fill="none" stroke="{T["bg"]}" stroke-opacity="0.55" stroke-width="3"/>'
            f'<circle cx="50" cy="50" r="29" fill="none" stroke="{T["bg"]}" stroke-opacity="0.35" stroke-width="3"/>')
    if king:
        body += (f'<path d="M35 61 L40 42 L47 52 L50 38 L53 52 L60 42 L65 61 Z" fill="{T["bg"]}" fill-opacity="0.85"/>'
                 f'<rect x="35" y="61" width="30" height="4" rx="1.5" fill="{T["bg"]}" fill-opacity="0.85"/>')
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' if standalone else '<svg viewBox="0 0 100 100" class="piece">'
    return f'{head}{body}</svg>'

# ------------------------------------------------------------ aim trainer
def target_svg(state="live", standalone=True):
    a = T["amber"]; t = T["teal"]
    if state == "live":
        body = (f'<circle cx="50" cy="50" r="44" fill="none" stroke="{a}" stroke-width="4"/>'
                f'<circle cx="50" cy="50" r="33" fill="{a}" fill-opacity="0.16"/>'
                f'<circle cx="50" cy="50" r="21" fill="none" stroke="{a}" stroke-width="3"/>'
                f'<circle cx="50" cy="50" r="8" fill="{a}"/>')
    elif state == "hit":
        ticks = "".join(f'<line x1="50" y1="6" x2="50" y2="18" transform="rotate({i*45} 50 50)"/>' for i in range(8))
        body = (f'<g stroke="{t}" stroke-width="4" stroke-linecap="round">{ticks}</g>'
                f'<circle cx="50" cy="50" r="30" fill="none" stroke="{t}" stroke-width="3" stroke-opacity="0.6"/>'
                f'<circle cx="50" cy="50" r="8" fill="{t}"/>')
    else:  # miss
        body = (f'<g stroke="{T["rose"]}" stroke-width="4" stroke-linecap="round">'
                f'<line x1="38" y1="38" x2="62" y2="62"/><line x1="62" y1="38" x2="38" y2="62"/></g>')
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' if standalone else f'<svg viewBox="0 0 100 100" class="target {state}">'
    return f'{head}{body}</svg>'

# ---------------------------------------------------------------- cascade
def tile_svg(color, standalone=True):
    body = (f'<rect x="4" y="4" width="92" height="92" rx="16" fill="{color}"/>'
            f'<rect x="12" y="12" width="76" height="76" rx="11" fill="#ffffff" fill-opacity="0.14"/>'
            f'<rect x="12" y="12" width="76" height="40" rx="11" fill="#ffffff" fill-opacity="0.10"/>'
            f'<rect x="4" y="4" width="92" height="92" rx="16" fill="none" stroke="{T["bg"]}" stroke-opacity="0.6" stroke-width="3"/>')
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' if standalone else '<svg viewBox="0 0 100 100" class="tile">'
    return f'{head}{body}</svg>'

# ------------------------------------------------------------------ brand
def mark_svg(standalone=True):
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="9" fill="{T["faint"]}"/>'
                   for y in (20, 50, 80) for x in (20, 50, 80) if not (x == 50 and y == 50))
    body = (dots + f'<circle cx="50" cy="50" r="9" fill="{T["amber"]}"/>'
            f'<circle cx="50" cy="50" r="15" fill="none" stroke="{T["amber"]}" stroke-opacity="0.45" stroke-width="2"/>')
    head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' if standalone else '<svg viewBox="0 0 100 100" class="mark">'
    return f'{head}{body}</svg>'

# --------------------------------------------------------------- outputs
def write_files():
    out = {}
    for name in CHESS:
        for side in ("light", "dark"):
            out[f"chess/{side}-{name}.svg"] = chess_svg(name, side)
    for side in ("p1", "p2"):
        out[f"draughts/{side}.svg"] = draughts_svg(side)
        out[f"draughts/{side}-king.svg"] = draughts_svg(side, king=True)
    for state in ("live", "hit", "miss"):
        out[f"aim/target-{state}.svg"] = target_svg(state)
    for cname, color in (("amber", T["amber"]), ("blue", T["blue"]), ("teal", T["teal"]), ("rose", T["rose"]), ("ink", T["dim"])):
        out[f"cascade/tile-{cname}.svg"] = tile_svg(color)
    out["brand/mark.svg"] = mark_svg()
    tile = '<rect width="64" height="64" rx="14" fill="#0e1118"/>'
    dots = "".join(f'<circle cx="{x}" cy="{y}" r="4.6" fill="{T["faint"]}"/>'
                   for y in (16, 32, 48) for x in (16, 32, 48) if not (x == 32 and y == 32))
    out["brand/favicon.svg"] = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{tile}{dots}'
                                f'<circle cx="32" cy="32" r="4.6" fill="{T["amber"]}"/>'
                                f'<circle cx="32" cy="32" r="8" fill="none" stroke="{T["amber"]}" stroke-opacity="0.45" stroke-width="1.8"/></svg>')
    for rel, svg in out.items():
        p = HERE / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(svg + "\n")
    (HERE / "tokens.css").write_text(":root {\n" + "".join(f"  --{k}: {v};\n" for k, v in T.items()) + "}\n")
    return sorted(out)

# ------------------------------------------------------------ design sheet
def board_html(kind):
    """8x8 board as a CSS grid. kind: 'chess' (start position, e2-e4 played,
    g1 selected) or 'draughts' (start position with one king per side)."""
    cells = []
    if kind == "chess":
        back = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"]
        pos = {}
        for c, n in enumerate(back):
            pos[(0, c)] = ("dark", n); pos[(7, c)] = ("light", n)
            pos[(1, c)] = ("dark", "pawn"); pos[(6, c)] = ("light", "pawn")
        del pos[(6, 4)]; pos[(4, 4)] = ("light", "pawn")          # e2-e4
        last = {(6, 4), (4, 4)}; selected = {(7, 6)}; dots = {(5, 5), (5, 7)}
    else:
        pos = {}
        for r in range(8):
            for c in range(8):
                if (r + c) % 2 == 1:
                    if r < 3: pos[(r, c)] = ("p2", r == 0 and c == 1)
                    if r > 4: pos[(r, c)] = ("p1", r == 7 and c == 6)
        last = selected = dots = set()
    for r in range(8):
        for c in range(8):
            cls = "sq light" if (r + c) % 2 == 0 else "sq dark"
            if (r, c) in last: cls += " last"
            if (r, c) in selected: cls += " selected"
            inner = ""
            if (r, c) in pos:
                if kind == "chess":
                    side, name = pos[(r, c)]
                    inner = chess_svg(name, side, standalone=False)
                else:
                    side, king = pos[(r, c)]
                    inner = draughts_svg(side, king, standalone=False)
            if (r, c) in dots: inner += '<span class="dot-legal"></span>'
            label = ""
            if kind == "chess" and c == 0: label += f'<i class="rank">{8 - r}</i>'
            if kind == "chess" and r == 7: label += f'<i class="file">{"abcdefgh"[c]}</i>'
            cells.append(f'<div class="{cls}">{inner}{label}</div>')
    return f'<div class="board" role="img" aria-label="{kind} board">{"".join(cells)}</div>'

def piece_row(kind):
    if kind == "chess":
        items = [(f"{side} {n}", chess_svg(n, side, standalone=False), "sq " + ("dark" if side == "light" else "light"))
                 for side in ("light", "dark") for n in CHESS]
    else:
        items = [("player one", draughts_svg("p1", standalone=False), "sq dark"),
                 ("player one king", draughts_svg("p1", True, False), "sq dark"),
                 ("player two", draughts_svg("p2", standalone=False), "sq dark"),
                 ("player two king", draughts_svg("p2", True, False), "sq dark")]
    return '<div class="strip">' + "".join(
        f'<figure><div class="{cls} swatch-sq">{svg}</div><figcaption>{label}</figcaption></figure>'
        for label, svg, cls in items) + "</div>"

def cascade_piece(rows, color):
    cells = "".join(
        (tile_svg(color, standalone=False) if ch == "#" else "<i></i>") for row in rows for ch in row)
    return f'<div class="cpiece" style="--cols:{len(rows[0])}">{cells}</div>'

def build_sheet():
    css = """
<title>Arcade Asset Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700&family=Inter:wght@400;500;600&display=swap">
<style>
:root{
  --bg:#04050a;--surface:#0e1118;--raised:#161b27;--line:rgba(255,255,255,.10);
  --ink:#eef1f8;--dim:#9aa3b8;--faint:#5c6478;
  --amber:#ffb454;--blue:#7fb0ff;--teal:#5eead4;--rose:#ff5c7a;
  --sq-light:#3b4459;--sq-dark:#242b3c;
  --sans:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --display:'Inter Tight',Inter,ui-sans-serif,system-ui,sans-serif;
  --mono:ui-monospace,'SF Mono','JetBrains Mono',Menlo,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
a{color:var(--blue)}
.wrap{max-width:1120px;margin:0 auto;padding:2.5rem 1.5rem 5rem}
header.top{display:flex;align-items:flex-end;justify-content:space-between;gap:2rem;flex-wrap:wrap;padding-bottom:1.5rem;border-bottom:1px solid var(--line)}
.brand{display:inline-flex;align-items:center;gap:.6rem;font-family:var(--mono);font-size:.9rem;color:var(--dim);text-decoration:none}
.brand b{color:var(--ink);font-weight:600}
.brand .mark{width:20px;height:20px}
h1{font-family:var(--display);font-weight:700;font-size:clamp(2rem,4vw,3rem);letter-spacing:-.02em;line-height:1.05;margin:.6rem 0 .3rem;text-wrap:balance}
.lede{color:var(--dim);max-width:60ch;margin:0}
.meta{font-family:var(--mono);font-size:.76rem;color:var(--faint);text-align:right;line-height:1.7}
section{padding:2.75rem 0 0}
section+section{margin-top:2.75rem;border-top:1px solid var(--line)}
.eyebrow{font-family:var(--mono);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--amber);margin:0 0 .35rem}
h2{font-family:var(--display);font-weight:600;font-size:1.6rem;letter-spacing:-.015em;margin:0 0 .4rem;text-wrap:balance}
.note{color:var(--dim);max-width:62ch;margin:0 0 1.5rem}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:2rem;align-items:start}
@media(max-width:820px){.two{grid-template-columns:1fr}}
.notes{margin:0;padding:0;list-style:none;display:grid;gap:.6rem;color:var(--dim);font-size:.92rem}
.notes li{padding-left:1rem;position:relative}
.notes li::before{content:'';position:absolute;left:0;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--faint)}
.notes b{color:var(--ink);font-weight:500}

/* palette */
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.75rem}
.sw{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.sw i{display:block;height:64px}
.sw div{padding:.6rem .75rem .7rem;font-size:.8rem}
.sw div span{display:block;font-family:var(--mono);color:var(--faint);font-size:.72rem;margin-top:.15rem}

/* brand */
.lockups{display:flex;align-items:center;gap:2.5rem;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:1.5rem}
.lockups .brand.lg{font-size:1.5rem}.lockups .brand.lg .mark{width:36px;height:36px}
.lockups .brand.xl{font-size:2.6rem}.lockups .brand.xl .mark{width:60px;height:60px}

/* boards */
.board{display:grid;grid-template-columns:repeat(8,1fr);width:100%;max-width:448px;aspect-ratio:1;border-radius:6px;overflow:hidden;box-shadow:0 0 0 1px var(--line),0 24px 48px -24px rgba(0,0,0,.8)}
.sq{position:relative;aspect-ratio:1;display:grid;place-items:center}
.sq.light{background:var(--sq-light)}.sq.dark{background:var(--sq-dark)}
.sq.last{box-shadow:inset 0 0 0 100px rgba(255,180,84,.28)}
.sq.selected{box-shadow:inset 0 0 0 3px var(--amber)}
.sq .piece{width:86%;height:86%;display:block}
.dot-legal{position:absolute;width:26%;height:26%;border-radius:50%;background:var(--teal);opacity:.75}
.sq .rank,.sq .file{position:absolute;font:500 .58rem/1 var(--mono);font-style:normal;color:rgba(238,241,248,.45)}
.sq .rank{top:3px;left:4px}.sq .file{bottom:2px;right:4px}
.strip{display:grid;grid-template-columns:repeat(6,1fr);gap:.5rem}
.strip figure{margin:0;text-align:center}
.strip figcaption{font-family:var(--mono);font-size:.66rem;color:var(--faint);margin-top:.35rem}
.swatch-sq{border-radius:6px;aspect-ratio:1;display:grid;place-items:center}
.swatch-sq .piece{width:82%;height:82%}
.strip.four{grid-template-columns:repeat(4,1fr)}

/* aim */
.arena{background:var(--surface);border:1px solid var(--line);border-radius:12px;position:relative}
.arena.classic{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px;aspect-ratio:1;max-width:360px}
.arena.classic .cell{background:var(--raised);border-radius:8px;display:grid;place-items:center;aspect-ratio:1}
.arena.classic .target{width:64%;height:64%}
.arena.free{aspect-ratio:3/2;max-width:540px}
.arena.free .target{position:absolute;width:44px;height:44px;transform:translate(-50%,-50%)}
.arena .hud{position:absolute;top:8px;left:12px;right:12px;display:flex;justify-content:space-between;font-family:var(--mono);font-size:.72rem;color:var(--faint);pointer-events:none}
.arena .hud b{color:var(--ink);font-weight:500}
.results{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:1.1rem 1.25rem;display:grid;grid-template-columns:repeat(3,1fr);gap:.9rem 1.25rem;max-width:540px}
.results dt{font-family:var(--mono);font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:0}
.results dd{margin:.1rem 0 0;font-family:var(--display);font-size:1.5rem;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.results dd small{font-family:var(--mono);font-size:.7rem;color:var(--dim);font-weight:400;margin-left:.2rem;letter-spacing:0}
.results .best dd{color:var(--amber)}
.stack{display:grid;gap:1rem}

/* cascade */
.tiles{display:flex;gap:.5rem}
.tiles .tile{width:44px;height:44px}
.pieces{display:flex;gap:1.5rem;align-items:flex-end;flex-wrap:wrap}
.cpiece{display:grid;grid-template-columns:repeat(var(--cols),28px);gap:2px}
.cpiece .tile,.cpiece i{width:28px;height:28px;display:block}
.well{display:grid;grid-template-columns:repeat(8,1fr);gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px;max-width:264px}
.well i,.well .tile{aspect-ratio:1;display:block;border-radius:5px}
.well i{background:rgba(255,255,255,.025)}

/* volley */
.court{background:var(--surface);border:1px solid var(--line);border-radius:12px;aspect-ratio:18/11;max-width:540px;position:relative;overflow:hidden}
.court::before{content:'';position:absolute;left:50%;top:0;bottom:0;border-left:2px dashed rgba(255,255,255,.12)}
.paddle{position:absolute;width:10px;height:22%;border-radius:5px}
.paddle.l{left:5%;top:30%;background:var(--amber);box-shadow:0 0 14px rgba(255,180,84,.5)}
.paddle.r{right:5%;top:48%;background:var(--blue);box-shadow:0 0 14px rgba(127,176,255,.5)}
.ball{position:absolute;width:12px;height:12px;border-radius:50%;background:var(--ink);box-shadow:0 0 12px rgba(238,241,248,.6)}
.trail{position:absolute;border-radius:50%;background:var(--ink)}
.score{position:absolute;top:10px;left:0;right:0;text-align:center;font-family:var(--mono);font-size:1rem;color:var(--dim);font-variant-numeric:tabular-nums}
.score b{color:var(--ink);font-weight:500}

/* motion table + files */
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font-family:var(--mono);font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);font-weight:500}
td:first-child{color:var(--ink);font-weight:500}
td code,.note code,.notes code{font-family:var(--mono);font-size:.82em;color:var(--blue)}
.tablewrap{overflow-x:auto}
pre.tree{font-family:var(--mono);font-size:.78rem;color:var(--dim);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:1rem 1.25rem;overflow-x:auto;margin:0;line-height:1.6}
footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line);font-family:var(--mono);font-size:.74rem;color:var(--faint)}
@media(prefers-reduced-motion:no-preference){.target.hit{animation:burst 1.6s ease-out infinite}@keyframes burst{0%{transform:scale(.6);opacity:1}60%{transform:scale(1);opacity:.9}100%{transform:scale(1.08);opacity:0}}}

/* favicons */
.iconsizes{display:grid;gap:1rem}
.iconsizes figure{margin:0;display:flex;align-items:center;gap:1.25rem}
.iconrow{display:flex;align-items:flex-end;gap:.9rem}
.iconrow span{display:block}.iconrow svg{width:100%;height:100%;display:block}
.iconsizes figcaption{font-family:var(--mono);font-size:.72rem;color:var(--faint)}
.tabstrip{display:flex;gap:2px;padding:6px 6px 0;border-radius:10px 10px 0 0;overflow:hidden}
.tabstrip.light{background:#dfe1e6}.tabstrip.dark{background:#202124}
.tabstrip .tab{display:flex;align-items:center;gap:.5rem;padding:.45rem .8rem;border-radius:8px 8px 0 0;font:500 .74rem var(--sans);flex:1;min-width:0}
.tabstrip .tab .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tabstrip .tab .ico{width:16px;height:16px;flex:none}.tabstrip .tab .ico svg{width:100%;height:100%;display:block}
.tabstrip.light .tab{color:#3c4043}.tabstrip.light .tab.active{background:#fff}
.tabstrip.dark .tab{color:#bdc1c6}.tabstrip.dark .tab.active{background:#35363a;color:#e8eaed}
/* options */
.opts{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:1rem 1.25rem;display:grid;gap:.85rem}
.opt{display:grid;grid-template-columns:110px 1fr;align-items:center;gap:.4rem .75rem}
.opt label{font-family:var(--mono);font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.seg{display:inline-flex;flex-wrap:wrap;border:1px solid var(--line);border-radius:999px;padding:2px;gap:2px;justify-self:start}
.seg span{font-family:var(--mono);font-size:.74rem;padding:.3rem .7rem;border-radius:999px;color:var(--dim)}
.seg span.on{background:var(--ink);color:var(--bg)}
.seg span.soon{color:var(--faint);font-style:italic}
.range{position:relative;height:6px;border-radius:3px;background:var(--raised);align-self:center}
.range i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--amber)}
.range b{position:absolute;top:50%;width:16px;height:16px;border-radius:50%;background:var(--ink);transform:translate(-50%,-50%);box-shadow:0 0 0 3px var(--surface)}
.opt output{grid-column:2;font-family:var(--mono);font-size:.8rem;color:var(--ink)}
.opt output small{color:var(--faint);font-size:.7rem}
.xpick{display:flex;gap:.5rem}
.xh{width:40px;height:40px;border:1px solid var(--line);border-radius:8px;color:var(--dim);display:grid;place-items:center}
.xh svg{width:28px;height:28px}.xh.on{border-color:var(--amber);color:var(--ink);background:rgba(255,180,84,.08)}
.step{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;justify-self:start}
.step span{font-family:var(--mono);padding:.25rem .7rem;color:var(--dim)}.step b{font-family:var(--mono);font-weight:500;min-width:1.6rem;text-align:center}
.xhair{position:absolute;left:50%;top:50%;width:40px;height:40px;transform:translate(-50%,-50%);color:var(--ink);pointer-events:none}
.xhair svg{width:100%;height:100%}
.arena.classic .cap{position:absolute;left:0;right:0;bottom:-1.5rem;text-align:center;font-family:var(--mono);font-size:.7rem;color:var(--faint)}
/* online */
figure.diagram{margin:0}
figure.diagram svg{width:100%;height:auto;display:block}
figure.diagram figcaption{font-size:.82rem;color:var(--dim);margin-top:.6rem;max-width:60ch}
.hudstrip{display:grid;gap:.5rem}
.hudline{display:flex;align-items:center;gap:.7rem;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:.6rem .9rem;font-family:var(--mono);font-size:.78rem;color:var(--dim)}
.hudline i{width:8px;height:8px;border-radius:50%;flex:none}
.hudline b{color:var(--ink);font-weight:500}.hudline em{margin-left:auto;font-style:normal;color:var(--faint)}
</style>
"""
    sw = [("bg", "#04050a", "page ground, shared with /lab/"), ("surface", "#0e1118", "arenas, panels"),
          ("raised", "#161b27", "grid cells, wells"), ("ink", "#eef1f8", "text, light paddle, ball"),
          ("dim", "#9aa3b8", "secondary text"), ("faint", "#5c6478", "labels, resting mark dots"),
          ("amber", "#ffb454", "arcade accent · player one · targets"), ("blue", "#7fb0ff", "lab accent · player two"),
          ("teal", "#5eead4", "hit, legal move, success"), ("rose", "#ff5c7a", "miss, check, danger"),
          ("sq-light", "#3b4459", "board light square"), ("sq-dark", "#242b3c", "board dark square")]
    swatches = "".join(f'<div class="sw"><i style="background:{hexv}"></i><div>{n}<span>{hexv} · {role}</span></div></div>' for n, hexv, role in sw)

    brand = lambda cls="": f'<a class="brand {cls}" href="#">{mark_svg(False)}<span>arc<b>ade</b></span></a>'

    classic_cells = []
    layout = {(0, 1): "live", (1, 2): "live", (2, 0): "live", (1, 0): "hit"}
    for r in range(3):
        for c in range(3):
            st = layout.get((r, c))
            classic_cells.append(f'<div class="cell">{target_svg(st, False) if st else ""}</div>')
    free_pts = [(14, 28), (41, 20), (72, 34), (26, 68), (58, 62), (87, 74)]
    free = "".join(f'<div style="position:absolute;left:{x}%;top:{y}%;width:44px;height:44px;transform:translate(-50%,-50%)">{target_svg("live", False)}</div>' for x, y in free_pts)

    well_rows = ["........", "........", "........", "..a.....", ".aab..r.", "bbbt.rrr"]
    colors = {"a": T["amber"], "b": T["blue"], "t": T["teal"], "r": T["rose"]}
    well = "".join((tile_svg(colors[ch], False) if ch in colors else "<i></i>") for row in well_rows for ch in row)

    html = css + f"""
<div class="wrap">
<header class="top">
  <div>
    {brand()}
    <h1>Arcade asset sheet</h1>
    <p class="lede">Original artwork for <code>kiranyarlagadda.dev/arcade</code>: a chess set, draughts, aim-trainer targets, falling-block tiles, the paddle court, the mark that ties them to Element Lab, the site's new favicons, and mockups of the aim-trainer options and online play. Single dark theme by design, on the same ground as <code>/lab/</code>.</p>
  </div>
  <div class="meta">v0 · 2026-09-05<br>26 SVG files · generated by build.py<br>MIT with the repo</div>
</header>

<section id="palette">
  <p class="eyebrow">Palette</p>
  <h2>Two accents, one for each player</h2>
  <p class="note">The ink, ground and blue are lifted straight from the lab's stylesheet so the two pages read as siblings. Amber is the arcade's own accent and player one everywhere; the lab blue is player two. Teal and rose are semantic only, never decorative.</p>
  <div class="swatches">{swatches}</div>
</section>

<section id="brand">
  <p class="eyebrow">Brand</p>
  <h2>The lab's dot, multiplied into the first game's grid</h2>
  <p class="note">Element Lab's brand is a single glowing dot. Arcade's mark is that dot nine times over in the 3 by 3 layout of the aim trainer's Classic mode, with one lit. Same mono lowercase lockup as <code>element<b>lab</b></code>.</p>
  <div class="lockups">{brand()}{brand("lg")}{brand("xl")}</div>
</section>

<section id="chess">
  <p class="eyebrow">Chess</p>
  <h2>A flat, own-drawn set with a shared plinth</h2>
  <p class="note">Six silhouettes on a 100 by 100 grid, every piece standing on the same plinth so the set sits level on a rank. Both sides carry a 3px outline in the opposite tone, which is what keeps dark pieces legible on dark squares. Shown after 1. e4 with the g1 knight selected.</p>
  <div class="two">
    <div>{board_html("chess")}</div>
    <div class="stack">
      {piece_row("chess")}
      <ul class="notes">
        <li><b>Last move</b> is an amber wash on both squares; <b>selection</b> is a 3px amber inset ring; <b>legal moves</b> are teal dots. Check is a rose ring on the king, not shown here.</li>
        <li>The knight is the only asymmetric piece and faces left on both sides, the convention every printed set follows.</li>
        <li>Slate board rather than wood or green: it is the one board colour that sits inside this palette instead of fighting it.</li>
        <li>Files: <code>design/chess/&lt;side&gt;-&lt;piece&gt;.svg</code>, 12 in total. No share-alike anywhere; these are ours.</li>
      </ul>
    </div>
  </div>
</section>

<section id="draughts">
  <p class="eyebrow">Draughts</p>
  <h2>Discs in the two player colours, crowned to promote</h2>
  <p class="note">Same board, same squares. Pieces are the two accents so a player's colour is consistent from the draughts board to the paddle court. A king carries the queen's crown from the chess set at 85% ink, so promotion reads at a glance without a second disc stacked on top.</p>
  <div class="two">
    <div>{board_html("draughts")}</div>
    <div class="stack">
      {piece_row("draughts")}
      <ul class="notes">
        <li>Start position with one king per side for reference; kings do not exist at the start of a real game.</li>
        <li>Two inner rings at low opacity give the disc a turned edge without a gradient, so it stays crisp at 40px on a phone.</li>
        <li>Mandatory captures are highlighted by the same teal dots as chess, on the landing square.</li>
      </ul>
    </div>
  </div>
</section>

<section id="aim">
  <p class="eyebrow">Aim Trainer</p>
  <h2>Classic on the 3 by 3, Freeshot anywhere</h2>
  <p class="note">A target is four concentric marks in amber: ring, tinted disc, ring, dot. On a hit it collapses to a teal dot and eight radial ticks that fade in 180 ms; a miss leaves a rose cross for 120 ms where the pointer landed. Classic keeps three targets live in nine cells; Freeshot keeps six live anywhere, each at least a diameter from the next.</p>
  <div class="two">
    <div class="stack">
      <div class="arena classic">{"".join(classic_cells)}</div>
      <div class="arena free"><div class="hud"><span>freeshot · <b>0:21</b></span><span>hits <b>47</b> · acc <b>96%</b></span></div>{free}</div>
    </div>
    <div class="stack">
      <dl class="results">
        <div><dt>Hits</dt><dd>71</dd></div>
        <div><dt>Misses</dt><dd>4</dd></div>
        <div><dt>Accuracy</dt><dd>94.7<small>%</small></dd></div>
        <div><dt>Targets / s</dt><dd>2.37</dd></div>
        <div><dt>Mean hit interval</dt><dd>421<small>ms</small></dd></div>
        <div class="best"><dt>Best · classic 30s</dt><dd>78</dd></div>
      </dl>
      <ul class="notes">
        <li>The results panel is the only place the display face is used at size, and the only place numbers are large. It is the reward screen, so it gets the type.</li>
        <li>Targets are drawn at 64% of the cell in Classic and 44px in Freeshot; hit radius equals the outer ring, never the cell.</li>
        <li>Files: <code>design/aim/target-live.svg</code>, <code>target-hit.svg</code>, <code>target-miss.svg</code>.</li>
      </ul>
    </div>
  </div>
</section>

<section id="cascade">
  <p class="eyebrow">Cascade · working name</p>
  <h2>A tile with a bevel, in the palette's five hues</h2>
  <p class="note">One rounded tile with two translucent highlight panels does the bevel without gradients. Colour is per piece, not per cell, so a line clear can flash by hue. The piece set below is a sample of a mixed 3-and-5 set, which is the current lead for Phase 4; the well is 8 wide, deliberately not the well everyone else uses.</p>
  <div class="two">
    <div class="stack">
      <div class="tiles">{"".join(tile_svg(c, False) for c in (T["amber"], T["blue"], T["teal"], T["rose"], T["dim"]))}</div>
      <div class="pieces">
        {cascade_piece(["###"], T["amber"])}
        {cascade_piece(["#..", "###"], T["blue"])}
        {cascade_piece([".##", "##.", "#.."], T["teal"])}
        {cascade_piece(["##", "##", "#."], T["rose"])}
        {cascade_piece(["###", ".#.", ".#."], T["dim"])}
      </div>
    </div>
    <div class="stack">
      <div class="well">{well}</div>
      <ul class="notes">
        <li>Highlight panels are white at 14% and 10%, so the same tile file works for every hue and the bevel never needs a second asset.</li>
        <li>Empty cells are a 2.5% white so the well has a visible grid without lines.</li>
        <li>Files: <code>design/cascade/tile-&lt;hue&gt;.svg</code>, five in total.</li>
      </ul>
    </div>
  </div>
</section>

<section id="volley">
  <p class="eyebrow">Volley · working name</p>
  <h2>Two paddles in the player colours, a ball that leaves light</h2>
  <p class="note">The court is the arena surface with a dashed centre line. Paddles glow in their player colour; the ball is ink with a four-dot trail that shortens as it slows. Nothing here is an asset file, it is all CSS and canvas, which is the point: the paddle game should cost under 10 KB.</p>
  <div class="two">
    <div class="court">
      <div class="score"><b>3</b> : <b>2</b></div>
      <div class="paddle l"></div><div class="paddle r"></div>
      <div class="trail" style="left:52%;top:58%;width:5px;height:5px;opacity:.15"></div>
      <div class="trail" style="left:55%;top:54.5%;width:7px;height:7px;opacity:.3"></div>
      <div class="trail" style="left:58%;top:51%;width:9px;height:9px;opacity:.5"></div>
      <div class="ball" style="left:61%;top:47%"></div>
    </div>
    <ul class="notes">
      <li>Player one is always amber and always on the left; the AI opponent is always blue. Same mapping as draughts.</li>
      <li>Serve direction is shown by a brief amber or blue pulse on the centre line, not by text.</li>
    </ul>
  </div>
</section>

<section id="motion">
  <p class="eyebrow">Motion</p>
  <h2>Short, decisive, and gone under reduced motion</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Moment</th><th>Duration</th><th>Easing</th><th>Reduced motion</th></tr></thead>
    <tbody>
      <tr><td>Piece slide (chess, draughts)</td><td>120 ms</td><td>ease-out</td><td>instant</td></tr>
      <tr><td>Capture fade</td><td>160 ms</td><td>ease-in</td><td>instant</td></tr>
      <tr><td>Target hit burst</td><td>180 ms</td><td>ease-out, scale .6 to 1.08</td><td>colour swap only</td></tr>
      <tr><td>Miss cross</td><td>120 ms</td><td>linear fade</td><td>colour swap only</td></tr>
      <tr><td>Tile lock</td><td>80 ms</td><td>ease-out</td><td>instant</td></tr>
      <tr><td>Line clear</td><td>220 ms</td><td>hue flash then collapse</td><td>collapse only</td></tr>
      <tr><td>Paddle glow on hit</td><td>140 ms</td><td>ease-out</td><td>none</td></tr>
    </tbody>
  </table></div>
</section>

<section id="files">
  <p class="eyebrow">Files</p>
  <h2>One generator, twenty-six assets</h2>
  <p class="note">Every path above lives in <code>design/build.py</code>; the home and lab favicons come from <code>tools/favicons.py</code> in the site repo. Running it rewrites the SVG files, <code>tokens.css</code>, and this sheet, so the geometry can never drift between the standalone files and the preview.</p>
<pre class="tree">design/
├── build.py            geometry and this sheet
├── tokens.css          the palette as custom properties
├── sheet.html          this page
├── brand/              mark.svg favicon.svg
├── chess/              light-*.svg, dark-*.svg × pawn rook knight bishop queen king
├── draughts/           p1.svg p1-king.svg p2.svg p2-king.svg
├── aim/                target-live.svg target-hit.svg target-miss.svg
└── cascade/            tile-amber blue teal rose ink .svg</pre>
</section>

<footer>All artwork original. Ships MIT with kiranyarlagadda/arcade. No trademarked names appear in this sheet or in the files.</footer>
</div>
"""

    # ---- favicons: the two site icons are read from the site repo when present.
    site = Path.home() / "Developer/kiranyarlagadda.dev"
    def icon(path):
        try:
            return path.read_text().strip()
        except OSError:
            return mark_svg()
    fav = [
        ("home · projects", icon(site / "favicon.svg"), "Kiran Yarlagadda"),
        ("lab", icon(site / "lab/favicon.svg"), "Element Lab | Kiran Yarlagadda"),
        ("arcade", (HERE / "brand/favicon.svg").read_text().strip(), "Arcade | Kiran Yarlagadda"),
    ]
    sizes = "".join(
        '<figure><div class="iconrow">' + "".join(f'<span style="width:{sz}px;height:{sz}px">{svg}</span>' for sz in (64, 32, 16))
        + f'</div><figcaption>{label}</figcaption></figure>' for label, svg, _ in fav)
    def tabstrip(theme):
        tabs = "".join(f'<div class="tab{" active" if i == 2 else ""}"><span class="ico">{svg}</span><span class="t">{title}</span></div>'
                       for i, (_, svg, title) in enumerate(fav))
        return f'<div class="tabstrip {theme}">{tabs}</div>'
    favicons_section = f"""
<section id="favicons">
  <p class="eyebrow">Favicons</p>
  <h2>One tile, three marks, every page</h2>
  <p class="note">The site had one generic <code>favicon.ico</code>. Now each page carries its own mark on the same dark rounded tile: an orbit for the home and projects pages, the glowing lab dot for <code>/lab/</code>, and the arcade grid for <code>/arcade/</code>. Shown at 64, 32 and 16 px, then in a tab strip on both browser themes, which is the only place a favicon is ever really seen.</p>
  <div class="two">
    <div class="iconsizes">{sizes}</div>
    <div class="stack">{tabstrip("light")}{tabstrip("dark")}
      <ul class="notes">
        <li>Each page links the SVG first, then the ICO (16 and 32 px) and a 180 px PNG for iOS. Safari ignores SVG favicons and falls through to the ICO, so all three stay.</li>
        <li>Generated by <code>tools/favicons.py</code> in the site repo with macOS <code>qlmanage</code> and <code>sips</code>; nothing to install.</li>
      </ul>
    </div>
  </div>
</section>
"""

    # ---- aim trainer options, shown in raw mode with the crosshair drawn by the game.
    xh = {
        "dot": '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="3.5" fill="currentColor"/></svg>',
        "cross": '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 8v7M20 25v7M8 20h7M25 20h7"/></svg>',
        "circle": '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="20" cy="20" r="8"/><circle cx="20" cy="20" r="1.5" fill="currentColor"/></svg>',
    }
    xpick = "".join(f'<span class="xh{" on" if k == "dot" else ""}" title="{k}">{v}</span>' for k, v in xh.items())
    raw_cells = []
    for r in range(3):
        for c in range(3):
            st = {(0, 2): "live", (1, 1): "live", (2, 0): "live"}.get((r, c))
            raw_cells.append(f'<div class="cell">{target_svg(st, False) if st else ""}</div>')
    options_section = f"""
<section id="options">
  <p class="eyebrow">Aim Trainer · options</p>
  <h2>Raw input is what makes a sensitivity slider honest</h2>
  <p class="note">In cursor mode the page cannot change pointer speed; the OS owns it. Raw mode takes pointer lock, hides the cursor, multiplies <code>movementX</code> by the slider and draws its own crosshair, which is how desktop trainers work and what lets a number transfer to a game. The panel is shown in raw mode. Every value persists and mirrors to an attribute, so a preset is a URL.</p>
  <div class="two">
    <div class="opts">
      <div class="opt"><label>Input</label><div class="seg"><span>cursor</span><span class="on">raw</span></div></div>
      <div class="opt"><label>Sensitivity</label><div class="range"><i style="width:38%"></i><b style="left:38%"></b></div><output>1.00 <small>× mouse DPI · at 800 DPI that is 800 eDPI</small></output></div>
      <div class="opt"><label>Crosshair</label><div class="xpick">{xpick}</div></div>
      <div class="opt"><label>Target size</label><div class="seg"><span>small</span><span class="on">medium</span><span>large</span></div></div>
      <div class="opt"><label>Duration</label><div class="seg"><span class="on">30 s</span><span>60 s</span></div></div>
      <div class="opt"><label>Live targets</label><div class="step"><span>&minus;</span><b>3</b><span>+</span></div></div>
      <div class="opt"><label>Mode</label><div class="seg"><span class="on">classic</span><span>freeshot</span><span class="soon">more to come</span></div></div>
    </div>
    <div class="stack">
      <div class="arena classic">{"".join(raw_cells)}<div class="xhair">{xh["dot"]}</div><span class="cap">raw mode: cursor hidden, crosshair drawn by the game, Esc pauses</span></div>
      <ul class="notes" style="margin-top:1.25rem">
        <li>Pointer lock is requested with <code>unadjustedMovement: true</code> where supported, which bypasses OS acceleration. Losing the lock pauses the run, it does not end it.</li>
        <li>Touch devices are cursor mode only; the slider is greyed out there and in cursor mode on desktop.</li>
        <li>Modes are a registry, one file each, so the next mode is one file.</li>
      </ul>
    </div>
  </div>
</section>
"""

    # ---- online play: the mechanism, not a box labelled "server".
    hud = "".join(
        f'<div class="hudline"><i style="background:{col}"></i><span>volley · online · rtt <b>{ms} ms</b></span><em>{label}</em></div>'
        for ms, col, label in ((34, T["teal"], "feels local"), (118, T["amber"], "playable"), (212, T["rose"], "floaty, and the page says so")))
    d, ink, raised, amber = T["dim"], T["ink"], T["raised"], T["amber"]
    diagram = f"""<figure class="diagram">
<svg viewBox="0 0 760 300" role="img" aria-label="Two browsers run the same simulation. A signaling service on the VPS introduces them, then the game travels on a direct WebRTC data channel, using the service as a relay only if the direct path fails.">
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="{d}"/></marker>
<marker id="aha" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="{amber}"/></marker>
</defs>
<g font-family="ui-monospace,'SF Mono',Menlo,monospace" font-size="12" fill="{ink}">
<rect x="220" y="16" width="320" height="64" rx="10" fill="{raised}" stroke="{d}" stroke-opacity=".35"/>
<text x="380" y="41" text-anchor="middle" font-weight="600">signal + relay · VPS</text>
<text x="380" y="61" text-anchor="middle" fill="{d}">room 7f3k-q2mz · in memory · no database</text>
<rect x="20" y="170" width="230" height="114" rx="10" fill="{raised}" stroke="{d}" stroke-opacity=".35"/>
<text x="36" y="196" font-weight="600">host · made the room</text>
<text x="36" y="219" fill="{d}">runs the 60 Hz sim</text>
<text x="36" y="238" fill="{d}">owns the ball and the score</text>
<text x="36" y="257" fill="{d}">predicts its own paddle</text>
<rect x="510" y="170" width="230" height="114" rx="10" fill="{raised}" stroke="{d}" stroke-opacity=".35"/>
<text x="526" y="196" font-weight="600">guest · opened the link</text>
<text x="526" y="219" fill="{d}">runs the same sim</text>
<text x="526" y="238" fill="{d}">predicts its own paddle</text>
<text x="526" y="257" fill="{d}">extrapolates ball by RTT/2</text>
<g stroke="{d}" stroke-width="1.5" stroke-dasharray="5 4" fill="none">
<line x1="135" y1="170" x2="300" y2="80" marker-start="url(#ah)" marker-end="url(#ah)"/>
<line x1="625" y1="170" x2="460" y2="80" marker-start="url(#ah)" marker-end="url(#ah)"/>
</g>
<text x="380" y="112" text-anchor="middle" fill="{d}">handshake both sides</text>
<text x="380" y="130" text-anchor="middle" fill="{d}">relay only if direct fails</text>
<line x1="250" y1="227" x2="510" y2="227" stroke="{amber}" stroke-width="2.5" marker-start="url(#aha)" marker-end="url(#aha)"/>
<text x="380" y="215" text-anchor="middle" fill="{amber}" font-weight="600">direct data channel · 1 RTT</text>
<text x="380" y="248" text-anchor="middle" fill="{d}">state at 30 Hz →</text>
<text x="380" y="266" text-anchor="middle" fill="{d}">← input with a tick number</text>
</g>
</svg>
<figcaption>The service only introduces the two browsers. The game itself runs peer to peer, and the host is the authority on the ball.</figcaption>
</figure>"""
    online_section = f"""
<section id="online">
  <p class="eyebrow">Volley · online</p>
  <h2>A stateless introduction, then peer to peer</h2>
  <p class="note">Two browsers cannot find each other unaided. A tiny service on the VPS holds a room code for a few minutes and passes the WebRTC handshake between them; after that the game runs on a direct data channel and the service is idle. It relays the game only when NAT traversal fails, about one pair in ten. Draughts goes online first, where a slow link is just a slow move; Volley reuses the plumbing and adds the real-time layer.</p>
  <div class="two">
    {diagram}
    <div class="stack">
      <div class="hudstrip">{hud}</div>
      <ul class="notes">
        <li>Room links look like <code>/arcade/volley/#r=7f3k-q2mz</code>. No accounts, no lobby, no chat, nothing to moderate.</li>
        <li>Both sides run one deterministic 60 Hz simulation. The host sends full state at 30 Hz; the guest sends only input. Each moves its own paddle instantly, and on disagreement the host wins, corrected over a few frames rather than snapped.</li>
        <li>About a kilobyte a second per player, relayed or not.</li>
      </ul>
    </div>
  </div>
</section>
"""
    html = html.replace('<section id="chess">', favicons_section + '\n<section id="chess">', 1)
    html = html.replace('<section id="cascade">', options_section + '\n<section id="cascade">', 1)
    html = html.replace('<section id="motion">', online_section + '\n<section id="motion">', 1)
    (HERE / "_diagram.svg").write_text(diagram[diagram.index("<svg"):diagram.index("</svg>") + 6]
                                       .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" style="background:#04050a" ', 1))
    (HERE / "sheet.html").write_text(html)
    print("wrote sheet.html")


if __name__ == "__main__":
    files = write_files()
    print(f"wrote {len(files)} svg files + tokens.css")
    # Contact sheet: every asset family on real grounds, for a quick visual check.
    cells = []
    def cell(x, y, ground, svg):
        cells.append(f'<rect x="{x}" y="{y}" width="100" height="100" fill="{ground}"/>'
                     f'<g transform="translate({x} {y})">{svg.replace("<svg ", "<svg width=\"100\" height=\"100\" ", 1)}</g>')
    for i, name in enumerate(CHESS):
        for j, side in enumerate(("light", "dark")):
            for k, sq in enumerate(("sq-light", "sq-dark")):
                cell(i * 100, (j * 2 + k) * 100, T[sq], chess_svg(name, side, standalone=False))
    row = [draughts_svg("p1", standalone=False), draughts_svg("p1", True, False),
           draughts_svg("p2", standalone=False), draughts_svg("p2", True, False),
           mark_svg(False), tile_svg(T["amber"], False)]
    for i, svg in enumerate(row):
        cell(i * 100, 400, T["sq-dark"] if i < 4 else T["surface"], svg)
    row = [target_svg("live", False), target_svg("hit", False), target_svg("miss", False),
           tile_svg(T["blue"], False), tile_svg(T["teal"], False), tile_svg(T["rose"], False)]
    for i, svg in enumerate(row):
        cell(i * 100, 500, T["surface"], svg)
    sheet = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="1200" height="1200">'
             + "".join(cells) + '</svg>')
    (HERE / "_contact.svg").write_text(sheet)
    build_sheet()
