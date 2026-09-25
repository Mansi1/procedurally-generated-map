// Shared parts and file output for the model generators. The primitives
// themselves live in primitives.mjs (browser-safe).
import { model } from './primitives.mjs';

export { model };

/**
 * Gable roof slope made of `courses` rows, each row's lower edge lifted a
 * little so the rows read as tiles or thatch. Slope from eave (e: [u, y]) to
 * ridge (r: [u, y]) in the plane across `axis`, extruded over `span`.
 */
export function slope(m, name, mtl, axis, span, e, r, t, courses) {
  for (let i = 0; i < courses; i++) {
    const f0 = i / courses, f1 = (i + 1) / courses;
    const lo = [e[0] + (r[0] - e[0]) * f0, e[1] + (r[1] - e[1]) * f0];
    const hi = [e[0] + (r[0] - e[0]) * f1, e[1] + (r[1] - e[1]) * f1];
    const lift = i === courses - 1 ? 0 : t * 0.6;
    m.extrude(name, mtl, axis, span, [lo, hi, [hi[0], hi[1] + t], [lo[0], lo[1] + t + lift]]);
  }
}

/** Hip roof as stacked frustums: from rect (x, z) at y0 to ridge rect (rx, rz) at y1. */
export function hipRoof(m, name, mtl, x, z, y0, rx, rz, y1, courses) {
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  for (let i = 0; i < courses; i++) {
    const f0 = i / courses, f1 = (i + 1) / courses;
    const lip = i === 0 ? 0 : 0.1;
    const bx = lerp(x, rx, f0), bz = lerp(z, rz, f0);
    m.box(name, mtl, [bx[0] - lip, bx[1] + lip], [y0 + (y1 - y0) * f0 - (i ? 0.08 : 0), y0 + (y1 - y0) * f1],
      [bz[0] - lip, bz[1] + lip], { x: lerp(x, rx, f1), z: lerp(z, rz, f1) });
  }
}

/** Barrel standing at (x, z): staves, iron hoops, lid. */
export function barrel(m, x, z, h = 0.85, r = 0.3) {
  m.box('Barrel', 'Wood', [x - r * 0.85, x + r * 0.85], [0, h / 2], [z - r * 0.85, z + r * 0.85], { n: 10, x: [x - r, x + r], z: [z - r, z + r] });
  m.box('Barrel', 'Wood', [x - r, x + r], [h / 2, h], [z - r, z + r], { n: 10, x: [x - r * 0.85, x + r * 0.85], z: [z - r * 0.85, z + r * 0.85] });
  for (const y of [h * 0.15, h * 0.8]) {
    const rr = r * (0.9 + 0.1 * Math.sin((y / h) * Math.PI)) + 0.012;
    m.box('Barrel.Hoop', 'Iron', [x - rr, x + rr], [y, y + 0.05], [z - rr, z + rr], { n: 10 });
  }
  m.box('Barrel.Lid', 'WoodDark', [x - r * 0.78, x + r * 0.78], [h, h + 0.02], [z - r * 0.78, z + r * 0.78], { n: 10 });
}

/** Crate with dark edge boards, standing on y0. */
export function crate(m, [x0, x1], y0, [z0, z1]) {
  const s = x1 - x0, e = 0.05;
  const y1 = y0 + s;
  m.box('Crate', 'WoodLight', [x0, x1], [y0, y1], [z0, z1]);
  for (const [a, b] of [[x0 - 0.01, x0 + e], [x1 - e, x1 + 0.01]]) {
    for (const [c, d] of [[z0 - 0.01, z0 + e], [z1 - e, z1 + 0.01]]) m.box('Crate.Edge', 'Wood', [a, b], [y0, y1], [c, d]);
  }
  for (const [c, d] of [[y0 - 0.005, y0 + e], [y1 - e, y1 + 0.005]]) {
    m.box('Crate.Edge', 'Wood', [x0 - 0.01, x1 + 0.01], [c, d], [z0 - 0.01, z0 + e]);
    m.box('Crate.Edge', 'Wood', [x0 - 0.01, x1 + 0.01], [c, d], [z1 - e, z1 + 0.01]);
  }
  m.beam('Crate.Brace', 'Wood', [x0 + e, y0 + e, z1 + 0.005], [x1 - e, y1 - e, z1 + 0.005], 0.05);
}

