// B&B Park — "L'atelier" illustration kit: board, pizza, kraft box (base, lid outside, lid inside).
// Regenerate with:  node src/assets/pizza/generate.mjs  (writes the five SVG files next to this script)
//
// Every id and class is prefixed with `atl-` (all five drawings are inlined in the same page), each file
// carries only the <defs> it uses, and the output is minified. Layer contract used by
// src/site/sections/Atelier.tsx:
//   board.svg       #atl-board
//   pizza.svg       #atl-dough, #atl-sauce (masked by #atl-p-spiral while it spreads), #atl-cheese > .atl-patch,
//                   #atl-baked (below the toppings: it tints the crust and the mozzarella), #atl-toppings > .atl-topping
//   box-base.svg    the open box (shadow + inside), 900×900 at 50..950
//   lid-outside.svg the closed lid with the B&B seal (same square; hinge on y = 50)
//   lid-inside.svg  the inside of the lid, pre-flipped so that rotateX(180deg) on the face + rotateX(-180deg) on
//                   the lid shows it upright above the box. Text placeholders: {{greeting}} and {{since}} (i18n).
// Geometry is deterministic (seeded PRNG): running the script twice gives the same files.
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const TAU = Math.PI * 2, DEG = Math.PI / 180, C = 500;
/* ---------------------------------------------------------------- helpers */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => { let v = Math.round(n * 10) / 10; if (Object.is(v, -0) || v === 0) v = 0; return String(v); };
const P = (p) => f(p[0]) + ' ' + f(p[1]);
const lerp = (a, b, t) => a + (b - a) * t;
const rr = (rng, a, b) => a + (b - a) * rng();

function smoothClosed(pts, k = 1) {
  const n = pts.length; let d = 'M' + P(pts[0]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
    d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
  }
  return d + 'Z';
}
function smoothOpen(pts, k = 1) {
  const n = pts.length; let d = 'M' + P(pts[0]);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
    d += 'C' + P(c1) + ' ' + P(c2) + ' ' + P(p2);
  }
  return d;
}
function noiseFn(rng, harmonics) {
  const hs = harmonics.map(([fr, amp]) => ({ fr, amp, ph: rng() * TAU }));
  return (th) => hs.reduce((s, h) => s + h.amp * Math.sin(h.fr * th + h.ph), 0);
}
function blob(rng, r, n, harmonics, sx = 1, sy = 1, cx = 0, cy = 0) {
  const nz = noiseFn(rng, harmonics); const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU, q = r * (1 + nz(th));
    pts.push([cx + q * Math.cos(th) * sx, cy + q * Math.sin(th) * sy]);
  }
  return pts;
}
const ringPath = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
const stops = (arr) => arr.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op !== undefined ? ` stop-opacity="${op}"` : ''}/>`).join('');
const radial = (id, s, attrs = '') => `<radialGradient id="${id}" ${attrs}>${stops(s)}</radialGradient>`;
const linear = (id, s, attrs = '') => `<linearGradient id="${id}" ${attrs}>${stops(s)}</linearGradient>`;
const rot = (p, a) => { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const speck = (x, y, s, rng) => { const a = rng() * 180; const p = [[0, -s], [s * .8, 0], [0, s], [-s * .8, 0]].map((q) => rot(q, a)); return `M${P([x + p[0][0], y + p[0][1]])}L${P([x + p[1][0], y + p[1][1]])} ${P([x + p[2][0], y + p[2][1]])} ${P([x + p[3][0], y + p[3][1]])}Z`; };

/* ======================================================= PIZZA GEOMETRY */
const RD = 360; // dough radius (diameter 720)
const doughNz = noiseFn(mulberry32(11), [[3, .006], [5, .005], [8, .0035], [13, .002]]);
const doughR = (th) => RD * (1 + doughNz(th));
const ringAt = (fr, n = 96, nz = doughNz, off = 0) => { const pts = []; for (let i = 0; i < n; i++) { const th = (i / n) * TAU; const q = fr * RD * (1 + nz(th)) + off; pts.push([C + q * Math.cos(th), C + q * Math.sin(th)]); } return pts; };
const doughD = smoothClosed(ringAt(1));

const RS = 294; // sauce radius
const sauceNz = noiseFn(mulberry32(23), [[2, .012], [3, .012], [5, .01], [8, .008], [13, .006], [19, .004], [27, .003]]);
const sauceR = (th) => RS * (1 + sauceNz(th));
const saucePts = []; for (let i = 0; i < 132; i++) { const th = (i / 132) * TAU; saucePts.push([C + sauceR(th) * Math.cos(th), C + sauceR(th) * Math.sin(th)]); }
const sauceD = smoothClosed(saucePts);
let sMin = 1e9, sMax = 0; for (let i = 0; i < 720; i++) { const q = sauceR(i / 720 * TAU); sMin = Math.min(sMin, q); sMax = Math.max(sMax, q); }

/* ---------------------------------------------------------------- defs */
const pzDefs = [];
// light direction: from top-left. Board is rotated by BA degrees in its own group.
const BA = 42;
const toLocal = (gx, gy) => rot([gx - C, gy - C], -BA);
{
  const a = toLocal(170, 170), b = toLocal(830, 830);
  const lg = `gradientUnits="userSpaceOnUse" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"`;
  pzDefs.push(linear('pz-wood', [[0, '#ecd3a6'], [.45, '#e0bf8d'], [1, '#cfa670']], lg));
  pzDefs.push(linear('pz-bevel', [[0, '#f7e6c6'], [.4, '#d9b27b'], [.75, '#b98b55'], [1, '#9d7040']], lg));
  pzDefs.push(linear('pz-sheen', [[0, '#fff', .28], [.35, '#fff', .05], [.6, '#fff', 0], [1, '#5a3614', .12]], lg));
}
pzDefs.push(radial('pz-boardShadow', [[0, '#3a2210', .34], [.88, '#3a2210', .3], [.95, '#3a2210', .12], [1, '#3a2210', 0]], `gradientUnits="userSpaceOnUse" cx="${C + 14}" cy="${C + 22}" r="440"`));
pzDefs.push(radial('pz-pizzaShadow', [[0, '#3a200c', .3], [.9, '#3a200c', .26], [.955, '#3a200c', .1], [1, '#3a200c', 0]], `gradientUnits="userSpaceOnUse" cx="${C + 8}" cy="${C + 13}" r="386"`));
pzDefs.push(radial('pz-crust', [[0, '#f1ddb8'], [.83, '#eed6ac'], [.862, '#e2c392'], [.888, '#f2e0bd'], [.918, '#f8ead0'], [.955, '#f0d9b0'], [.985, '#dfbf8c'], [1, '#d1ae79']], `gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${RD + 2}"`));
pzDefs.push(linear('pz-light', [[0, '#fff', .3], [.42, '#fff', 0], [.6, '#6b4320', 0], [1, '#6b4320', .2]], 'gradientUnits="userSpaceOnUse" x1="170" y1="170" x2="830" y2="830"'));
pzDefs.push(linear('pz-rimIn', [[0, '#8a5d2e', .22], [.5, '#8a5d2e', 0], [.55, '#fff', 0], [1, '#fff', .35]], 'gradientUnits="userSpaceOnUse" x1="250" y1="250" x2="750" y2="750"'));
pzDefs.push(radial('pz-sauce', [[0, '#c9442a'], [.55, '#c03b24'], [.88, '#ad2f1c'], [1, '#982616']], `gradientUnits="userSpaceOnUse" cx="${C - 20}" cy="${C - 24}" r="${RS + 20}"`));
pzDefs.push(radial('pz-cheese', [[0, '#fffdf8'], [.5, '#fdf6e6'], [.78, '#f7e9cc'], [.92, '#f0d9ae'], [1, '#e8c994']], 'cx=".5" cy=".5" r=".5" fx=".42" fy=".38"'));
pzDefs.push(radial('pz-cheeseBake', [[0, '#e0a95a', 0], [.5, '#e0a95a', .08], [.78, '#d99a4c', .3], [.93, '#c98537', .55], [1, '#b8742c', .7]], 'cx=".5" cy=".5" r=".5"'));
pzDefs.push(radial('pz-crustBake', [[0, '#c98a45', 0], [.855, '#c98a45', 0], [.875, '#b8733a', .5], [.9, '#d49a55', .45], [.93, '#d8a25c', .42], [.965, '#bf7c3c', .62], [.99, '#9c5a25', .8], [1, '#8a4a1c', .85]], `gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${RD + 2}"`));

