// Generates src/models/berry_bush_1..4.obj - four kinds of berry bush.
// Metres, about 2.2 m wide (the game scales them to the tile anyway).
// Usage: node tools/models/bushes.mjs [outDir] (default src/models)
import { writeFileSync } from 'node:fs';
import { model } from './lib.mjs';

const dir = process.argv[2] ?? new URL('../../src/models', import.meta.url).pathname;

/** Deterministic random numbers, one stream per bush. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/**
 * Leaf mass: a rounded lump of three stacked frustums (n-gon, turned at
 * random) around centre c with radius r and height h; returns it for berries.
 */
function lump(m, rnd, c, r, h, mtl = 'Paint') {
  const n = 7 + Math.floor(rnd() * 3);
  const rot = rnd() * Math.PI;
  const rz = r * (0.85 + rnd() * 0.3);
  const ring = (k) => [[c[0] - r * k, c[0] + r * k], [c[2] - rz * k, c[2] + rz * k]];
  const y0 = c[1] - h / 2;
  const levels = [[0, 0.55], [0.3, 1], [0.7, 0.85], [1, 0.3]];
  for (let i = 0; i < 3; i++) {
    const [f0, k0] = levels[i], [f1, k1] = levels[i + 1];
    const [x0, z0] = ring(k0), [x1, z1] = ring(k1);
    m.box('Leaves', mtl, x0, [y0 + h * f0, y0 + h * f1], z0, { n, rot: rot + i * 0.3, x: x1, z: z1 });
  }
  return { c, r, rz, h };
}

/** Point on the upper/outer surface of a lump, pushed out by `out`. */
function onLump(rnd, L, out = 0, minUp = -0.2) {
  const a = rnd() * Math.PI * 2;
  const up = minUp + rnd() * (0.95 - minUp);
  const ring = Math.sqrt(1 - up * up);
  const k = 0.92;
  return [
    L.c[0] + Math.cos(a) * ring * (L.r * k + out),
    L.c[1] + up * (L.h / 2) * k + (up > 0 ? out : 0),
    L.c[2] + Math.sin(a) * ring * (L.rz * k + out),
  ];
}

/** Pointed leaf tufts sticking out of the lumps - breaks up the outline. */
function tufts(m, rnd, lumps, count, len, mtl = 'Paint') {
  for (let i = 0; i < count; i++) {
    const L = lumps[Math.floor(rnd() * lumps.length)];
    const p = onLump(rnd, L, -0.02, -0.1);
    const d = [p[0] - L.c[0], p[1] - L.c[1] + 0.1, p[2] - L.c[2]];
    const l = Math.hypot(...d);
    const q = p.map((v, j) => v + (d[j] / l) * len * (0.7 + rnd() * 0.6));
    m.beam('Leaf', i % 4 === 0 ? 'LeafLight' : mtl, p, q, len * 0.55, { w1: len * 0.08 });
  }
}

/** A berry: small double cone, n = 5; `shine` adds a highlight. */
function berry(m, p, r, mtl, shine = false) {
  m.box('Berry', mtl, [p[0] - r * 0.7, p[0] + r * 0.7], [p[1] - r, p[1]], [p[2] - r * 0.7, p[2] + r * 0.7], { n: 5, x: [p[0] - r, p[0] + r], z: [p[2] - r, p[2] + r] });
  m.box('Berry', mtl, [p[0] - r, p[0] + r], [p[1], p[1] + r * 0.9], [p[2] - r, p[2] + r], { n: 5, x: [p[0] - r * 0.45, p[0] + r * 0.45], z: [p[2] - r * 0.45, p[2] + r * 0.45] });
  if (shine) m.box('Berry.Shine', 'Shine', [p[0] - r * 0.3, p[0] + r * 0.1], [p[1] + r * 0.45, p[1] + r * 0.75], [p[2] + r * 0.4, p[2] + r * 0.75]);
}

/** Clusters of berries on the lumps. mtls: colours to pick from, weighted by repetition. */
function clusters(m, rnd, lumps, count, per, r, mtls) {
  for (let i = 0; i < count; i++) {
    const L = lumps[Math.floor(rnd() * lumps.length)];
    const p = onLump(rnd, L, r * 0.6, -0.35);
    const mtl = mtls[Math.floor(rnd() * mtls.length)];
    const k = per[0] + Math.floor(rnd() * (per[1] - per[0] + 1));
    for (let j = 0; j < k; j++) {
      const q = j === 0 ? p : [p[0] + (rnd() - 0.5) * r * 3, p[1] - rnd() * r * 2.2, p[2] + (rnd() - 0.5) * r * 3];
      berry(m, q, r * (0.85 + rnd() * 0.3), j === 0 ? mtl : mtls[Math.floor(rnd() * mtls.length)], j === 0);
    }
  }
}

