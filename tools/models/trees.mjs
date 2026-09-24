// Generates src/models/tree_*.obj - six kinds of tree, in metres.
// Built in three sizes of part so the game's simplified versions still work:
// trunk and core crown (kept even far out), leaf masses (kept at medium
// zoom), and small tufts, cones and bark marks (only close up).
// Usage: node tools/models/trees.mjs [outDir] (default src/models)
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

/** Leaf mass: two frustums, widest in the middle. Returns it for tufts. */
function mass(m, rnd, c, r, h, mtl = 'Paint', n = 7) {
  const rot = rnd() * Math.PI;
  const rz = r * (0.85 + rnd() * 0.3);
  const ring = (k) => [[c[0] - r * k, c[0] + r * k], [c[2] - rz * k, c[2] + rz * k]];
  const [x0, z0] = ring(0.6), [x1, z1] = ring(1), [x2, z2] = ring(0.3);
  m.box('Crown', mtl, x0, [c[1] - h / 2, c[1]], z0, { n, rot, x: x1, z: z1 });
  m.box('Crown', mtl, x1, [c[1], c[1] + h / 2], z1, { n, rot: rot + 0.25, x: x2, z: z2 });
  return { c, r, rz, h };
}

/** Point on the surface of a mass, `minUp`..1 from bottom to top. */
function onMass(rnd, L, minUp = -0.3) {
  const a = rnd() * Math.PI * 2;
  const up = minUp + rnd() * (0.95 - minUp);
  const ring = Math.sqrt(1 - up * up) * 0.95;
  return [L.c[0] + Math.cos(a) * ring * L.r, L.c[1] + up * L.h * 0.45, L.c[2] + Math.sin(a) * ring * L.rz];
}

/** Small leaf clusters on the masses - close-up detail. */
function clumps(m, rnd, masses, count, r, mtls) {
  for (let i = 0; i < count; i++) {
    const L = masses[Math.floor(rnd() * masses.length)];
    const p = onMass(rnd, L);
    const mtl = mtls[i % mtls.length];
    const rr = r * (0.7 + rnd() * 0.5);
    m.box('Clump', mtl, [p[0] - rr, p[0] + rr], [p[1] - rr * 0.7, p[1] + rr * 0.7], [p[2] - rr, p[2] + rr], { n: 5, rot: rnd() * 3, x: [p[0] - rr * 0.4, p[0] + rr * 0.4], z: [p[2] - rr * 0.4, p[2] + rr * 0.4] });
  }
}

/** Pointed needle or leaf tufts sticking out of the masses. */
function tufts(m, rnd, masses, count, len, mtls, droop = 0) {
  for (let i = 0; i < count; i++) {
    const L = masses[Math.floor(rnd() * masses.length)];
    const p = onMass(rnd, L, -0.2);
    const d = [p[0] - L.c[0], p[1] - L.c[1] - droop, p[2] - L.c[2]];
    const l = Math.hypot(...d) || 1;
    const q = p.map((v, j) => v + (d[j] / l) * len * (0.7 + rnd() * 0.6));
    m.beam('Tuft', mtls[i % mtls.length], p, q, len * 0.45, { w1: len * 0.06 });
  }
}

/** Trunk as beam segments through `pts` with radius going from r0 to r1. */
/**
 * Height of the stump ring, in metres before stretching. The trunk is split
 * there: the game leaves the stump standing when the tree falls and hinges
 * the rest of the trunk at this ring (it reads the height from the model).
 */
let STUMP = 0.45;
/** Height of a finished stump in metres, after stretching (see build). */
const STUMP_HEIGHT = 0.5;

function trunk(m, pts, r0, r1, mtl, n = 7) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const f0 = i / (pts.length - 1), f1 = (i + 1) / (pts.length - 1);
    const w0 = 2 * (r0 + (r1 - r0) * f0), w1 = 2 * (r0 + (r1 - r0) * f1);
    const material = typeof mtl === 'function' ? mtl(i) : mtl;
    const [a, b] = [pts[i], pts[i + 1]];
    if (i === 0 && a[1] < STUMP && b[1] > STUMP + 0.3) {
      // Stump and the first piece above it are cut level (horizontal rings),
      // like with a saw - also on a leaning trunk. The game finds both cut
      // faces at the stump height.
      const at = (y) => a.map((v, j) => v + (b[j] - v) * ((y - a[1]) / (b[1] - a[1])));
      const width = (y) => w0 + (w1 - w0) * ((y - a[1]) / (b[1] - a[1]));
      const level = (name, y0, y1) => {
        const [c0, c1] = [at(y0), at(y1)];
        const [r0, r1] = [width(y0) / 2, width(y1) / 2];
        m.box(name, material, [c0[0] - r0, c0[0] + r0], [y0, y1], [c0[2] - r0, c0[2] + r0],
          { n, x: [c1[0] - r1, c1[0] + r1], z: [c1[2] - r1, c1[2] + r1] });
      };
      level('Trunk.Stump', a[1], STUMP);
      level('Trunk', STUMP, STUMP + 0.3);
      pieces(m, material, at(STUMP + 0.3), b, width(STUMP + 0.3), w1, n);
      continue;
    }
    pieces(m, material, a, b, w0, w1, n);
  }
}