/* ---------------------------------------------------------------- BOARD */
const board = [];
{
  const rng = mulberry32(7);
  const RB = 408, phi = Math.asin(72 / RB), hx = RB * Math.cos(phi);
  // board outline (local frame: centre 0,0, handle along +x)
  const shape = `M${f(hx)} ${f(-72)}A${RB} ${RB} 0 1 0 ${f(hx)} 72Q430 40 474 38L532 38A38 38 0 0 0 532 -38L474 -38Q430 -40 ${f(hx)} ${f(-72)}Z`;
  const hole = ringPath(537, 0, 10.5);
  pzDefs.push(`<path id="pz-boardShape" d="${shape}${hole}" fill-rule="evenodd"/>`);
  pzDefs.push(`<clipPath id="pz-boardClip"><use href="#pz-boardShape"/></clipPath>`);
  // shadow (global frame)
  board.push(`<circle cx="${C + 14}" cy="${C + 22}" r="440" fill="url(#pz-boardShadow)"/>`);
  board.push(`<g transform="translate(${C + 14} ${C + 22}) rotate(${BA})" fill="none" stroke="#3a2210" stroke-linejoin="round"><path d="M400 0L532 0" stroke-width="96" stroke-opacity=".08" stroke-linecap="round"/><path d="M400 0L532 0" stroke-width="84" stroke-opacity=".12" stroke-linecap="round"/></g>`);
  const g = [];
  // thickness / side of the board peeking out at bottom-right
  const tv = rot([2.5, 6], -BA);
  g.push(`<use href="#pz-boardShape" transform="translate(${f(tv[0])} ${f(tv[1])})" fill="#a0713f"/>`);
  g.push(`<use href="#pz-boardShape" fill="url(#pz-wood)"/>`);
  // glued strips + grain (clipped)
  const cl = [];
  let y = -416; const seams = []; const strips = [];
  const widths = [150, 170, 140, 175, 160, 190];
  for (let i = 0; y < 416; i++) { const w = widths[i % widths.length]; strips.push([y, Math.min(w, 416 - y), i]); y += w; if (y < 416) seams.push(y); }
  strips.forEach(([y0, h, i]) => { if (i % 2 === 0) cl.push(`<rect x="-420" y="${f(y0)}" width="1000" height="${f(h)}" fill="#fff" opacity=".07"/>`); else if (i % 3 === 1) cl.push(`<rect x="-420" y="${f(y0)}" width="1000" height="${f(h)}" fill="#7a4a1c" opacity=".05"/>`); });
  // grain lines
  const grain = [[], [], []];
  for (const [y0, h] of strips) {
    let yy = y0 + rr(rng, 3, 10);
    const bend = rr(rng, -1, 1);
    while (yy < y0 + h - 3) {
      const pts = []; const A = rr(rng, 1.5, 5), fr = rr(rng, .004, .009), ph = rr(rng, 0, TAU), A2 = rr(rng, .4, 1.4), fr2 = rr(rng, .02, .035), ph2 = rr(rng, 0, TAU);
      for (let x = -430; x <= 590; x += 170) pts.push([x, yy + A * Math.sin(x * fr + ph) + A2 * Math.sin(x * fr2 + ph2) + bend * (x / 300) ** 2 * 3]);
      grain[Math.floor(rng() * 3)].push(smoothOpen(pts));
      yy += rr(rng, 6, 19);
    }
  }
  cl.push(`<g fill="none" stroke="#9c6d3a" stroke-linecap="round"><path d="${grain[0].join('')}" stroke-width=".9" stroke-opacity=".22"/><path d="${grain[1].join('')}" stroke-width="1.5" stroke-opacity=".14"/><path d="${grain[2].join('')}" stroke-width=".6" stroke-opacity=".3"/></g>`);
  // cathedral figure in two strips
  const cath = [];
  for (const [cx, cy, n, s] of [[-150, strips[1][0] + strips[1][1] / 2, 5, 1], [220, strips[3][0] + strips[3][1] / 2, 4, -1], [80, strips[5] ? strips[5][0] + 60 : 300, 4, 1]]) {
    for (let k = 0; k < n; k++) { const w = 60 + k * 30, hh = 14 + k * 11; cath.push(`M${f(cx - w * 2.2)} ${f(cy - hh * s * .15)}C${f(cx - w)} ${f(cy - hh * s * .1)} ${f(cx - w * .35)} ${f(cy + hh * s)} ${f(cx + 20)} ${f(cy + hh * s)}C${f(cx + w * .4)} ${f(cy + hh * s)} ${f(cx + w * .9)} ${f(cy - hh * s * .05)} ${f(cx + w * 2.4)} ${f(cy - hh * s * .2)}`); }
  }
  cl.push(`<path d="${cath.join('')}" fill="none" stroke="#9c6d3a" stroke-width="1.1" stroke-opacity=".2"/>`);
  // oak ray flecks
  const fl = []; for (let i = 0; i < 46; i++) { const x = rr(rng, -380, 520), yy2 = rr(rng, -380, 380); const L = rr(rng, 4, 11); fl.push(`M${f(x)} ${f(yy2)}h${f(L)}`); }
  cl.push(`<path d="${fl.join('')}" stroke="#fff5e2" stroke-width="1.6" stroke-linecap="round" opacity=".35"/>`);
  cl.push(`<path d="${seams.map((s) => `M-420 ${f(s)}H580`).join('')}" stroke="#8a5d2e" stroke-width="1" stroke-opacity=".22"/>`);
  // bevel ring: clipped strokes
  cl.push(`<use href="#pz-boardShape" fill="none" stroke="#fff4dc" stroke-opacity=".45" stroke-width="26"/>`);
  cl.push(`<use href="#pz-boardShape" fill="none" stroke="url(#pz-bevel)" stroke-width="19"/>`);
  cl.push(`<use href="#pz-boardShape" fill="url(#pz-sheen)"/>`);
  g.push(`<g clip-path="url(#pz-boardClip)">${cl.join('')}</g>`);
  g.push(`<use href="#pz-boardShape" fill="none" stroke="#7d5428" stroke-opacity=".35" stroke-width="1"/>`);
  // hole inner shading + leather loop
  g.push(`<circle cx="537" cy="0" r="10.5" fill="none" stroke="#6b4521" stroke-width="2.5" stroke-opacity=".45"/>`);
  const loop = 'M537 -4C566 -14 602 -26 616 -8C628 8 612 26 588 24C566 22 548 12 537 5';
  g.push(`<path d="${loop}" transform="translate(${f(tv[0] * .6)} ${f(tv[1] * .6)})" fill="none" stroke="#2a1608" stroke-opacity=".25" stroke-width="6.5" stroke-linecap="round"/>`);
  g.push(`<path d="${loop}" fill="none" stroke="#6f3d1f" stroke-width="5.5" stroke-linecap="round"/>`);
  g.push(`<path d="M548 -8C574 -18 600 -22 610 -10" fill="none" stroke="#b27447" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>`);
  g.push(`<ellipse cx="537" cy="0" rx="4" ry="5.5" fill="#3d2211"/>`);
  board.push(`<g transform="translate(${C} ${C}) rotate(${BA})">${g.join('')}</g>`);
  // flour & semolina dusting around the pizza (global frame)
  const fw = [], fy = [];
  for (let i = 0; i < 70; i++) { const th = rng() * TAU, q = rr(rng, 362, 402); const x = C + q * Math.cos(th), y2 = C + q * Math.sin(th); (i % 3 ? fw : fy).push(speck(x, y2, rr(rng, .8, 1.9), rng)); }
  board.push(`<path d="${fw.join('')}" fill="#fffaf0" opacity=".8"/><path d="${fy.join('')}" fill="#f3d99a" opacity=".85"/>`);
}