/** A few berries and leaves fallen on the ground round the foot. */
function fallen(m, rnd, radius, count, r, mtls) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, d = radius * (0.7 + rnd() * 0.45);
    const p = [Math.cos(a) * d, r * 0.9, Math.sin(a) * d];
    if (i % 3 === 2) {
      m.box('Fallen.Leaf', 'LeafDry', [p[0] - 0.08, p[0] + 0.08], [0, 0.015], [p[2] - 0.05, p[2] + 0.05], { n: 5, rot: a });
    } else berry(m, p, r, mtls[i % mtls.length]);
  }
}

function write(file, what, m) {
  const colours = {
    Paint: '0.240 0.450 0.200', LeafDark: '0.150 0.300 0.130', LeafLight: '0.420 0.620 0.280',
    LeafDry: '0.560 0.480 0.260', Bark: '0.330 0.230 0.150', Soil: '0.380 0.300 0.200',
    Red: '0.820 0.100 0.160', RedDark: '0.580 0.060 0.110', Pink: '0.900 0.300 0.380',
    Blue: '0.260 0.300 0.680', BlueDark: '0.180 0.180 0.420', Black: '0.330 0.130 0.360',
    Unripe: '0.780 0.300 0.200', Green: '0.560 0.700 0.300', Shine: '1.000 0.950 0.950',
    Thorn: '0.450 0.300 0.260',
  };
  const header = `# ${file}.obj - ${what} fuer procedurally-generated-map
# Einheiten: Meter, Y oben, Vorderseite nach +Z - so wie Blender ein Modell
# exportiert, das in der Vorderansicht zum Betrachter schaut.
# Material Paint (das Laub) bekommt eine je Strauch leicht andere Farbe.
mtllib ${file}.mtl
`;
  writeFileSync(`${dir}/${file}.obj`, header + m.out.join('\n') + '\n');
  const names = ['Paint', ...[...m.used].filter((n) => n !== 'Paint').sort()];
  writeFileSync(`${dir}/${file}.mtl`, `# ${file}.mtl\n` + names.map((n) => `\nnewmtl ${n}\nKd ${colours[n]}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`).join(''));
}

/** Woody stems fanning out from the foot to each lump. */
function stems(m, rnd, lumps, w) {
  for (const L of lumps) {
    const foot = [(rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25];
    const mid = [L.c[0] * 0.55, L.c[1] * 0.45, L.c[2] * 0.55];
    m.beam('Stem', 'Bark', foot, mid, w, { w1: w * 0.8, n: 5 });
    m.beam('Stem', 'Bark', mid, [L.c[0] * 0.9, L.c[1] - L.h * 0.2, L.c[2] * 0.9], w * 0.8, { w1: w * 0.5, n: 5 });
  }
}

// 1: round, dense currant bush with hanging red clusters.
function currant() {
  const m = model(), rnd = rng(11);
  m.box('Mound', 'Soil', [-0.75, 0.75], [0, 0.08], [-0.7, 0.7], { n: 9, x: [-0.6, 0.6], z: [-0.55, 0.55] });
  const lumps = [
    lump(m, rnd, [0, 0.95, 0], 0.72, 1.1),
    lump(m, rnd, [-0.55, 0.7, 0.2], 0.5, 0.85),
    lump(m, rnd, [0.55, 0.7, -0.1], 0.52, 0.85),
    lump(m, rnd, [0.15, 0.62, 0.55], 0.45, 0.75),
    lump(m, rnd, [-0.1, 0.65, -0.55], 0.45, 0.75, 'LeafDark'),
    lump(m, rnd, [0.1, 1.45, -0.05], 0.4, 0.55),
  ];
  stems(m, rnd, lumps.slice(1, 4), 0.08);
  tufts(m, rnd, lumps, 40, 0.24);
  clusters(m, rnd, lumps, 22, [3, 5], 0.055, ['Red', 'Red', 'RedDark']);
  fallen(m, rnd, 0.85, 6, 0.05, ['Red', 'RedDark']);
  write('berry_bush_1', 'Johannisbeerstrauch', m);
}

// 2: low, wide bramble - arching thorny canes, black ripe and red unripe berries.
function bramble() {
  const m = model(), rnd = rng(23);
  const lumps = [
    lump(m, rnd, [-0.5, 0.45, 0.1], 0.6, 0.7),
    lump(m, rnd, [0.45, 0.42, -0.15], 0.62, 0.65),
    lump(m, rnd, [0, 0.62, 0.05], 0.55, 0.75, 'LeafDark'),
    lump(m, rnd, [0.1, 0.35, 0.6], 0.45, 0.5),
    lump(m, rnd, [-0.2, 0.35, -0.6], 0.45, 0.5),
  ];
  // Canes arch out of the leaves in a curve and bend back down to the ground.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rnd() * 0.4;
    const at = (d, y) => [Math.cos(a) * d, y, Math.sin(a) * d];
    const top = 0.62 + rnd() * 0.15;
    const pts = [at(0.45, 0.35), at(0.72, top), at(0.95, top - 0.12), at(1.1, 0.3), at(1.15, 0.04)];
    for (let t = 0; t + 1 < pts.length; t++) {
      m.beam('Cane', 'Thorn', pts[t], pts[t + 1], 0.045 - t * 0.006, { n: 5 });
      const q = pts[t + 1];
      if (t < 3) m.beam('Cane.Thorn', 'Thorn', q, [q[0], q[1] + 0.06, q[2]], 0.022, { w1: 0.002, n: 4 });
      if (t === 1 || t === 2) m.beam('Cane.Leaf', i % 2 ? 'Paint' : 'LeafDark', q, [q[0] + Math.cos(a + 1.3) * 0.2, q[1] + 0.04, q[2] + Math.sin(a + 1.3) * 0.2], 0.11, { w1: 0.01 });
    }
    berry(m, [pts[2][0], pts[2][1] - 0.08, pts[2][2]], 0.06, i % 3 ? 'Black' : 'Unripe');
    if (i % 2) berry(m, [pts[3][0], pts[3][1] + 0.04, pts[3][2]], 0.055, 'Black');
  }
  tufts(m, rnd, lumps, 38, 0.22);
  clusters(m, rnd, lumps, 24, [2, 4], 0.072, ['Black', 'Black', 'Black', 'Unripe', 'Green']);
  fallen(m, rnd, 0.95, 5, 0.05, ['Black', 'Unripe']);
  write('berry_bush_2', 'Brombeerstrauch', m);
}