/**
 * A trunk segment in short rings: the game saws the lying trunk off from
 * the tip and colours the cut edge light - on one long piece that colour
 * would run down the whole piece.
 */
function pieces(m, material, a, b, w0, w1, n) {
  const k = Math.max(1, Math.ceil(Math.hypot(...b.map((v, j) => v - a[j])) / 0.3));
  for (let i = 0; i < k; i++) {
    const p0 = a.map((v, j) => v + (b[j] - v) * (i / k));
    const p1 = a.map((v, j) => v + (b[j] - v) * ((i + 1) / k));
    m.beam('Trunk', material, p0, p1, w0 + (w1 - w0) * (i / k), { w1: w0 + (w1 - w0) * ((i + 1) / k), n });
  }
}

/** Roots flaring out at the foot. */
function roots(m, rnd, r, count, len, mtl = 'Bark') {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.5;
    // Kurz und flach am Stammfuß - sonst sieht der Stumpf nach dem Fällen
    // wie eine Feuerstelle aus.
    // Unter der Schnittkante des Stumpfs ansetzen - sonst ragen die Wurzeln
    // dicker Bäume nach dem Fällen wie Beine in die Luft.
    // Innen im Stumpf ansetzen und so dünn, dass die Wurzel nicht durch die
    // Schnittfläche sticht.
    const top = Math.min(r * 0.6, STUMP * 0.45);
    m.beam('Root', mtl, [Math.cos(a) * r * 0.45, top, Math.sin(a) * r * 0.45], [Math.cos(a) * (r + len * 0.55), 0, Math.sin(a) * (r + len * 0.55)], Math.min(r * 0.7, top * 1.3), { w1: r * 0.2, n: 5 });
  }
}

/** Grass and fallen leaves or needles round the foot - close-up detail. */
function litter(m, rnd, radius, count, mtls) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, d = radius * (0.4 + rnd() * 0.7);
    const p = [Math.cos(a) * d, 0, Math.sin(a) * d];
    const mtl = mtls[i % mtls.length];
    if (mtl === 'Grass') {
      for (let k = 0; k < 3; k++) m.beam('Grass', 'Grass', p, [p[0] + (rnd() - 0.5) * 0.12, 0.2 + rnd() * 0.12, p[2] + (rnd() - 0.5) * 0.12], 0.05, { w1: 0.005, n: 3 });
    } else {
      m.box('Litter', mtl, [p[0] - 0.08, p[0] + 0.08], [0, 0.02], [p[2] - 0.06, p[2] + 0.06], { n: 5, rot: a });
    }
  }
}

/**
 * Real size of each kind in metres (height, crown width). The models are drawn
 * small and stretched here: the full height, but the crown only as wide as
 * fits a forest where every tile holds a tree.
 */
const SIZE = {
  tree_spruce: [18, 5], tree_pine: [17, 5.5], tree_oak: [15, 7.5],
  tree_birch: [14, 4.5], tree_birch_2: [17, 8], tree_birch_3: [15, 8], tree_poplar: [20, 3], tree_maple: [13, 6.5],
  tree_oak_old: [16, 9], tree_oak_young: [9, 4],
};

function stretch(file, m) {
  const pts = m.out.filter((l) => l.startsWith('v ')).map((l) => l.split(' ').slice(1).map(Number));
  const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const h = Math.max(...pts.map((p) => p[1]));
  const [H, Wd] = SIZE[file];
  const fy = H / h, fxz = Wd / w;
  m.out = m.out.map((l) => {
    if (!l.startsWith('v ')) return l;
    const [x, y, z] = l.split(' ').slice(1).map(Number);
    return `v ${+(x * fxz).toFixed(3)} ${+(y * fy).toFixed(3)} ${+(z * fxz).toFixed(3)}`;
  });
}

/** Set by build(): measure only - how tall the tree comes out before stretching. */
let measuring = false;
let measured = 0;