/* ---------------------------------------------------------------- DOUGH */
const dough = [];
{
  const rng = mulberry32(31);
  dough.push(`<circle cx="${C + 8}" cy="${C + 13}" r="386" fill="url(#pz-pizzaShadow)"/>`);
  dough.push(`<path id="pz-doughShape" d="${doughD}" fill="url(#pz-crust)"/>`);
  dough.push(`<use href="#pz-doughShape" fill="url(#pz-light)"/>`);
  dough.push(`<path d="${smoothClosed(ringAt(.878, 72))}" fill="none" stroke="url(#pz-rimIn)" stroke-width="18"/>`);
  dough.push(`<path d="${smoothClosed(ringAt(.975, 96))}" fill="none" stroke="url(#pz-light)" stroke-width="12"/>`);
  // flour dust & small raw bubbles on the rim
  const fl = []; for (let i = 0; i < 60; i++) { const th = rng() * TAU, q = rr(rng, .87, .985) * doughR(th); fl.push(speck(C + q * Math.cos(th), C + q * Math.sin(th), rr(rng, .7, 1.6), rng)); }
  for (let i = 0; i < 22; i++) { const th = rng() * TAU, q = rng() * 280; fl.push(speck(C + q * Math.cos(th), C + q * Math.sin(th), rr(rng, .6, 1.2), rng)); }
  dough.push(`<path d="${fl.join('')}" fill="#fffdf6" opacity=".85"/>`);
  const bub = [];
  for (let i = 0; i < 9; i++) { const th = (i / 9) * TAU + rr(rng, -.2, .2), q = .925 * doughR(th); const x = C + q * Math.cos(th), y = C + q * Math.sin(th); const r = rr(rng, 4, 7.5); bub.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 1.4)}" ry="${f(r)}" transform="rotate(${f(th / DEG + 90)} ${f(x)} ${f(y)})"/>`); }
  dough.push(`<g fill="#fff8ea" stroke="#d7b98a" stroke-opacity=".5" stroke-width="1" opacity=".75">${bub.join('')}</g>`);
}

/* ---------------------------------------------------------------- SAUCE */
const sauce = [];
{
  const rng = mulberry32(41);
  sauce.push(`<path id="pz-sauceShape" d="${sauceD}" fill="url(#pz-sauce)"/>`);
  sauce.push(`<use href="#pz-sauceShape" fill="none" stroke="#8a2213" stroke-opacity=".4" stroke-width="3"/>`);
  const dark = [], light = [], gloss = [];
  for (let i = 0; i < 12; i++) { const th = rng() * TAU, q = rr(rng, 30, 240); dark.push(smoothClosed(blob(rng, rr(rng, 16, 34), 9, [[2, .25], [3, .15]], 1, rr(rng, .6, 1), C + q * Math.cos(th), C + q * Math.sin(th)))); }
  for (let i = 0; i < 10; i++) { const th = rng() * TAU, q = rr(rng, 20, 250); light.push(smoothClosed(blob(rng, rr(rng, 10, 26), 8, [[2, .3], [3, .15]], 1, rr(rng, .5, 1), C + q * Math.cos(th), C + q * Math.sin(th)))); }
  for (let i = 0; i < 14; i++) { const th = rng() * TAU, q = rr(rng, 40, 270); const x = C + q * Math.cos(th), y = C + q * Math.sin(th); const L = rr(rng, 6, 16); const a = th / DEG + 90 + rr(rng, -20, 20); const d1 = rot([-L, 0], a), d2 = rot([L, 0], a), n1 = rot([0, -rr(rng, 1.2, 2.4)], a); gloss.push(`M${P([x + d1[0], y + d1[1]])}Q${P([x + n1[0] * 2, y + n1[1] * 2])} ${P([x + d2[0], y + d2[1]])}Q${P([x - n1[0] * .5, y - n1[1] * .5])} ${P([x + d1[0], y + d1[1]])}Z`); }
  sauce.push(`<path d="${dark.join('')}" fill="#8f2314" opacity=".22"/>`);
  sauce.push(`<path d="${light.join('')}" fill="#dc5b3c" opacity=".22"/>`);
  sauce.push(`<path d="${gloss.join('')}" fill="#fff" opacity=".2"/>`);
  const herb = [], pep = [];
  for (let i = 0; i < 70; i++) { const th = rng() * TAU, q = Math.sqrt(rng()) * (sauceR(th) - 8); (i % 5 ? herb : pep).push(speck(C + q * Math.cos(th), C + q * Math.sin(th), rr(rng, .9, 1.9), rng)); }
  sauce.push(`<path d="${herb.join('')}" fill="#3f4a1e" opacity=".75"/><path d="${pep.join('')}" fill="#2b1a12" opacity=".7"/>`);
}

/* ---------------------------------------------------------------- CHEESE */
const cheese = []; const patches = [];
{
  const rng = mulberry32(53);
  const spots = [[0, 0, 52]];
  for (let k = 0; k < 4; k++) spots.push([128 + rr(rng, -10, 10), (22 + k * 90 + rr(rng, -10, 10)) * DEG, rr(rng, 44, 52)]);
  for (let k = 0; k < 6; k++) spots.push([224 + rr(rng, -6, 6), (5 + k * 60 + rr(rng, -8, 8)) * DEG, rr(rng, 39, 45)]);
  spots.forEach(([q, th, r], i) => {
    const x = C + q * Math.cos(th), y = C + q * Math.sin(th);
    const pts = blob(rng, r, 18, [[2, .09], [3, .08], [4, .05], [5, .04], [7, .025], [11, .015]], 1, rr(rng, .85, 1));
    const a = rr(rng, 0, 180);
    patches.push({ x, y, r, id: `pz-patch${i + 1}` });
    cheese.push(`<path id="pz-patch${i + 1}" class="patch" transform="translate(${f(x)} ${f(y)})" d="${smoothClosed(pts.map((p) => rot(p, a)))}"/>`);
  });
}