// 3: blueberry - a clump of small rounded shrubs, blue berries all over.
function blueberry() {
  const m = model(), rnd = rng(37);
  const spots = [[0, 0, 0.5], [-0.62, 0.25, 0.36], [0.6, 0.15, 0.4], [0.2, -0.6, 0.38], [-0.3, 0.72, 0.33], [0.62, -0.5, 0.3], [-0.65, -0.45, 0.32]];
  const lumps = [];
  for (const [x, z, r] of spots) {
    const h = r * (1.4 + rnd() * 0.3);
    lumps.push(lump(m, rnd, [x, h / 2 + 0.05, z], r, h, lumps.length % 3 === 2 ? 'LeafDark' : 'Paint'));
    m.beam('Stem', 'Bark', [x, 0, z], [x * 1.02, 0.18, z * 1.02], 0.05, { n: 5 });
  }
  tufts(m, rnd, lumps, 34, 0.16);
  clusters(m, rnd, lumps, 34, [2, 4], 0.05, ['Blue', 'Blue', 'BlueDark']);
  fallen(m, rnd, 0.9, 6, 0.045, ['Blue', 'BlueDark']);
  write('berry_bush_3', 'Heidelbeerstrauch', m);
}

// 4: taller raspberry bush - bare woody canes below, leafy crown, pink-red berries.
function raspberry() {
  const m = model(), rnd = rng(53);
  m.box('Mound', 'Soil', [-0.55, 0.55], [0, 0.07], [-0.5, 0.5], { n: 8, x: [-0.45, 0.45], z: [-0.4, 0.4] });
  const lumps = [
    lump(m, rnd, [0, 1.35, 0], 0.55, 0.8),
    lump(m, rnd, [-0.5, 1.1, 0.15], 0.45, 0.7),
    lump(m, rnd, [0.5, 1.15, -0.1], 0.45, 0.7),
    lump(m, rnd, [0.1, 1.05, 0.5], 0.42, 0.65, 'LeafDark'),
    lump(m, rnd, [-0.1, 1.0, -0.5], 0.4, 0.6),
    lump(m, rnd, [0.05, 1.75, 0.05], 0.3, 0.45),
  ];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.3;
    const top = [Math.cos(a) * (0.35 + rnd() * 0.3), 0.9 + rnd() * 0.5, Math.sin(a) * (0.35 + rnd() * 0.3)];
    m.beam('Cane', 'Bark', [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], top, 0.06, { w1: 0.04, n: 5 });
    if (i % 3 === 0) m.beam('Cane.Leaf', 'Paint', [top[0] * 0.6, 0.55, top[2] * 0.6], [top[0] * 0.6 + Math.cos(a) * 0.2, 0.62, top[2] * 0.6 + Math.sin(a) * 0.2], 0.12, { w1: 0.01 });
  }
  tufts(m, rnd, lumps, 40, 0.22);
  clusters(m, rnd, lumps, 22, [2, 4], 0.065, ['Pink', 'Pink', 'Red', 'Green']);
  fallen(m, rnd, 0.7, 5, 0.05, ['Pink', 'Red']);
  write('berry_bush_4', 'Himbeerstrauch', m);
}

currant();
bramble();
blueberry();
raspberry();