function write(file, what, m, note) {
  if (measuring) {
    measured = Math.max(...m.out.filter((l) => l.startsWith('v ')).map((l) => Number(l.split(' ')[2])));
    return;
  }
  stretch(file, m);
  const colours = {
    Paint: '0.160 0.380 0.200', LeafDark: '0.110 0.260 0.140', LeafLight: '0.360 0.560 0.250',
    Needle: '0.120 0.300 0.170', NeedleDark: '0.080 0.200 0.120',
    Bark: '0.360 0.240 0.140', BarkDark: '0.240 0.160 0.100', PineBark: '0.620 0.360 0.220',
    Birch: '0.920 0.910 0.860', BirchMark: '0.150 0.140 0.130', Moss: '0.360 0.460 0.200',
    Cone: '0.460 0.300 0.170', Soot: '0.100 0.080 0.070', Grass: '0.340 0.560 0.220',
    Autumn: '0.900 0.460 0.140', AutumnDark: '0.740 0.260 0.100', AutumnLight: '0.960 0.700 0.220',
    LeafDry: '0.620 0.480 0.240', LeafCard: '0.000 0.000 0.000', BranchCard: '0.000 0.000 0.000', Acorn: '0.550 0.380 0.180', AcornCap: '0.380 0.280 0.160',
  };
  const header = `# ${file}.obj - ${what} (Holz) fuer procedurally-generated-map
# Einheiten: Meter, Y oben, Vorderseite nach +Z - so wie Blender ein Modell
# exportiert, das in der Vorderansicht zum Betrachter schaut.
# ${note}
mtllib ${file}.mtl
`;
  writeFileSync(`${dir}/${file}.obj`, header + m.out.join('\n') + '\n');
  const names = [...m.used].sort((a, b) => (a === 'Paint' ? -1 : b === 'Paint' ? 1 : a.localeCompare(b)));
  writeFileSync(`${dir}/${file}.mtl`, `# ${file}.mtl\n` + names.map((n) => `\nnewmtl ${n}\nKd ${colours[n]}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`).join(''));
}
const PAINT = 'Material Paint (das Laub) bekommt eine je Baum leicht andere Farbe.';

// Spruce: tiers of drooping branches, darker underneath, cones at the tips.
function spruce() {
  const m = model(), rnd = rng(3);
  roots(m, rnd, 0.2, 5, 0.35);
  trunk(m, [[0, 0, 0], [0, 7.2, 0]], 0.2, 0.05, 'BarkDark', 6);
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const y = 0.9 + i * 1.05;
    const R = 1.5 * (1 - f * 0.82);
    const rot = i * 0.4;
    m.box('Tier', 'NeedleDark', [-R * 0.92, R * 0.92], [y - 0.1, y + 0.35], [-R * 0.92, R * 0.92], { n: 8, rot, x: [-R * 0.6, R * 0.6], z: [-R * 0.6, R * 0.6] });
    m.box('Tier', 'Paint', [-R, R], [y, y + 1.75], [-R, R], { n: 8, rot: rot + 0.2, x: [-R * 0.12, R * 0.12], z: [-R * 0.12, R * 0.12] });
    // Branch tips hang down over the tier's rim; cones under some of them.
    for (let k = 0; k < 8; k++) {
      const a = rot + 0.2 + Math.PI / 8 + (k * Math.PI) / 4;
      const p = [Math.cos(a) * R * 0.8, y + 0.2, Math.sin(a) * R * 0.8];
      const q = [Math.cos(a) * R * 1.08, y - 0.12, Math.sin(a) * R * 1.08];
      m.beam('Tip', k % 2 ? 'Needle' : 'Paint', p, q, 0.28 * (1 - f * 0.5), { w1: 0.04, n: 4 });
      if ((k + i) % 3 === 0 && i < tiers - 1) m.box('Cone', 'Cone', [q[0] - 0.05, q[0] + 0.05], [y - 0.3, y - 0.08], [q[2] - 0.05, q[2] + 0.05], { n: 5, x: [q[0] - 0.02, q[0] + 0.02], z: [q[2] - 0.02, q[2] + 0.02] });
    }
  }
  m.box('Top', 'Paint', [-0.15, 0.15], [7.1, 7.7], [-0.15, 0.15], { n: 6, x: [0, 0], z: [0, 0] });
  litter(m, rnd, 1.2, 10, ['Cone', 'LeafDry', 'Grass', 'Grass']);
  write('tree_spruce', 'Fichte', m, PAINT);
}