/* ---------------------------------------------------------------- TOPPING SYMBOLS */
const tdefs = [];
pzDefs.push(radial('pz-shrimp', [[0, '#fff3ea'], [.3, '#fcd8c4'], [.52, '#f8a888'], [.74, '#f0805a'], [.9, '#e5653f'], [1, '#d4512f']], 'gradientUnits="userSpaceOnUse" cx="0" cy="0" r="38"'));
function shrimp(id, o) {
  const { Rm, w0, w1, th0, sweep } = o; const N = 16;
  const W = (t) => w1 + (w0 - w1) * (1 - Math.pow(t, 1.5));
  const at = (t, off) => { const th = (th0 - sweep * t) * DEG; return [(Rm + off) * Math.cos(th), (Rm + off) * Math.sin(th)]; };
  const O = [], I = [];
  for (let i = 0; i <= N; i++) { const t = i / N; O.push(at(t, W(t) / 2)); I.push(at(t, -W(t) / 2)); }
  const th = th0 * DEG, c = Math.cos(th), s = Math.sin(th), w = W(0); const ph = [Rm * c, Rm * s], back = [-s, c], rad = [c, s];
  const cap = []; for (let k = 1; k < 4; k++) { const a = Math.PI - (k * Math.PI) / 4; cap.push([ph[0] + (w / 2) * (Math.cos(a) * rad[0] + Math.sin(a) * back[0] * .75), ph[1] + (w / 2) * (Math.cos(a) * rad[1] + Math.sin(a) * back[1] * .75)]); }
  const body = smoothClosed([...O, ...I.slice().reverse(), ...cap]);
  // tail fan in local frame at t=1
  const t1 = (th0 - sweep) * DEG; const Pt = [Rm * Math.cos(t1), Rm * Math.sin(t1)], fw = [Math.sin(t1), -Math.cos(t1)], rd = [Math.cos(t1), Math.sin(t1)];
  const L = (x, y) => P([Pt[0] + x * fw[0] + y * rd[0], Pt[1] + x * fw[1] + y * rd[1]]);
  const tail = `M${L(-5, 6)}Q${L(5, 15)} ${L(16, 15)}Q${L(14, 8)} ${L(10, 3.6)}Q${L(16, 3.2)} ${L(21, 0)}Q${L(16, -3.2)} ${L(10, -3.6)}Q${L(14, -8)} ${L(16, -15)}Q${L(5, -15)} ${L(-5, -6)}Z`;
  const tailRibs = `M${L(0, 0)}L${L(18, 0)}M${L(1, 2)}L${L(13, 11)}M${L(1, -2)}L${L(13, -11)}`;
  tdefs.push(linear(`${id}-tg`, [[0, '#e0603b'], [.55, '#cc4629'], [.85, '#e97c58'], [1, '#f6b597']], `gradientUnits="userSpaceOnUse" x1="${f(Pt[0])}" y1="${f(Pt[1])}" x2="${f(Pt[0] + 19 * fw[0])}" y2="${f(Pt[1] + 19 * fw[1])}"`));
  tdefs.push(`<path id="${id}-b" d="${body}"/><path id="${id}-t" d="${tail}"/>`);
  tdefs.push(`<g id="${id}-sil"><use href="#${id}-t"/><use href="#${id}-b"/></g>`);
  // segment bands
  const bands = [], seams = [];
  for (const t of [.2, .33, .46, .59, .72, .85]) {
    const a = at(t, -W(t) / 2 + .8), b = at(t, W(t) / 2 - .8); const th2 = (th0 - sweep * t) * DEG; const fv = [Math.sin(th2), -Math.cos(th2)];
    const m = [(a[0] + b[0]) / 2 + fv[0] * 3.5, (a[1] + b[1]) / 2 + fv[1] * 3.5];
    bands.push(`M${P(a)}Q${P(m)} ${P(b)}`);
    const a2 = [a[0] + fv[0] * 2.4, a[1] + fv[1] * 2.4], b2 = [b[0] + fv[0] * 2.4, b[1] + fv[1] * 2.4], m2 = [m[0] + fv[0] * 2.4, m[1] + fv[1] * 2.4];
    seams.push(`M${P(a2)}Q${P(m2)} ${P(b2)}`);
  }
  const dors = []; for (let i = 0; i <= 10; i++) { const t = .03 + i * .085; dors.push(at(t, W(t) * .3)); }
  const gl = []; for (let i = 0; i <= 6; i++) { const t = .1 + i * .07; gl.push(at(t, -W(t) * .12)); }
  tdefs.push(`<g id="${id}"><use href="#${id}-t" fill="url(#${id}-tg)"/><path d="${tailRibs}" stroke="#a8341d" stroke-opacity=".4" stroke-width=".9" fill="none"/><use href="#${id}-b" fill="url(#pz-shrimp)"/><g fill="none" stroke-linecap="round"><path d="${seams.join('')}" stroke="#d65a37" stroke-opacity=".55" stroke-width="1.3"/><path d="${bands.join('')}" stroke="#fff1e6" stroke-opacity=".8" stroke-width="2.6"/><path d="${smoothOpen(dors)}" stroke="#c9472a" stroke-opacity=".5" stroke-width="1.6"/><path d="${smoothOpen(gl)}" stroke="#fff" stroke-opacity=".38" stroke-width="2.2"/></g><use href="#${id}-b" fill="none" stroke="#c24a2b" stroke-opacity=".35" stroke-width=".9"/></g>`);
}
shrimp('pz-shA', { Rm: 23, w0: 25, w1: 10, th0: 200, sweep: 245 });
shrimp('pz-shB', { Rm: 21, w0: 23, w1: 9.5, th0: 190, sweep: 228 });

