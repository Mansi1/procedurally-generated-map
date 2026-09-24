// Generates src/icons/wood-bar.png - two rows of wooden planks with grain
// bending round knots, cracks, worn edges and nails; the background of the
// resource bar. Rendered at 2x for sharpness in a headless Chrome.
// Usage: node tools/ui/wood-bar.mjs [out.png] (default src/icons/wood-bar.png)
import { launch } from './browser.mjs';

const W = 760, H = 58, PLANK = H / 2;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

const out = [];
const rect = (x, y, w, h, fill, extra = '') => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`);

// Planks: two rows, each split into boards of different length and tone.
const boards = [];
for (let row = 0; row < 2; row++) {
  let x = row ? -140 : 0;
  while (x < W) {
    const len = 260 + rnd() * 220;
    boards.push({ x, y: row * PLANK, w: len, h: PLANK, tone: rnd() });
    x += len;
  }
}

for (const b of boards) {
  const base = [0.53 + b.tone * 0.1, 0.34 + b.tone * 0.06, 0.18 + b.tone * 0.04];
  const col = (k) => `rgb(${base.map((v) => Math.round(Math.min(1, v * k) * 255)).join(',')})`;
  out.push(`<g clip-path="inset(0)"><svg x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" overflow="hidden">`);
  // Base with a soft lengthwise gradient.
  out.push(`<defs><linearGradient id="g${out.length}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${col(1.12)}"/><stop offset="0.5" stop-color="${col(1)}"/><stop offset="1" stop-color="${col(0.86)}"/></linearGradient></defs>`);
  rect(0, 0, b.w, b.h, `url(#g${out.length - 1})`);
  // Knots in this board.
  const knots = [];
  const nk = rnd() < 0.7 ? 1 + Math.floor(rnd() * 2) : 0;
  for (let i = 0; i < nk; i++) knots.push({ x: 30 + rnd() * (b.w - 60), y: 6 + rnd() * (b.h - 12), r: 2.5 + rnd() * 3.5 });
  // Grain lines: many thin wavy lines; they swerve round the knots.
  const lines = 26;
  for (let i = 0; i < lines; i++) {
    const y0 = (i + 0.5) * (b.h / lines) + (rnd() - 0.5) * 0.8;
    const f1 = 0.004 + rnd() * 0.01, p1 = rnd() * 6.3, a1 = 0.6 + rnd() * 1.2;
    const f2 = 0.03 + rnd() * 0.04, p2 = rnd() * 6.3, a2 = 0.15 + rnd() * 0.25;
    let d = '';
    for (let x = -2; x <= b.w + 2; x += 3) {
      let y = y0 + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a2;
      for (const k of knots) {
        const dx = x - k.x, dy = y - k.y;
        const infl = Math.exp(-(dx * dx) / (k.r * k.r * 30));
        const push = (k.r * 2.2) * infl * Math.exp(-(dy * dy) / (k.r * k.r * 6));
        y += Math.sign(dy || 1) * push;
      }
      d += `${x === -2 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)}`;
    }
    const dark = rnd();
    const stroke = dark < 0.55 ? 'rgba(60,32,14,' : dark < 0.8 ? 'rgba(90,52,24,' : 'rgba(255,215,160,';
    const alpha = dark < 0.8 ? 0.25 + rnd() * 0.45 : 0.12 + rnd() * 0.15;
    out.push(`<path d="${d}" fill="none" stroke="${stroke}${alpha.toFixed(2)})" stroke-width="${(0.35 + rnd() * 0.7).toFixed(2)}"/>`);
  }
  // Knots: dark core with rings.
  for (const k of knots) {
    for (let r = 4; r >= 1; r--) {
      out.push(`<ellipse cx="${k.x}" cy="${k.y}" rx="${(k.r * 2.4 * r / 4).toFixed(2)}" ry="${(k.r * r / 4).toFixed(2)}" fill="${r === 1 ? 'rgb(52,28,12)' : 'none'}" stroke="rgba(55,30,12,${(0.25 + 0.15 * (4 - r)).toFixed(2)})" stroke-width="0.8"/>`);
    }
    out.push(`<ellipse cx="${k.x - k.r * 0.3}" cy="${k.y - k.r * 0.25}" rx="${k.r * 0.6}" ry="${k.r * 0.25}" fill="rgba(255,210,150,0.18)"/>`);
  }
  // Small cracks along the grain.
  for (let i = 0; i < 2; i++) {
    if (rnd() < 0.5) continue;
    const x = rnd() * b.w, y = 3 + rnd() * (b.h - 6), l = 12 + rnd() * 30;
    out.push(`<path d="M${x} ${y} q${l / 2} ${(rnd() - 0.5) * 2} ${l} ${(rnd() - 0.5) * 1.5}" stroke="rgba(30,15,5,0.7)" stroke-width="0.9" fill="none" stroke-linecap="round"/>`);
  }
  // Worn edges: lighter top edge, dark bottom edge, dark board ends.
  rect(0, 0, b.w, 1.2, 'rgba(255,225,180,0.35)');
  rect(0, b.h - 1.6, b.w, 1.6, 'rgba(25,12,4,0.75)');
  rect(0, 0, 1.6, b.h, 'rgba(25,12,4,0.7)');
  rect(1.6, 0, 1, b.h, 'rgba(255,225,180,0.2)');
  out.push('</svg></g>');
  // Nails near both board ends.
  for (const nx of [b.x + 7, b.x + b.w - 7]) {
    for (const ny of [b.y + b.h * 0.5]) {
      if (nx < 3 || nx > W - 3) continue;
      out.push(`<circle cx="${nx}" cy="${ny}" r="2.1" fill="rgb(40,34,30)"/>` +
        `<circle cx="${nx - 0.6}" cy="${ny - 0.6}" r="0.9" fill="rgba(200,190,175,0.7)"/>` +
        `<circle cx="${nx + 0.8}" cy="${ny + 1.2}" r="2.6" fill="none" stroke="rgba(60,30,10,0.4)" stroke-width="0.8"/>`);
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${out.join('')}</svg>`;
const file = process.argv[2] ?? new URL('../../src/icons/wood-bar.png', import.meta.url).pathname;

const b = await launch();
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await p.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
await b.close();