// Scots pine: tall slightly bent trunk, red-orange above, flat needle clumps on top.
function pine() {
  const m = model(), rnd = rng(7);
  roots(m, rnd, 0.22, 5, 0.3);
  const pts = [[0, 0, 0], [0.12, 2.2, 0.04], [0.2, 4.2, 0.0], [0.1, 6.3, -0.1]];
  trunk(m, pts, 0.22, 0.09, (i) => (i === 0 ? 'Bark' : 'PineBark'), 7);
  const spots = [[0.1, 6.9, -0.1, 1.0, 0.8], [-0.85, 6.1, 0.3, 0.75, 0.6], [0.95, 6.3, -0.4, 0.7, 0.55], [0.3, 5.7, 0.8, 0.65, 0.5], [-0.3, 7.4, -0.5, 0.6, 0.5], [0.8, 7.3, 0.4, 0.55, 0.45]];
  const masses = [];
  spots.forEach(([x, y, z, r, h], i) => {
    masses.push(mass(m, rnd, [x, y, z], r, h, i % 3 === 1 ? 'Needle' : 'Paint', 7));
    m.beam('Branch', 'PineBark', [pts[2][0] * 0.5 + pts[3][0] * 0.5, y - 1.0, 0], [x * 0.8, y - h * 0.3, z * 0.8], 0.12, { w1: 0.06, n: 5 });
  });
  m.box('Crown.Core', 'Paint', [-0.9, 1.0], [6.0, 7.0], [-0.7, 0.8], { n: 7, x: [-0.6, 0.7], z: [-0.5, 0.5] });
  tufts(m, rnd, masses, 40, 0.3, ['Paint', 'Needle', 'NeedleDark']);
  for (let i = 0; i < 6; i++) {
    const p = onMass(rnd, masses[i % masses.length], -0.9);
    m.box('Cone', 'Cone', [p[0] - 0.05, p[0] + 0.05], [p[1] - 0.18, p[1]], [p[2] - 0.05, p[2] + 0.05], { n: 5, x: [p[0] - 0.02, p[0] + 0.02], z: [p[2] - 0.02, p[2] + 0.02] });
  }
  litter(m, rnd, 1.1, 10, ['LeafDry', 'Cone', 'Grass', 'Grass']);
  write('tree_pine', 'Kiefer', m, PAINT);
}

// Oak: thick trunk with root flare, branches, a broad crown of leaf masses.
function oak() {
  const m = model(), rnd = rng(13);
  roots(m, rnd, 0.35, 6, 0.45, 'Bark');
  const oakTrunk = [[0, 0, 0], [0.05, 1.4, 0], [0, 2.5, 0.05]];
  trunk(m, oakTrunk, 0.36, 0.26, 'Bark', 8);
  m.box('Knot', 'Soot', [0.28, 0.34], [1.1, 1.28], [-0.07, 0.07], { r: 0.3 });
  const branchTo = [[-1.1, 3.9, 0.4], [1.2, 4.0, -0.3], [0.2, 4.4, -1.0], [0.1, 4.2, 1.1]];
  for (const b of branchTo) m.beam('Branch', 'Bark', [0, 2.4, 0], b, 0.28, { w1: 0.12, n: 6 });
  const masses = [mass(m, rnd, [0, 4.5, 0], 1.45, 2.6, 'Paint', 8)];
  m.box('Crown.Under', 'LeafDark', [-1.3, 1.3], [3.3, 4.1], [-1.2, 1.2], { n: 8, x: [-1.5, 1.5], z: [-1.4, 1.4] });
  for (const [x, y, z, r] of [[-1.15, 4.0, 0.5, 0.75], [1.2, 4.1, -0.4, 0.8], [0.3, 4.3, 1.2, 0.72], [-0.2, 4.2, -1.2, 0.72], [0.6, 5.5, 0.4, 0.7], [-0.6, 5.4, -0.3, 0.7], [1.3, 4.9, 0.7, 0.55], [-1.3, 4.8, -0.8, 0.55]]) {
    masses.push(mass(m, rnd, [x, y, z], r, r * 1.5, 'Paint', 7));
  }
  clumps(m, rnd, masses.slice(1), 36, 0.16, ['Paint', 'LeafLight', 'LeafDark']);
  litter(m, rnd, 1.5, 12, ['LeafDry', 'Grass', 'Grass', 'Moss']);
  write('tree_oak', 'Eiche', m, PAINT);
}

/**
 * Leaf cards for birches: returns cards(at, out) - hangs a long twig as a flat
 * plane from `at`, down and a little towards `out`. The game paints twig and
 * leaves on it ("LeafCard", see the shader), like a weeping birch.
 */
function leafCards(m, rnd, [minLen, maxLen] = [1.0, 1.5]) {
  let count = 0;
  return (at, out) => {
    const len = minLen + rnd() * (maxLen - minLen), w = 0.42 + rnd() * 0.1;
    // Hanging down and a little outwards, turned a bit at random.
    const o = Math.hypot(out[0], out[2]) || 1;
    const turn = (rnd() - 0.5) * 0.8;
    const ox = (out[0] / o) * Math.cos(turn) - (out[2] / o) * Math.sin(turn);
    const oz = (out[0] / o) * Math.sin(turn) + (out[2] / o) * Math.cos(turn);
    const down = [ox * 0.35, -1, oz * 0.35];
    const dl = Math.hypot(...down);
    const a = down.map((v) => v / dl);
    const bw = [-oz, 0, ox];
    const corner = (s, t) => at.map((v, j) => v + bw[j] * s * w / 2 + a[j] * t * len);
    const quad = [corner(-1, 0), corner(1, 0), corner(1, 1), corner(-1, 1)];
    // Thin slab: the same quad a few millimetres apart.
    const nrm = [a[1] * bw[2] - a[2] * bw[1], a[2] * bw[0] - a[0] * bw[2], a[0] * bw[1] - a[1] * bw[0]];
    const top = quad.map((p) => p.map((v, j) => v + nrm[j] * 0.004));
    m.emit(`Leaves.Card.${count++}`, 'LeafCard', quad, top);
  };
}