// calamari rings
pzDefs.push(radial('pz-cala', [[0, '#e8d8c3'], [.52, '#efe2d0'], [.62, '#fbf6ee'], [.82, '#f7efe4'], [.94, '#eadbc8'], [1, '#dcc6b2']], 'cx=".5" cy=".5" r=".5"'));
{
  const rng = mulberry32(61);
  [[24, 20, 13.5, 10], [22, 21, 12, 11], [25, 18.5, 15, 9]].forEach(([rx, ry, ix, iy], i) => {
    const id = `pz-ca${i + 1}`;
    const o = smoothClosed(blob(rng, 1, 18, [[2, .03], [3, .03], [5, .015]], rx, ry));
    const inn = smoothClosed(blob(rng, 1, 14, [[2, .05], [3, .04]], ix, iy, rr(rng, -1.5, 1.5), rr(rng, -1, 1)));
    tdefs.push(`<path id="${id}-s" d="${o}${inn}" fill-rule="evenodd"/>`);
    tdefs.push(`<g id="${id}"><use href="#${id}-s" fill="url(#pz-cala)" stroke="#d2b69c" stroke-opacity=".75" stroke-width="1"/><path d="${inn}" fill="none" stroke="#c9a88c" stroke-opacity=".55" stroke-width="1.6"/></g>`);
  });
  tdefs.push(`<path id="pz-caHl" d="M-17 -6A19 16 0 0 1 4 -17.5" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2.2" stroke-linecap="round"/>`);
}
// olives
pzDefs.push(radial('pz-olive', [[0, '#51463f'], [.5, '#3b322d'], [.85, '#272120'], [1, '#171313']], 'cx=".5" cy=".5" r=".5" fx=".45" fy=".42"'));
{
  const rng = mulberry32(67);
  [[12.8, 12.2, 4.9, 4.4], [12, 12.9, 4.5, 5.2]].forEach(([rx, ry, ix, iy], i) => {
    const id = `pz-ol${i + 1}`;
    const o = smoothClosed(blob(rng, 1, 14, [[2, .03], [3, .02]], rx, ry));
    const inn = smoothClosed(blob(rng, 1, 10, [[2, .06]], ix, iy, rr(rng, -.8, .8), rr(rng, -.8, .8)));
    tdefs.push(`<path id="${id}-s" d="${o}${inn}" fill-rule="evenodd"/>`);
    tdefs.push(`<g id="${id}"><use href="#${id}-s" fill="url(#pz-olive)"/><path d="${inn}" fill="none" stroke="#7a6860" stroke-opacity=".55" stroke-width="1.1"/></g>`);
  });
  tdefs.push(`<path id="pz-olHl" d="M-9 -3A9.5 9.5 0 0 1 -1.5 -9.2" fill="none" stroke="#d9d0c8" stroke-opacity=".6" stroke-width="1.8" stroke-linecap="round"/>`);
}
// basil
pzDefs.push(radial('pz-basil', [[0, '#6fa24b'], [.55, '#4c8236'], [1, '#2f5c24']], 'cx=".45" cy=".5" r=".55"'));
{
  [[52, 30, -2], [44, 25, 3], [38, 23, -4]].forEach(([Lh, Wd, curl], i) => {
    const id = `pz-ba${i + 1}`; const a = Lh / 2, w = Wd / 2;
    const leaf = `M${f(-a)} 0C${f(-a + 6)} ${f(-w * 1.05)} ${f(a * .35)} ${f(-w * 1.15)} ${f(a)} ${f(curl)}C${f(a * .3)} ${f(w * 1.1)} ${f(-a + 7)} ${f(w * .98)} ${f(-a)} 0Z`;
    const half = `M${f(-a)} 0Q0 ${f(curl * .4 - 1)} ${f(a)} ${f(curl)}C${f(a * .3)} ${f(w * 1.1)} ${f(-a + 7)} ${f(w * .98)} ${f(-a)} 0Z`;
    const mid = `M${f(-a - 5)} .8L${f(-a)} 0Q0 ${f(curl * .4 - 1)} ${f(a - 2)} ${f(curl * .9)}`;
    const veins = []; for (let k = 0; k < 4; k++) { const x = -a + 8 + k * (Lh - 16) / 4; const yy = (curl * .4 - 1) * (1 - Math.abs(x) / a) ; for (const sg of [-1, 1]) veins.push(`M${f(x)} ${f(yy)}Q${f(x + 6)} ${f(yy + sg * w * .45)} ${f(x + 12)} ${f(yy + sg * w * .72)}`); }
    tdefs.push(`<path id="${id}-s" d="${leaf}"/>`);
    tdefs.push(`<g id="${id}"><use href="#${id}-s" fill="url(#pz-basil)" stroke="#2a4d1c" stroke-opacity=".45" stroke-width=".8"/><path d="${half}" fill="#1e3d14" opacity=".2"/><path d="${veins.join('')}" fill="none" stroke="#9cc57a" stroke-opacity=".45" stroke-width=".8"/><path d="${mid}" fill="none" stroke="#a9cf86" stroke-opacity=".85" stroke-width="1.4" stroke-linecap="round"/><path d="M${f(-a + 8)} ${f(-w * .45)}Q${f(-2)} ${f(-w * .8)} ${f(a * .55)} ${f(-w * .4)}" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2.4" stroke-linecap="round"/></g>`);
  });
}
// cherry tomato halves
pzDefs.push(radial('pz-tomSkin', [[0, '#e0462e'], [.78, '#d23a26'], [.92, '#b82a1a'], [1, '#9c1f12']], 'cx=".5" cy=".5" r=".5"'));
pzDefs.push(radial('pz-tomFlesh', [[0, '#f27a58'], [.7, '#e8583c'], [1, '#dc4a31']], 'cx=".5" cy=".5" r=".5"'));
pzDefs.push(radial('pz-tomGel', [[0, '#fbd08c'], [.5, '#f6a765'], [1, '#ec7449']], 'cx=".5" cy=".5" r=".5"'));
{
  const rng = mulberry32(71);
  [[20.5, 19.5, 3], [19, 18.5, 2]].forEach(([rx, ry, nl], i) => {
    const id = `pz-to${i + 1}`;
    const skin = smoothClosed(blob(rng, 1, 14, [[2, .02], [3, .015]], rx, ry));
    const flesh = smoothClosed(blob(rng, 1, 14, [[2, .025], [3, .02]], rx - 3.2, ry - 3.2));
    const loc = [], seeds = [];
    for (let k = 0; k < nl; k++) {
      const a = (k / nl) * 360 + 30; const d = nl === 3 ? 8.4 : 7.6; const c = rot([d, 0], a);
      const lp = blob(rng, 1, 10, [[2, .06], [3, .05]], nl === 3 ? 6.4 : 7.4, nl === 3 ? 4.9 : 6).map((p) => { const q = rot(p, a + 90); return [q[0] + c[0], q[1] + c[1]]; });
      loc.push(smoothClosed(lp));
      for (let s = 0; s < 3; s++) { const sp = rot([d + (s - 1) * 1.2, (s - 1) * 2.8], a); seeds.push(`<ellipse cx="${f(sp[0])}" cy="${f(sp[1])}" rx="1.7" ry="1" transform="rotate(${f(a + 90)} ${f(sp[0])} ${f(sp[1])})"/>`); }
    }
    tdefs.push(`<path id="${id}-s" d="${skin}"/>`);
    tdefs.push(`<g id="${id}"><use href="#${id}-s" fill="url(#pz-tomSkin)"/><path d="${flesh}" fill="url(#pz-tomFlesh)"/><path d="${loc.join('')}" fill="url(#pz-tomGel)"/><g fill="#fdf0c8" opacity=".95">${seeds.join('')}</g><circle r="3" fill="#f7a58a" opacity=".85"/></g>`);
  });
  tdefs.push(`<path id="pz-toHl" d="M-15 -5A16 16 0 0 1 -5 -15.5" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>`);
}
// mussels (optional)
pzDefs.push(linear('pz-musShell', [[0, '#4a5268'], [.35, '#262b3a'], [1, '#101218']], 'x1="0" y1="0" x2="1" y2="1"'));
pzDefs.push(radial('pz-musNacre', [[0, '#ecebf1'], [.6, '#c9c4d6'], [1, '#8f87a6']], 'cx=".5" cy=".5" r=".5"'));
pzDefs.push(radial('pz-musMeat', [[0, '#f8bb72'], [.6, '#eb944c'], [1, '#d2703a']], 'cx=".55" cy=".45" r=".55"'));
{
  const rng = mulberry32(79);
  const shell = 'M-36 4C-31 -8 -12 -19 8 -19C28 -19 39 -8 38 3C37 14 26 20 10 19C-8 18 -28 12 -36 4Z';
  const scale = (d, s, ox, oy) => d.replace(/-?\d+(\.\d+)?/g, (m, _g, off) => m) ; // placeholder (not used)
  const sc = (s, ox, oy) => { const pts = [[-36, 4], [-31, -8], [-12, -19], [8, -19], [28, -19], [39, -8], [38, 3], [37, 14], [26, 20], [10, 19], [-8, 18], [-28, 12]]; const q = pts.map(([x, y]) => [ox + x * s, oy + y * s]); return `M${P(q[0])}C${P(q[1])} ${P(q[2])} ${P(q[3])}C${P(q[4])} ${P(q[5])} ${P(q[6])}C${P(q[7])} ${P(q[8])} ${P(q[9])}C${P(q[10])} ${P(q[11])} ${P(q[0])}Z`; };
  const meatPts = []; for (let i = 0; i < 26; i++) { const th = (i / 26) * TAU; const wob = 1 + .06 * Math.sin(th * 9) + rr(rng, -.02, .02); meatPts.push([4 + Math.cos(th) * 26 * wob, 1 + Math.sin(th) * 12.5 * wob]); }
  tdefs.push(`<path id="pz-mu-s" d="${shell}"/>`);
  tdefs.push(`<g id="pz-mu"><use href="#pz-mu-s" fill="url(#pz-musShell)"/><path d="${sc(.87, 2, 0.6)}" fill="url(#pz-musNacre)"/><path d="${smoothClosed(meatPts)}" fill="url(#pz-musMeat)" stroke="#a3502a" stroke-opacity=".75" stroke-width="1.3"/><path d="M-18 2Q4 -3 26 1" fill="none" stroke="#b85f2e" stroke-opacity=".5" stroke-width="1.2"/><path d="M-12 -7Q6 -11 22 -7" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="2" stroke-linecap="round"/><path d="M-30 -3C-22 -12 -6 -18 10 -18" fill="none" stroke="#7d86a3" stroke-opacity=".7" stroke-width="1.3" stroke-linecap="round"/></g>`);
}

/* ---------------------------------------------------------------- TOPPING PLACEMENT */
const items = [];
{
  const rng = mulberry32(97);
  const limit = (x, y, r) => { const dx = x - C, dy = y - C; const dc = Math.hypot(dx, dy); return sauceR(Math.atan2(dy, dx)) - 10 - dc - r; };
  const add = (kind, x, y, r, extra = {}) => items.push({ kind, x, y, r, rot: rr(rng, 0, 360), ...extra });
  // shrimp: a loose ring + one near the centre
  for (let k = 0; k < 6; k++) { const th = (18 + k * 60 + rr(rng, -9, 9)) * DEG, q = 198 + rr(rng, -10, 10); add('shrimp', C + q * Math.cos(th), C + q * Math.sin(th), 37, { v: k % 2 ? 'B' : 'A', mirror: k % 3 === 0 }); }
  add('shrimp', C - 14, C + 18, 37, { v: 'A' });
  const place = (kind, n, r, K = 260, extra = () => ({})) => {
    for (let i = 0; i < n; i++) {
      let best = null, bs = -1e9;
      for (let k = 0; k < K; k++) {
        const th = rng() * TAU, q = Math.sqrt(rng()) * (sMax);
        const x = C + q * Math.cos(th), y = C + q * Math.sin(th);
        const lim = limit(x, y, r); if (lim < 0) continue;
        let m = lim * 1.1 + 6;
        for (const it of items) m = Math.min(m, Math.hypot(it.x - x, it.y - y) - it.r - r);
        if (m > bs) { bs = m; best = [x, y]; }
      }
      add(kind, best[0], best[1], r, extra(i));
    }
  };
  place('mussel', 3, 34);
  place('tomato', 6, 20, 260, (i) => ({ v: (i % 2) + 1 }));
  place('calamari', 9, 23, 260, (i) => ({ v: (i % 3) + 1 }));
  place('basil', 7, 22, 260, (i) => ({ v: (i % 3) + 1 }));
  place('olive', 8, 12.5, 300, (i) => ({ v: (i % 2) + 1 }));
}
const order = ['calamari', 'tomato', 'olive', 'mussel', 'shrimp', 'basil'];
const toppingEls = [];
const SH = 'fill="#3d0d05"';
for (const kind of order) {
  for (const it of items.filter((t) => t.kind === kind)) {
    const r = f(it.rot); const T = `translate(${f(it.x)} ${f(it.y)})`;
    let inner = '';
    if (kind === 'shrimp') { const id = `pz-sh${it.v}`; const m = it.mirror ? ' scale(-1 1)' : ''; inner = `<use href="#${id}-sil" transform="translate(2.5 3.5) rotate(${r})${m}" ${SH} opacity=".26"/><use href="#${id}" transform="rotate(${r})${m}"/>`; }
    if (kind === 'calamari') inner = `<use href="#pz-ca${it.v}-s" transform="translate(1.5 2.5) rotate(${r})" ${SH} opacity=".24"/><use href="#pz-ca${it.v}" transform="rotate(${r})"/><use href="#pz-caHl"/>`;
    if (kind === 'olive') inner = `<use href="#pz-ol${it.v}-s" transform="translate(1.2 2) rotate(${r})" ${SH} opacity=".25"/><use href="#pz-ol${it.v}" transform="rotate(${r})"/><use href="#pz-olHl"/>`;
    if (kind === 'tomato') inner = `<use href="#pz-to${it.v}-s" transform="translate(1.8 2.8)" ${SH} opacity=".28"/><use href="#pz-to${it.v}" transform="rotate(${r})"/><use href="#pz-toHl"/>`;
    if (kind === 'basil') inner = `<use href="#pz-ba${it.v}-s" transform="translate(1.5 2.5) rotate(${r})" fill="#1f0a04" opacity=".22"/><use href="#pz-ba${it.v}" transform="rotate(${r})"/>`;
    if (kind === 'mussel') inner = `<use href="#pz-mu-s" transform="translate(2.5 3.5) rotate(${r})" ${SH} opacity=".3"/><use href="#pz-mu" transform="rotate(${r})"/>`;
    toppingEls.push(`<g class="topping" data-kind="${kind}" transform="${T}">${inner}</g>`);
  }
}

