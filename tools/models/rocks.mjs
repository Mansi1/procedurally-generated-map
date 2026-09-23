// Generates src/models/stone_1..3.obj and gold_1..3.obj - piles of boulders,
// grey stone and dark ore rock with gold veins and nuggets. Metres, about 3 m
// wide. Big boulders stay in the game's simplified versions; cracks, moss,
// pebbles, veins and nuggets only show close up. Usage: node tools/models/rocks.mjs [outDir] (default src/models)
import { writeFileSync } from 'node:fs';
import { model } from './lib.mjs';

const dir = process.argv[2] ?? new URL('../../src/models', import.meta.url).pathname;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/**
 * Boulder: three rings (foot, belly, top) with a jittered radius per corner,
 * joined into two frustums - an irregular, faceted rock. Returns its shape so
 * details can sit on its surface.
 */
function boulder(m, rnd, [cx, cz], r, h, mtl, n = 7) {
  const rot = rnd() * Math.PI * 2;
  const jit = Array.from({ length: n }, () => 0.75 + rnd() * 0.45);
  const lean = [(rnd() - 0.5) * r * 0.3, (rnd() - 0.5) * r * 0.3];
  const ring = (k, y, dx = 0, dz = 0) => jit.map((j, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return [cx + dx + Math.cos(a) * r * k * j, y, cz + dz + Math.sin(a) * r * k * j * 0.85];
  });
  const belly = 0.35 + rnd() * 0.15;
  const foot = ring(0.85, 0), mid = ring(1, h * belly, lean[0] * 0.5, lean[1] * 0.5), top = ring(0.45 + rnd() * 0.2, h, lean[0], lean[1]);
  m.emit('Boulder', mtl, foot, mid);
  m.emit('Boulder', mtl, mid, top);
  return { c: [cx, cz], r, h, lean };
}

/** Point on a boulder's upper surface (0 = belly, 1 = top), `out` > 1 pushes it outward. */
function onBoulder(rnd, B, up = rnd(), out = 1) {
  const a = rnd() * Math.PI * 2;
  const k = ((1 - up) * 0.9 + up * 0.45) * out;
  const y = B.h * (0.4 + up * 0.6);
  return [B.c[0] + B.lean[0] * up + Math.cos(a) * B.r * k, y, B.c[1] + B.lean[1] * up + Math.sin(a) * B.r * k * 0.85];
}

/** Pebbles and flat stones round the foot. */
function pebbles(m, rnd, radius, count, mtls) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, d = radius * (0.55 + rnd() * 0.5);
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    const s = 0.06 + rnd() * 0.1;
    m.box('Pebble', mtls[i % mtls.length], [x - s, x + s], [0, s * 0.9], [z - s * 0.8, z + s * 0.8], { n: 5, rot: rnd() * 3, x: [x - s * 0.5, x + s * 0.5], z: [z - s * 0.4, z + s * 0.4] });
  }
}

/** Dark crack running down a boulder. */
function crack(m, rnd, B) {
  const p0 = onBoulder(rnd, B, 0.9), p1 = onBoulder(rnd, B, 0.2);
  const dir = [p1[0] - B.c[0], p1[2] - B.c[1]];
  const l = Math.hypot(...dir) || 1;
  p1[0] += (dir[0] / l) * 0.05; p1[2] += (dir[1] / l) * 0.05;
  m.beam('Crack', 'Soot', p0, p1, 0.03, { w1: 0.015 });
}

/** Moss patch on a boulder's top. */
function moss(m, rnd, B) {
  const p = onBoulder(rnd, B, 0.85 + rnd() * 0.15);
  const s = B.r * 0.35;
  m.box('Moss', 'Moss', [p[0] - s, p[0] + s], [p[1] - 0.04, p[1] + 0.03], [p[2] - s * 0.8, p[2] + s * 0.8], { n: 6, rot: rnd() * 3 });
}

/** Gold vein across a boulder and nuggets sticking out of it. */
function vein(m, rnd, B) {
  const p0 = onBoulder(rnd, B, 0.95, 1.08), p1 = onBoulder(rnd, B, 0.15, 1.08);
  const mid = p0.map((v, j) => (v + p1[j]) / 2);
  const dir = [mid[0] - B.c[0], 0, mid[2] - B.c[1]];
  const l = Math.hypot(...dir) || 1;
  const bulge = mid.map((v, j) => v + (dir[j] / l) * B.r * 0.12);
  m.beam('Vein', 'Gold', p0, bulge, 0.13, { w1: 0.11 });
  m.beam('Vein', 'GoldLight', bulge, p1, 0.11, { w1: 0.06 });
  for (let i = 0; i < 4; i++) {
    const f = 0.1 + i * 0.27;
    const p = f < 0.5 ? p0.map((v, j) => v + (bulge[j] - v) * f * 2) : bulge.map((v, j) => v + (p1[j] - v) * (f - 0.5) * 2);
    nugget(m, rnd, p, 0.11 + rnd() * 0.06, i % 2 ? 'GoldLight' : 'Gold');
  }
}