/**
 * Branch cards for birches: returns card(origin, angle, scale) - a whole
 * branch with its twigs and leaves as one upright plane from the stem
 * outwards ("BranchCard"): the game paints branch, hanging twigs and small
 * leaves on it (see the shader). 2 m out, 2.2 m down at scale 1.
 */
function branchCards(m) {
  let count = 0;
  return (origin, ang, scale = 1) => {
    const W = 2.0 * scale, H = 2.2 * scale, top = 0.32 * scale;
    const out = [Math.cos(ang), 0, Math.sin(ang)];
    const at = (u, v) => [origin[0] + out[0] * u, origin[1] + top - v, origin[2] + out[2] * u];
    const quad = [at(0, 0), at(W, 0), at(W, H), at(0, H)];
    const nrm = [-out[2], 0, out[0]];
    const back = quad.map((p) => p.map((v, j) => v + nrm[j] * 0.004));
    m.emit(`Leaves.Branch.${count++}`, 'BranchCard', quad, back);
  };
}

// Birch: two slender white trunks with black marks, branches with long hanging
// twigs - leaf cards the game paints the leaves on.
function birch() {
  const m = model(), rnd = rng(19);
  const stems = [[[0, 0, 0], [0.15, 2.5, 0.05], [0.35, 4.8, 0.1], [0.4, 6.6, 0.1]], [[0.05, 0, 0.05], [-0.2, 2.2, -0.05], [-0.45, 4.2, -0.1], [-0.55, 5.8, -0.15]]];
  stems.forEach((pts, s) => {
    trunk(m, pts, s ? 0.11 : 0.14, 0.05, 'Birch', 6);
    // Black marks round the white bark.
    for (let i = 0; i < 12; i++) {
      const f = 0.12 + (i / 12) * 0.8;
      const seg = Math.min(2, Math.floor(f * 3)), g = f * 3 - seg;
      const p = pts[seg].map((v, j) => v + (pts[seg + 1][j] - v) * g);
      const r = (s ? 0.11 : 0.14) * (1 - f * 0.6) + 0.008;
      const a = rnd() * Math.PI * 2;
      m.box('Bark.Mark', 'BirchMark', [p[0] + Math.cos(a) * r * 0.6 - 0.04, p[0] + Math.cos(a) * r * 0.6 + 0.04], [p[1], p[1] + 0.04 + rnd() * 0.04], [p[2] + Math.sin(a) * r * 0.6 - 0.04, p[2] + Math.sin(a) * r * 0.6 + 0.04]);
    }
  });
  // Each branch with its hanging twigs and leaves is one plane (BranchCard).
  // They spiral up each stem at the golden angle from 40 % of its height to
  // the top, longest in the middle of the crown; short ones close to the
  // stems fill it, so it is full and not hollow.
  const branch = branchCards(m);
  stems.forEach((pts, s) => {
    const at = (f) => {
      const seg = Math.min(2, Math.floor(f * 3)), g = f * 3 - seg;
      return pts[seg].map((v, j) => v + (pts[seg + 1][j] - v) * g);
    };
    const count = 12;
    for (let i = 0; i < count; i++) {
      const f = 0.4 + (i / count) * 0.58;
      const size = 0.4 + Math.sin(Math.PI * (i + 0.5) / count) * 0.45 + rnd() * 0.1;
      branch(at(f), i * 2.4 + s * 1.2 + rnd() * 0.4, size);
    }
    for (let k = 0; k < 5; k++) branch(at(0.5 + k * 0.1), k * 2.1 + s, 0.38);
    const top = pts[pts.length - 1];
    for (let k = 0; k < 3; k++) branch(top, (k / 3) * Math.PI * 2 + rnd(), 0.42);
  });
  litter(m, rnd, 1.0, 10, ['Grass', 'Grass', 'LeafDry']);
  write('tree_birch', 'Birke', m, PAINT);
}