/* ---------------------------------------------------------------- BAKED overlay */
const baked = [];
{
  const rng = mulberry32(101);
  const ring = `${doughD}${sauceD}`;
  baked.push(`<path d="${ring}" fill-rule="evenodd" fill="url(#pz-crustBake)"/>`);
  baked.push(`<use href="#pz-sauceShape" fill="none" stroke="#6e1a0d" stroke-opacity=".32" stroke-width="7"/>`);
  // char / leopard spots
  const shapes = [];
  for (let i = 0; i < 4; i++) { const id = `pz-char${i}`; pzDefs.push(`<path id="${id}" d="${smoothClosed(blob(rng, 1, 8, [[2, .25], [3, .2], [5, .1]], 1, rr(rng, .55, .85)))}"/>`); shapes.push(id); }
  const halo = [], core = [];
  for (let i = 0; i < 44; i++) {
    const th = (i / 44) * TAU + rr(rng, -.06, .06); const q = rr(rng, .885, .968) * doughR(th); const x = C + q * Math.cos(th), y = C + q * Math.sin(th);
    const s = i % 7 === 0 ? rr(rng, 7, 10) : rr(rng, 2.2, 5.5); const id = shapes[i % 4]; const a = f(rr(rng, 0, 180));
    halo.push(`<use href="#${id}" transform="translate(${f(x)} ${f(y)}) rotate(${a}) scale(${f(s * 1.9)})"/>`);
    core.push(`<use href="#${id}" transform="translate(${f(x)} ${f(y)}) rotate(${a}) scale(${f(s)})"/>`);
  }
  baked.push(`<g fill="#8a4a1c" opacity=".28">${halo.join('')}</g><g fill="#3b200e" opacity=".72">${core.join('')}</g>`);
  // puffed bubbles with charred tops
  const bub = [];
  for (let i = 0; i < 8; i++) { const th = ((i + .5) / 8) * TAU + rr(rng, -.2, .2), q = .93 * doughR(th); const x = C + q * Math.cos(th), y = C + q * Math.sin(th); const r = rr(rng, 7, 11); bub.push(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f(th / DEG + 90)})"><ellipse rx="${f(r * 1.35)}" ry="${f(r)}" fill="#f1d39f" opacity=".6"/><ellipse cx="${f(-r * .25)}" cy="${f(-r * .2)}" rx="${f(r * .6)}" ry="${f(r * .42)}" fill="#3b200e" opacity=".7"/></g>`); }
  baked.push(bub.join(''));
  // golden tint + blisters on mozzarella
  baked.push(`<g fill="url(#pz-cheeseBake)">${patches.map((p) => `<use href="#${p.id}"/>`).join('')}</g>`);
  const bl = [], bl2 = [];
  for (const p of patches) { const n = 3 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) { const th = rng() * TAU, q = rr(rng, .15, .6) * p.r; const x = p.x + q * Math.cos(th), y = p.y + q * Math.sin(th); (k % 3 === 2 ? bl2 : bl).push(`<use href="#${shapes[k % 4]}" transform="translate(${f(x)} ${f(y)}) rotate(${f(rng() * 180)}) scale(${f(rr(rng, 3, 6.5))})"/>`); } }
  baked.push(`<g fill="#c6873e" opacity=".5">${bl.join('')}</g><g fill="#8e5220" opacity=".45">${bl2.join('')}</g>`);
  // orange oil sheen on the sauce
  const oil = []; for (let i = 0; i < 16; i++) { const th = rng() * TAU, q = rr(rng, 40, 270); oil.push(`<ellipse cx="${f(C + q * Math.cos(th))}" cy="${f(C + q * Math.sin(th))}" rx="${f(rr(rng, 3, 7))}" ry="${f(rr(rng, 2, 4))}"/>`); }
  baked.push(`<g fill="#f08a3a" opacity=".3">${oil.join('')}</g>`);
}


/* ---------------------------------------------------------------- SAUCE SPIRAL (reveal mask) */
{
  // Archimedean spiral from the centre outwards; a thick round-capped stroke drawn with a dash offset
  // reveals the sauce like a ladle spreading it.
  const turns = 3.1, R = 336, pts = [];
  const N = Math.round(turns * 30);
  for (let i = 0; i <= N; i++) { const t = i / N, th = t * turns * TAU - Math.PI / 2; const q = R * t; pts.push([C + q * Math.cos(th), C + q * Math.sin(th)]); }
  pzDefs.push(`<mask id="pz-sauceMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><path id="pz-spiral" d="${smoothOpen(pts)}" fill="none" stroke="#fff" stroke-width="${f((R / turns) * 1.28)}" stroke-linecap="round"/></mask>`);
}