/** Log lying along x centred at (y, z) - bark with light cut ends. */
export function log(m, [x0, x1], y, z, r) {
  m.box('Log', 'Bark', [x0, x1], [y - r, y + r], [z - r, z + r], { axis: 'x', n: 8 });
  for (const [a, b] of [[x0 - 0.012, x0], [x1, x1 + 0.012]]) {
    m.box('Log.End', 'LogEnd', [a, b], [y - r * 0.88, y + r * 0.88], [z - r * 0.88, z + r * 0.88], { axis: 'x', n: 8 });
  }
}

/** Hanging lantern at (x, y, z) - iron frame round a flame. */
export function lantern(m, x, y, z) {
  m.box('Lantern', 'Iron', [x - 0.07, x + 0.07], [y - 0.02, y], [z - 0.07, z + 0.07]);
  m.box('Lantern.Flame', 'Flame', [x - 0.05, x + 0.05], [y, y + 0.14], [z - 0.05, z + 0.05]);
  m.box('Lantern.Cap', 'Iron', [x - 0.08, x + 0.08], [y + 0.14, y + 0.2], [z - 0.08, z + 0.08], { x: [x - 0.02, x + 0.02], z: [z - 0.02, z + 0.02] });
}

/**
 * Bow: a curved stave from tip to tip with a straight string. `c` is the
 * middle of the grip, `up` points to the upper tip, `back` to where the limbs
 * bend away from the string; both unit vectors. `sag`: how far the middle
 * sits in front of the tips (braced bow). `name` names the objects (the
 * armory numbers its bows 'Stock.<n>'), `thick` scales its thickness.
 */
export function bow(m, c, up, back, length = 1.7, sag = 0.18, name = 'Bow', thick = 1) {
  const at = (t) => c.map((v, i) => v + up[i] * t * length / 2 + back[i] * sag * (1 - t * t));
  const N = 8;
  for (let i = 0; i < N; i++) {
    const t0 = -1 + (2 * i) / N, t1 = -1 + (2 * (i + 1)) / N;
    // Thick at the grip, thin at the tips.
    const w = (t) => (0.03 + 0.03 * (1 - Math.abs(t))) * thick;
    m.beam(name, 'Wood', at(t0), at(t1), w(t0), { w1: w(t1) });
  }
  m.beam(`${name}.Grip`, 'WoodDark', at(-0.1), at(0.1), 0.07 * thick);
  m.beam(`${name}.String`, 'Canvas', at(-1), at(1), 0.012 * thick);
}

export const PALETTE = {
  Stone: '0.600 0.585 0.560', StoneDark: '0.450 0.440 0.425', StoneLight: '0.720 0.700 0.660',
  Plaster: '0.900 0.860 0.760', Timber: '0.270 0.180 0.110', Wood: '0.420 0.290 0.170',
  WoodDark: '0.300 0.200 0.120', WoodLight: '0.600 0.450 0.280', Glass: '0.220 0.280 0.340',
  Iron: '0.400 0.420 0.450', Soot: '0.100 0.090 0.090', Flame: '1.000 0.780 0.300',
  Leaf: '0.300 0.520 0.220', Flower: '0.860 0.250 0.300', Shutter: '0.300 0.450 0.320',
  Tiles: '0.620 0.270 0.200', RoofDark: '0.380 0.200 0.150', Canvas: '0.930 0.900 0.820',
  Sack: '0.800 0.720 0.560', Bark: '0.330 0.220 0.120', LogEnd: '0.850 0.700 0.470',
  Gold: '0.930 0.740 0.220', GoldDark: '0.700 0.520 0.120', Ore: '0.350 0.330 0.320',
  Dirt: '0.450 0.380 0.280', PlasterGrey: '0.760 0.760 0.740', WindowLit: '1.000 0.820 0.420',
  Shingle: '0.520 0.410 0.290', ShingleDark: '0.380 0.290 0.200', Ivy: '0.300 0.520 0.200',
  IvyDark: '0.190 0.380 0.140', Straw: '0.850 0.740 0.420', Feather: '0.900 0.880 0.840',
};

export function write(dir, file, header, m, paint) {
  const { writeFileSync } = require_fs();
  writeFileSync(`${dir}/${file}.obj`, `${header}mtllib ${file}.mtl\n${m.out.join('\n')}\n`);
  const names = ['Paint', ...[...m.used].filter((n) => n !== 'Paint').sort()];
  let mtl = `# ${file}.mtl\n`;
  for (const n of names) {
    const kd = n === 'Paint' ? paint : PALETTE[n];
    if (!kd) throw new Error(`no colour for ${n}`);
    mtl += `\nnewmtl ${n}\nKd ${kd}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`;
  }
  writeFileSync(`${dir}/${file}.mtl`, mtl);
}

import * as fs from 'node:fs';
const require_fs = () => fs;