// Weeping birch: one tall white stem, a full egg-shaped crown from half its
// height up, many branches arching out with long hanging twigs.
function birch2() {
  const m = model(), rnd = rng(23);
  const pts = [[0, 0, 0], [0.08, 2.6, 0.03], [0.02, 5.2, -0.04], [0.1, 7.6, 0.02]];
  trunk(m, pts, 0.17, 0.05, 'Birch', 6);
  for (let i = 0; i < 16; i++) {
    const f = 0.1 + (i / 16) * 0.55;
    const seg = Math.min(2, Math.floor(f * 3)), g = f * 3 - seg;
    const p = pts[seg].map((v, j) => v + (pts[seg + 1][j] - v) * g);
    const r = 0.17 * (1 - f * 0.6) + 0.008;
    const a = rnd() * Math.PI * 2;
    m.box('Bark.Mark', 'BirchMark', [p[0] + Math.cos(a) * r * 0.6 - 0.05, p[0] + Math.cos(a) * r * 0.6 + 0.05], [p[1], p[1] + 0.04 + rnd() * 0.05], [p[2] + Math.sin(a) * r * 0.6 - 0.05, p[2] + Math.sin(a) * r * 0.6 + 0.05]);
  }
  // Branches spiral up the stem, each with its twigs and leaves one plane
  // (BranchCard): short at the bottom and top, longest in the middle - the
  // egg shape.
  const branch = branchCards(m);
  const branches = 28;
  for (let i = 0; i < branches; i++) {
    const f = 0.38 + (i / branches) * 0.6;
    const seg = Math.min(2, Math.floor(f * 3)), g = f * 3 - seg;
    const from = pts[seg].map((v, j) => v + (pts[seg + 1][j] - v) * g);
    const reach = 0.6 + Math.sin(Math.PI * (i + 0.5) / branches) * 1.6 + rnd() * 0.4;
    branch(from, i * 2.4 + rnd() * 0.5, 0.45 + reach * 0.3);
  }
  // Short ones inside the crown - so it is full, not hollow.
  for (let k = 0; k < 10; k++) {
    const f = 0.45 + (k / 10) * 0.45;
    const seg = Math.min(2, Math.floor(f * 3)), g = f * 3 - seg;
    branch(pts[seg].map((v, j) => v + (pts[seg + 1][j] - v) * g), k * 2.1, 0.45);
  }
  const top = pts[pts.length - 1];
  for (let k = 0; k < 4; k++) branch(top, (k / 4) * Math.PI * 2 + rnd(), 0.5);
  litter(m, rnd, 1.0, 10, ['Grass', 'Grass', 'LeafDry']);
  write('tree_birch_2', 'Hängebirke', m, PAINT);
}

// Weeping birch with tiers: a strong white stem forking into a few limbs;
// from them arch side branches out and down, and long curtains of twigs hang
// from each arch - dense tiers with gaps between.
function birch3() {
  const m = model(), rnd = rng(31);
  const fork = [0.1, 4.2, 0.05];
  trunk(m, [[0, 0, 0], [0.12, 2.2, 0.03], fork], 0.22, 0.13, 'Birch', 7);
  for (let i = 0; i < 14; i++) {
    const y = 0.4 + (i / 14) * 3.6;
    const a = rnd() * Math.PI * 2;
    const r = 0.22 - (y / 4.2) * 0.08 + 0.01;
    m.box('Bark.Mark', 'BirchMark', [0.1 * y / 4.2 + Math.cos(a) * r * 0.6 - 0.06, 0.1 * y / 4.2 + Math.cos(a) * r * 0.6 + 0.06], [y, y + 0.05 + rnd() * 0.06], [Math.sin(a) * r * 0.6 - 0.06, Math.sin(a) * r * 0.6 + 0.06]);
  }
  // Limbs from the fork, up and outwards, stay real; the side branches with
  // their curtains of twigs are planes (BranchCard), in tiers along the limbs.
  const branch = branchCards(m);
  const limbs = 4;
  for (let l = 0; l < limbs; l++) {
    const ang = (l / limbs) * Math.PI * 2 + 0.4;
    const lean = 0.7 + rnd() * 0.3;
    const len = 3.0 + rnd() * 1.4;
    const tip = [fork[0] + Math.cos(ang) * len * lean, fork[1] + len, fork[2] + Math.sin(ang) * len * lean];
    m.beam('Branch', 'Birch', fork, tip, 0.18, { w1: 0.05, n: 6 });
    for (let k = 0; k < 6; k++) {
      const t = 0.2 + (k / 6) * 0.8;
      const from = fork.map((v, j) => v + (tip[j] - v) * t);
      branch(from, ang + (rnd() - 0.5) * 1.8, 1.0 + rnd() * 0.3 - t * 0.3);
    }
    // Short ones along the limb and at its tip - it disappears in the foliage.
    for (let c = 0; c < 4; c++) {
      const t = 0.35 + (c / 4) * 0.65;
      branch(fork.map((v, j) => v + (tip[j] - v) * t), ang + (c % 2 ? 1.6 : -1.6) + (rnd() - 0.5), 0.55);
    }
    branch(tip, ang, 0.6);
  }
  litter(m, rnd, 1.1, 10, ['Grass', 'Grass', 'LeafDry']);
  write('tree_birch_3', 'Trauerbirke', m, PAINT);
}