/* ======================================================= OUTPUT */
const idsIn = (s) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const refsIn = (s) => [...s.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2]);
/** Only the defs a drawing uses (transitively). */
function usedDefs(defs, body) {
  const chunks = defs.map((d) => ({ d, ids: idsIn(d) }));
  const need = new Set(refsIn(body)); const out = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of chunks) if (!out.has(c) && c.ids.some((id) => need.has(id))) { out.add(c); refsIn(c.d).forEach((r) => need.add(r)); grew = true; }
  }
  return chunks.filter((c) => out.has(c)).map((c) => c.d).join('');
}
const minify = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
function write(name, defs, body, rename) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" overflow="visible"><defs>${usedDefs(defs, body)}</defs>${body}</svg>`;
  for (const [from, to] of rename) svg = svg.split(from).join(to);
  svg = minify(svg).replace('<defs></defs>', '');
  fs.writeFileSync(path.join(DIR, name), svg + '\n');
  return svg;
}
const LAYER = (ids) => ids.map((id) => [`id="${id}"`, `id="atl-${id}"`]);
const pzRename = [['pz-', 'atl-p-'], ...LAYER(['board', 'dough', 'sauce', 'cheese', 'baked', 'toppings']), ['class="patch"', 'class="atl-patch"'], ['class="topping"', 'class="atl-topping"']];
const allPz = [...pzDefs, ...tdefs];
const out = {};
out.board = write('board.svg', allPz, `<g id="board">${board.join('')}</g>`, pzRename);
out.pizza = write('pizza.svg', allPz, `<g id="dough">${dough.join('')}</g><g id="sauce" mask="url(#pz-sauceMask)">${sauce.join('')}</g><g id="cheese" fill="url(#pz-cheese)">${cheese.join('')}</g><g id="baked">${baked.join('')}</g><g id="toppings">${toppingEls.join('')}</g>`, pzRename);
/* ======================================================= BOX */
const bxDefs = [];
const box = { shadow: [], base: [], lidIn: [], lidOut: [] };
const O0 = 50, O1 = 950, RIM = 12, WALL = 30, FL0 = O0 + RIM + WALL, FL1 = O1 - RIM - WALL; // floor 92..908
{
  const rng = mulberry32(131);
  // kraft fibre texture tile
  const dk = [], lt = [];
  for (let i = 0; i < 46; i++) { const x = rr(rng, 0, 140), y = rr(rng, 0, 140), a = rr(rng, 0, 180), L = rr(rng, 2.5, 9); const d = rot([L, 0], a); (i % 2 ? dk : lt).push(`M${f(x)} ${f(y)}l${f(d[0])} ${f(d[1])}`); }
  const dots = []; for (let i = 0; i < 26; i++) dots.push(speck(rr(rng, 2, 138), rr(rng, 2, 138), rr(rng, .5, 1.1), rng));
  bxDefs.push(`<pattern id="bx-fibre" width="140" height="140" patternUnits="userSpaceOnUse"><path d="${dk.join('')}" stroke="#7d5832" stroke-opacity=".28" stroke-width=".8" stroke-linecap="round"/><path d="${lt.join('')}" stroke="#f6e3c0" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round"/><path d="${dots.join('')}" fill="#6b4a2a" opacity=".35"/></pattern>`);
  // corrugation flute patterns (horizontal band 12 tall / vertical band 12 wide)
  bxDefs.push(`<pattern id="bx-fluteH" width="9" height="12" y="${O0}" patternUnits="userSpaceOnUse"><rect width="9" height="12" fill="#c49c6b"/><path d="M0 9.5Q2.25 1 4.5 6T9 2.5" fill="none" stroke="#8a643a" stroke-width="1"/><path d="M0 1.2H9M0 10.8H9" stroke="#e7cda3" stroke-width="1.2"/></pattern>`);
  bxDefs.push(`<pattern id="bx-fluteV" width="12" height="9" x="${O0}" patternUnits="userSpaceOnUse"><rect width="12" height="9" fill="#c49c6b"/><path d="M9.5 0Q1 2.25 6 4.5T2.5 9" fill="none" stroke="#8a643a" stroke-width="1"/><path d="M1.2 0V9M10.8 0V9" stroke="#e7cda3" stroke-width="1.2"/></pattern>`);
  bxDefs.push(linear('bx-kraft', [[0, '#dcbd90'], [.5, '#cfab79'], [1, '#bf9866']], 'gradientUnits="userSpaceOnUse" x1="50" y1="50" x2="950" y2="950"'));
  bxDefs.push(radial('bx-floor', [[0, '#d3b081'], [.7, '#c9a473'], [1, '#b28b5c']], `gradientUnits="userSpaceOnUse" cx="480" cy="480" r="600"`));
  bxDefs.push(linear('bx-wallL', [[0, '#b58d5d'], [1, '#95703f']], 'x1="0" y1="0" x2="1" y2="0"'));
  bxDefs.push(linear('bx-wallR', [[0, '#c59f6e'], [1, '#dcbb8d']], 'x1="0" y1="0" x2="1" y2="0"'));
  bxDefs.push(linear('bx-wallT', [[0, '#bb9464'], [1, '#9e7747']], 'x1="0" y1="0" x2="0" y2="1"'));
  bxDefs.push(linear('bx-wallB', [[0, '#cda877'], [1, '#e0c193']], 'x1="0" y1="0" x2="0" y2="1"'));
  bxDefs.push(linear('bx-castL', [[0, '#3b2412', .26], [1, '#3b2412', 0]], 'x1="0" y1="0" x2="1" y2="0"'));
  bxDefs.push(linear('bx-castT', [[0, '#3b2412', .3], [1, '#3b2412', 0]], 'x1="0" y1="0" x2="0" y2="1"'));
  bxDefs.push(linear('bx-hinge', [[0, '#a98253'], [.45, '#e3c89e'], [1, '#b99264']], 'x1="0" y1="0" x2="0" y2="1"'));
  bxDefs.push(linear('bx-gold', [[0, '#f3e1bf'], [.3, '#deb877'], [.55, '#a9844b'], [.75, '#ebcf9c'], [1, '#c79d5e']], 'x1="0" y1="0" x2="1" y2="1"'));
  bxDefs.push(radial('bx-ink', [[0, '#2c221b'], [.8, '#1c1511'], [1, '#140f0c']], 'cx=".45" cy=".4" r=".65"'));
  bxDefs.push(linear('bx-sheen', [[0, '#fff', .22], [.4, '#fff', 0], [.7, '#5a3a1a', 0], [1, '#5a3a1a', .12]], 'gradientUnits="userSpaceOnUse" x1="50" y1="50" x2="950" y2="950"'));

  // ---- shadow (stacked soft rects)
  for (const [k, op] of [[34, .04], [24, .05], [14, .07], [6, .09], [0, .1]]) box.shadow.push(`<rect x="${O0 + 16 - k}" y="${O0 + 24 - k}" width="${900 + 2 * k}" height="${900 + 2 * k}" rx="${8 + k}" fill="#2b1a0d" opacity="${op}"/>`);

  // ---- base (open box)
  const B = box.base;
  B.push(`<rect x="${O0}" y="${O0}" width="900" height="900" rx="5" fill="#b8905f"/>`);
  // rims: flute on left/right/front, hinge fold on the back
  B.push(`<rect x="${O0}" y="${O0 + RIM}" width="${RIM}" height="${900 - RIM}" fill="url(#bx-fluteV)"/><rect x="${O1 - RIM}" y="${O0 + RIM}" width="${RIM}" height="${900 - RIM}" fill="url(#bx-fluteV)"/><rect x="${O0}" y="${O1 - RIM}" width="900" height="${RIM}" fill="url(#bx-fluteH)"/>`);
  B.push(`<rect x="${O0}" y="${O0}" width="900" height="${RIM}" rx="4" fill="url(#bx-hinge)"/>`);
  // inner walls (slight perspective)
  const a0 = O0 + RIM, a1 = O1 - RIM;
  B.push(`<path d="M${a0} ${a0}H${a1}L${FL1} ${FL0}H${FL0}Z" fill="url(#bx-wallT)"/>`);
  B.push(`<path d="M${a1} ${a0}V${a1}L${FL1} ${FL1}V${FL0}Z" fill="url(#bx-wallR)"/>`);
  B.push(`<path d="M${a0} ${a1}H${a1}L${FL1} ${FL1}H${FL0}Z" fill="url(#bx-wallB)"/>`);
  B.push(`<path d="M${a0} ${a0}V${a1}L${FL0} ${FL1}V${FL0}Z" fill="url(#bx-wallL)"/>`);
  B.push(`<rect x="${a0}" y="${a0}" width="${a1 - a0}" height="${a1 - a0}" fill="url(#bx-fibre)" opacity=".7"/>`);
  // vents on the side walls
  const vents = []; for (const y of [300, 700]) { vents.push(`<rect x="${a0 + 9}" y="${y - 22}" width="9" height="44" rx="4.5"/>`, `<rect x="${a1 - 18}" y="${y - 22}" width="9" height="44" rx="4.5"/>`); }
  B.push(`<g fill="#5e4122" opacity=".55">${vents.join('')}</g>`);
  // floor
  B.push(`<rect x="${FL0}" y="${FL0}" width="${FL1 - FL0}" height="${FL1 - FL0}" fill="url(#bx-floor)"/>`);
  B.push(`<rect x="${FL0}" y="${FL0}" width="${FL1 - FL0}" height="${FL1 - FL0}" fill="url(#bx-fibre)"/>`);
  B.push(`<rect x="${FL0}" y="${FL0}" width="34" height="${FL1 - FL0}" fill="url(#bx-castL)"/><rect x="${FL0}" y="${FL0}" width="${FL1 - FL0}" height="40" fill="url(#bx-castT)"/>`);
  // creases + corner seams
  B.push(`<g fill="none" stroke-linecap="round"><path d="M${FL0} ${FL0}H${FL1}V${FL1}H${FL0}Z" stroke="#7a5630" stroke-opacity=".45" stroke-width="1.2"/><path d="M${a0} ${a0}L${FL0} ${FL0}M${a1} ${a0}L${FL1} ${FL0}M${a1} ${a1}L${FL1} ${FL1}M${a0} ${a1}L${FL0} ${FL1}" stroke="#6e4d2a" stroke-opacity=".5" stroke-width="1.2"/><path d="M${a0} ${a0}H${a1}V${a1}H${a0}Z" stroke="#f0d9b2" stroke-opacity=".55" stroke-width="1.2"/></g>`);

  // ---- lid inside (open, lying flat beyond the top edge; hinge at y=50)
  const L = box.lidIn; const Ly0 = O0 - 900; // -850
  for (const [k, op] of [[20, .05], [10, .07], [0, .09]]) L.push(`<rect x="${O0 + 14 - k}" y="${Ly0 + 16 - k}" width="${900 + 2 * k}" height="${900 - 16 + k}" rx="${6 + k}" fill="#2b1a0d" opacity="${op}"/>`);
  L.push(`<rect x="${O0}" y="${Ly0}" width="900" height="900" rx="4" fill="#c9a270"/>`);
  L.push(`<rect x="${O0}" y="${Ly0}" width="${RIM - 4}" height="900" fill="url(#bx-fluteV)"/><rect x="${O1 - RIM + 4}" y="${Ly0}" width="${RIM - 4}" height="900" fill="url(#bx-fluteV)"/><rect x="${O0}" y="${Ly0}" width="900" height="${RIM - 4}" fill="url(#bx-fluteH)"/>`);
  const i0 = O0 + RIM - 4, i1 = O1 - RIM + 4, j0 = Ly0 + RIM - 4;
  // flap inner faces (stand up towards viewer)
  L.push(`<path d="M${i0} ${j0}H${i1}L${i1 - 16} ${j0 + 16}H${i0 + 16}Z" fill="#d9bb8e"/><path d="M${i0} ${j0}L${i0 + 16} ${j0 + 16}V${O0 - 10}H${i0}Z" fill="#c29967"/><path d="M${i1} ${j0}L${i1 - 16} ${j0 + 16}V${O0 - 10}H${i1}Z" fill="#dcc092"/>`);
  L.push(`<rect x="${i0 + 16}" y="${j0 + 16}" width="${i1 - i0 - 32}" height="${O0 - 10 - j0 - 16}" fill="url(#bx-kraft)"/>`);
  L.push(`<rect x="${i0}" y="${j0}" width="${i1 - i0}" height="${O0 - j0}" fill="url(#bx-fibre)" opacity=".8"/>`);
  L.push(`<rect x="${O0}" y="${O0 - 12}" width="900" height="12" fill="url(#bx-hinge)"/>`);
  L.push(`<path d="M${i0 + 16} ${j0 + 16}H${i1 - 16}V${O0 - 12}H${i0 + 16}Z" fill="none" stroke="#7a5630" stroke-opacity=".4" stroke-width="1.2"/>`);
  const cy = (Ly0 + O0) / 2;
  L.push(`<g fill="#1c1511" text-anchor="middle" font-family="'Cormorant Garamond Variable','Cormorant Garamond',Georgia,serif"><text x="500" y="${cy + 6}" font-size="92" font-style="italic" font-weight="500" opacity=".86">Bon appétit</text><text x="500" y="${cy + 74}" font-size="21" font-weight="600" letter-spacing="8" opacity=".72">B&amp;B PARK · KÉNITRA</text></g>`);
  L.push(`<path d="M430 ${cy - 92}H486M514 ${cy - 92}H570" stroke="#1c1511" stroke-opacity=".6" stroke-width="1.2"/><path d="M500 ${cy - 99}L507 ${cy - 92}L500 ${cy - 85}L493 ${cy - 92}Z" fill="#1c1511" opacity=".7"/>`);

  // ---- lid outside (closed)
  const Q = box.lidOut;
  Q.push(`<rect x="${O0}" y="${O0}" width="900" height="900" rx="5" fill="url(#bx-kraft)"/>`);
  Q.push(`<rect x="${O0}" y="${O0}" width="900" height="900" rx="5" fill="url(#bx-fibre)"/>`);
  Q.push(`<rect x="${O0}" y="${O0}" width="900" height="900" rx="5" fill="url(#bx-sheen)"/>`);
  Q.push(`<path d="M${O0 + 3} ${O1 - 4}V${O0 + 3}H${O1 - 4}" fill="none" stroke="#f3dfba" stroke-opacity=".8" stroke-width="2.5"/><path d="M${O0 + 4} ${O1 - 2}H${O1 - 2}V${O0 + 4}" fill="none" stroke="#7d5832" stroke-opacity=".55" stroke-width="3"/>`);
  Q.push(`<path d="M${O0 + 22} ${O1 - 26}H${O1 - 22}" stroke="#8c6439" stroke-opacity=".35" stroke-width="1.4"/><path d="M${O0 + 22} ${O1 - 24.5}H${O1 - 22}" stroke="#f0d9b0" stroke-opacity=".5" stroke-width="1"/>`);
  // stamp
  const FONT = `font-family="'Cormorant Garamond Variable','Cormorant Garamond',Georgia,serif"`;
  const S = [];
  S.push(`<circle cx="500" cy="500" r="206" fill="none" stroke="#1c1511" stroke-opacity=".75" stroke-width="1.3"/>`);
  S.push(`<circle cx="500" cy="500" r="192" fill="url(#bx-ink)"/>`);
  S.push(`<circle cx="500" cy="500" r="178" fill="none" stroke="url(#bx-gold)" stroke-width="2.4"/><circle cx="500" cy="500" r="134" fill="none" stroke="url(#bx-gold)" stroke-width="1"/>`);
  bxDefs.push(`<path id="bx-arcTop" d="M${500 - 150} 500A150 150 0 0 1 ${500 + 150} 500"/><path id="bx-arcBot" d="M${500 - 164} 500A164 164 0 0 0 ${500 + 164} 500"/>`);
  S.push(`<g ${FONT} font-size="22" font-weight="600" letter-spacing="9" fill="#ebcf9c" text-anchor="middle"><text><textPath href="#bx-arcTop" startOffset="50%">KÉNITRA</textPath></text><text><textPath href="#bx-arcBot" startOffset="50%">DEPUIS 2010</textPath></text></g>`);
  S.push(`<g fill="#deb877"><path d="M344 500l5 -5 5 5 -5 5z"/><path d="M646 500l5 -5 5 5 -5 5z"/></g>`);
  S.push(`<text x="500" y="524" ${FONT} font-size="128" font-weight="600" fill="url(#bx-gold)" text-anchor="middle" letter-spacing="-2">B<tspan font-style="italic" font-weight="500" dx="2">&amp;</tspan><tspan dx="2">B</tspan></text>`);
  S.push(`<path d="M440 548H490M510 548H560" stroke="#c79d5e" stroke-width="1"/><path d="M500 543l5 5 -5 5 -5 -5z" fill="#deb877"/>`);
  S.push(`<text x="509" y="590" ${FONT} font-size="30" font-weight="600" letter-spacing="18" fill="#f3e1bf" text-anchor="middle">PARK</text>`);
  Q.push(`<g id="stamp">${S.join('')}</g>`);
}

// Placeholders for the localised words (filled in by Atelier.tsx).
const L10N = [['>Bon appétit<', '>{{greeting}}<'], ['>DEPUIS 2010<', '>{{since}}<']];
const bx = (p) => [['bx-', `atl-${p}-`], ['id="stamp"', `id="atl-${p}-stamp"`], ...L10N];
out.boxBase = write('box-base.svg', bxDefs, box.shadow.join('') + box.base.join(''), bx('bb'));
// The lid's own drop shadow (first three shapes) would turn with the lid in 3D: left out.
out.lidInside = write('lid-inside.svg', bxDefs, `<g transform="translate(0 900)">${box.lidIn.slice(3).join('')}</g>`, bx('bi'));
out.lidOutside = write('lid-outside.svg', bxDefs, box.lidOut.join(''), bx('bo'));

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(11), kb(v));
const counts = {}; items.forEach((i) => (counts[i.kind] = (counts[i.kind] || 0) + 1));
console.log('toppings', counts, 'total', items.length, 'mozzarella patches', patches.length);