/** Rounded gold nugget with a bright facet. */
function nugget(m, rnd, p, s, mtl) {
  m.box('Nugget', mtl, [p[0] - s, p[0] + s], [p[1] - s * 0.4, p[1] + s * 0.9], [p[2] - s, p[2] + s], { n: 6, rot: rnd() * 3, x: [p[0] - s * 0.5, p[0] + s * 0.5], z: [p[2] - s * 0.5, p[2] + s * 0.5] });
  m.box('Nugget.Shine', 'Shine', [p[0] - s * 0.3, p[0] + s * 0.2], [p[1] + s * 0.6, p[1] + s * 0.95], [p[2] + s * 0.2, p[2] + s * 0.55]);
}

function write(file, what, m) {
  const colours = {
    Stone: '0.620 0.620 0.640', StoneDark: '0.470 0.470 0.490', StoneLight: '0.740 0.730 0.720',
    StoneWarm: '0.600 0.560 0.520', Rock: '0.440 0.400 0.360', RockDark: '0.330 0.300 0.280',
    Soot: '0.150 0.140 0.140', Moss: '0.360 0.480 0.220', Gold: '0.950 0.760 0.200',
    GoldLight: '1.000 0.880 0.400', GoldDark: '0.760 0.560 0.120', Shine: '1.000 0.980 0.850',
    Soil: '0.400 0.330 0.250',
  };
  const header = `# ${file}.obj - ${what} fuer procedurally-generated-map
# Einheiten: Meter, Y oben, Vorderseite nach +Z - so wie Blender ein Modell
# exportiert, das in der Vorderansicht zum Betrachter schaut.
mtllib ${file}.mtl
`;
  writeFileSync(`${dir}/${file}.obj`, header + m.out.join('\n') + '\n');
  const names = [...m.used].sort();
  writeFileSync(`${dir}/${file}.mtl`, `# ${file}.mtl\n` + names.map((n) => `\nnewmtl ${n}\nKd ${colours[n]}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`).join(''));
}

// Stone: big boulders, grey in three tones, cracks, moss, pebbles.
const STONES = [
  // one large boulder with smaller ones leaning against it
  [[[0, -0.1], 1.1, 1.7], [[-0.95, 0.45], 0.62, 0.9], [[0.9, 0.5], 0.55, 0.75], [[0.2, 0.95], 0.4, 0.5]],
  // a low, wide pile of several rocks
  [[[-0.6, 0], 0.8, 1.1], [[0.6, -0.2], 0.85, 1.2], [[0.05, 0.75], 0.55, 0.7], [[-0.2, -0.85], 0.5, 0.6], [[1.05, 0.65], 0.35, 0.4]],
  // tall split rock: two slabs side by side
  [[[-0.42, 0], 0.7, 2.0], [[0.45, 0.1], 0.65, 1.8], [[0.1, 0.9], 0.45, 0.55], [[-1.0, -0.5], 0.4, 0.45]],
];

function stone(i) {
  const m = model(), rnd = rng(71 + i * 13);
  const tones = ['Stone', 'StoneDark', 'StoneLight', 'StoneWarm'];
  const bs = STONES[i].map(([c, r, h], k) => boulder(m, rnd, c, r, h, tones[(k + i) % tones.length], 7 + (k % 2)));
  bs.forEach((B, k) => {
    crack(m, rnd, B);
    if (k < 2) crack(m, rnd, B);
    if (k % 2 === 0) moss(m, rnd, B);
  });
  pebbles(m, rnd, 1.45, 14, ['Stone', 'StoneDark', 'StoneLight']);
  write(`stone_${i + 1}`, 'Steinvorkommen', m);
}

// Gold: dark ore rock with gold veins, nuggets in the rock and on the ground.
const GOLDS = [
  [[[0, 0], 1.05, 1.5], [[-0.9, 0.5], 0.55, 0.75], [[0.85, 0.45], 0.5, 0.65]],
  [[[-0.5, -0.1], 0.8, 1.0], [[0.55, 0.05], 0.75, 1.25], [[0, 0.8], 0.45, 0.55], [[-0.1, -0.85], 0.45, 0.5]],
  [[[0, 0], 0.9, 1.9], [[-0.85, -0.35], 0.5, 0.7], [[0.75, 0.6], 0.55, 0.8]],
];

function gold(i) {
  const m = model(), rnd = rng(131 + i * 17);
  const bs = GOLDS[i].map(([c, r, h], k) => boulder(m, rnd, c, r, h, k % 2 ? 'RockDark' : 'Rock', 7));
  bs.forEach((B, k) => {
    vein(m, rnd, B);
    if (k === 0) vein(m, rnd, B);
    crack(m, rnd, B);
    for (let j = 0; j < 5; j++) nugget(m, rnd, onBoulder(rnd, B, 0.3 + rnd() * 0.7, 1.05), 0.09 + rnd() * 0.07, j % 2 ? 'GoldDark' : 'Gold');
  });
  // A heap of broken-off ore with nuggets in front.
  for (let j = 0; j < 10; j++) {
    const a = 1.0 + rnd() * 1.8, d = 1.0 + rnd() * 0.45;
    nugget(m, rnd, [Math.cos(a) * d, 0.08, Math.sin(a) * d], 0.09 + rnd() * 0.08, ['Gold', 'GoldLight', 'GoldDark'][j % 3]);
  }
  pebbles(m, rnd, 1.4, 10, ['Rock', 'RockDark', 'Stone']);
  write(`gold_${i + 1}`, 'Goldvorkommen', m);
}

for (let i = 0; i < 3; i++) {
  stone(i);
  gold(i);
}