// Poplar: tall, narrow column of leaves on a short trunk.
function poplar() {
  const m = model(), rnd = rng(29);
  roots(m, rnd, 0.18, 4, 0.25);
  trunk(m, [[0, 0, 0], [0, 2.0, 0]], 0.18, 0.13, 'Bark', 6);
  const core = [[1.3, 0.5], [2.6, 0.78], [5.2, 0.72], [7.6, 0.4], [9.0, 0.05]];
  for (let i = 0; i + 1 < core.length; i++) {
    const [y0, r0] = core[i], [y1, r1] = core[i + 1];
    m.box('Crown.Core', 'Paint', [-r0, r0], [y0, y1], [-r0, r0], { n: 8, rot: i * 0.3, x: [-r1, r1], z: [-r1, r1] });
  }
  const masses = [];
  for (let i = 0; i < 9; i++) {
    const y = 2.0 + i * 0.72, a = i * 2.4;
    const R = 0.62 - Math.abs(i - 3) * 0.06;
    masses.push(mass(m, rnd, [Math.cos(a) * R * 0.85, y, Math.sin(a) * R * 0.85], 0.38, 0.85, i % 3 === 0 ? 'LeafDark' : 'Paint', 6));
  }
  tufts(m, rnd, masses, 40, 0.22, ['Paint', 'LeafLight', 'LeafDark'], -0.4);
  litter(m, rnd, 0.8, 8, ['Grass', 'Grass', 'LeafDry']);
  write('tree_poplar', 'Pappel', m, PAINT);
}

// Maple: round, dense crown on a dark trunk, lighter leaves on top.
function maple() {
  const m = model(), rnd = rng(41);
  roots(m, rnd, 0.28, 5, 0.35);
  const mapleTrunk = [[0, 0, 0], [-0.05, 1.6, 0.05], [0.05, 2.6, 0]];
  trunk(m, mapleTrunk, 0.28, 0.2, 'BarkDark', 7);
  for (const b of [[-1.0, 3.6, 0.3], [1.0, 3.8, -0.2], [0.1, 4.2, 0.9], [0, 4.0, -0.9]]) m.beam('Branch', 'BarkDark', [0, 2.5, 0], b, 0.22, { w1: 0.1, n: 6 });
  const masses = [mass(m, rnd, [0, 4.3, 0], 1.35, 2.5, 'Paint', 8)];
  m.box('Crown.Under', 'LeafDark', [-1.2, 1.2], [3.2, 3.9], [-1.1, 1.1], { n: 8, x: [-1.4, 1.4], z: [-1.3, 1.3] });
  for (const [x, y, z, r, mtl] of [[-1.05, 3.9, 0.4, 0.72, 'LeafDark'], [1.1, 4.0, -0.3, 0.75, 'Paint'], [0.2, 4.2, 1.1, 0.7, 'LeafLight'], [-0.2, 4.1, -1.1, 0.7, 'Paint'], [0.5, 5.3, 0.3, 0.68, 'LeafLight'], [-0.5, 5.2, -0.3, 0.66, 'Paint']]) {
    masses.push(mass(m, rnd, [x, y, z], r, r * 1.5, mtl, 7));
  }
  clumps(m, rnd, masses.slice(1), 34, 0.16, ['Paint', 'LeafLight', 'LeafDark']);
  litter(m, rnd, 1.6, 12, ['LeafDry', 'Grass', 'Grass', 'Moss']);
  write('tree_maple', 'Ahorn', m, PAINT);
}

/** Acorns lying round the foot - close-up detail. */
function acorns(m, rnd, radius, count) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, d = radius * (0.5 + rnd() * 0.6);
    const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
    m.box('Acorn', 'Acorn', [x - 0.05, x + 0.05], [0, 0.1], [z - 0.05, z + 0.05], { n: 6, x: [x - 0.03, x + 0.03], z: [z - 0.03, z + 0.03] });
    m.box('Acorn.Cap', 'AcornCap', [x - 0.055, x + 0.055], [0.07, 0.11], [z - 0.055, z + 0.055], { n: 6 });
  }
}

// Old oak: massive gnarled trunk with burls and a hollow, heavy roots, wide
// bent branches under a broad crown. Drawn in metres at full size.
function oldOak() {
  const m = model(), rnd = rng(61);
  roots(m, rnd, 0.9, 7, 1.3, 'Bark');
  const top = [0.1, 4.6, 0.05];
  trunk(m, [[0, 0, 0], [0.25, 2.4, 0.1], top], 1.0, 0.72, 'Bark', 9);
  for (const [a, y] of [[0.8, 1.6], [2.9, 2.8], [4.6, 1.1]]) {
    const r = 0.95;
    m.box('Burl', 'Bark', [Math.cos(a) * r - 0.3, Math.cos(a) * r + 0.3], [y - 0.3, y + 0.3], [Math.sin(a) * r - 0.3, Math.sin(a) * r + 0.3], { n: 7, r: 0.3 });
  }
  m.box('Hollow', 'Soot', [-0.35, 0.35], [0.9, 2.0], [0.88, 1.02], { n: 8, x: [-0.22, 0.22] });
  m.box('Hollow.Rim', 'BarkDark', [-0.45, 0.45], [0.8, 2.1], [0.84, 0.94], { n: 8, x: [-0.3, 0.3] });
  // Five main branches, each bent in two, reaching out wide.
  const ends = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3 + rnd() * 0.4;
    const mid = [Math.cos(a) * 2.4, 6.0 + rnd() * 0.8, Math.sin(a) * 2.4];
    const end = [Math.cos(a + 0.25) * 3.6, 7.8 + rnd() * 1.0, Math.sin(a + 0.25) * 3.6];
    m.beam('Branch', 'Bark', top, mid, 0.75, { w1: 0.5, n: 6 });
    m.beam('Branch', 'Bark', mid, end, 0.5, { w1: 0.25, n: 6 });
    ends.push(end);
  }
  const masses = [mass(m, rnd, [0, 10.5, 0], 3.2, 6.0, 'Paint', 9)];
  m.box('Crown.Under', 'LeafDark', [-3.6, 3.6], [7.4, 8.6], [-3.4, 3.4], { n: 9, x: [-4.0, 4.0], z: [-3.8, 3.8] });
  for (const e of ends) masses.push(mass(m, rnd, [e[0], e[1] + 1.2, e[2]], 1.9, 2.9, 'Paint', 7));
  for (const [x, z] of [[1.6, 1.8], [-1.8, -1.4], [-0.4, 2.2], [2.0, -1.6]]) masses.push(mass(m, rnd, [x, 12.8, z], 1.5, 2.2, 'Paint', 7));
  clumps(m, rnd, masses.slice(1), 44, 0.45, ['Paint', 'LeafLight', 'LeafDark']);
  litter(m, rnd, 3.5, 14, ['LeafDry', 'Grass', 'Grass', 'Moss']);
  acorns(m, rnd, 3.0, 12);
  write('tree_oak_old', 'Alte Eiche', m, PAINT);
}

// Young oak: slim trunk, a few thin branches, small round crown.
function youngOak() {
  const m = model(), rnd = rng(67);
  roots(m, rnd, 0.16, 4, 0.25);
  const top = [0.05, 4.4, 0];
  trunk(m, [[0, 0, 0], [-0.08, 2.2, 0.05], top], 0.17, 0.1, 'Bark', 6);
  for (const b of [[-0.9, 5.6, 0.3], [0.9, 5.8, -0.2], [0.1, 6.2, 0.9]]) m.beam('Branch', 'Bark', [0, 3.8, 0], b, 0.1, { w1: 0.05, n: 5 });
  const masses = [mass(m, rnd, [0, 6.6, 0], 1.75, 3.6, 'Paint', 8)];
  for (const [x, y, z, r] of [[-1.2, 6.0, 0.4, 0.8], [1.2, 6.2, -0.3, 0.85], [0.2, 7.9, 0.3, 0.8], [0.3, 6.0, -1.2, 0.75]]) {
    masses.push(mass(m, rnd, [x, y, z], r, r * 1.5, 'Paint', 6));
  }
  clumps(m, rnd, masses.slice(1), 24, 0.22, ['Paint', 'LeafLight', 'LeafDark']);
  litter(m, rnd, 1.2, 8, ['Grass', 'Grass', 'LeafDry']);
  write('tree_oak_young', 'Junge Eiche', m, PAINT);
}

/**
 * Builds a tree twice: first to measure it, then with the stump height set
 * so that it is STUMP_HEIGHT metres after stretching to the tree's real size.
 * The random streams are seeded per tree, so both runs are the same tree.
 */
function build(fn, file) {
  measuring = true;
  STUMP = 0.45;
  fn();
  measuring = false;
  STUMP = STUMP_HEIGHT / (SIZE[file][0] / measured);
  fn();
}

build(spruce, 'tree_spruce');
build(pine, 'tree_pine');
build(oak, 'tree_oak');
build(birch, 'tree_birch');
build(birch2, 'tree_birch_2');
build(birch3, 'tree_birch_3');
build(poplar, 'tree_poplar');
build(maple, 'tree_maple');
build(oldOak, 'tree_oak_old');
build(youngOak, 'tree_oak_young');
