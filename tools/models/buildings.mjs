// Generates the building models in src/models. Scale: 1 tile = 5 m, a
// villager is 1.75 m, doors are 2.1 m - each building is as wide as its
// `size` in buildings.ts times 5 m. Usage: node tools/models/buildings.mjs [outDir] (default src/models)
import { model, slope, hipRoof, barrel, crate, log, lantern, write } from './lib.mjs';

const dir = process.argv[2] ?? new URL('../../src/models', import.meta.url).pathname;
const header = (file, what, extra = '') => `# ${file}.obj - ${what} fuer procedurally-generated-map
# Einheiten: Meter (1 Tile = 5 m, Tueren 2.1 m, ein Dorfbewohner 1.75 m), Y oben,
# Vorderseite nach +Z - so wie Blender ein Modell exportiert, das in der
# Vorderansicht zum Betrachter schaut.
${extra}`;

/** Boxes on the outside of a wall: u runs along the wall, w outward from it. */
function walls(m, W, D) {
  return (face, name, mtl, [u0, u1], y, [w0, w1], o = {}) => {
    if (face === 'front') m.box(name, mtl, [u0, u1], y, [D + w0, D + w1], o);
    if (face === 'back') m.box(name, mtl, [-u1, -u0], y, [-D - w1, -D - w0], o);
    if (face === 'right') m.box(name, mtl, [W + w0, W + w1], y, [-u1, -u0], o);
    if (face === 'left') m.box(name, mtl, [-W - w1, -W - w0], y, [u0, u1], o);
  };
}

/** Window with frame, cross bars, sill and optional open shutters and flower box. */
function windowOn(wall, face, cu, [y0, y1], w, o = {}) {
  const h = w / 2;
  wall(face, 'Window.Glass', 'Glass', [cu - h, cu + h], [y0, y1], [0, 0.02]);
  wall(face, 'Window.Frame', o.frame ?? 'Timber', [cu - h - 0.07, cu - h], [y0, y1], [0, 0.07]);
  wall(face, 'Window.Frame', o.frame ?? 'Timber', [cu + h, cu + h + 0.07], [y0, y1], [0, 0.07]);
  wall(face, 'Window.Frame', o.frame ?? 'Timber', [cu - h - 0.07, cu + h + 0.07], [y1, y1 + 0.08], [0, 0.08]);
  wall(face, 'Window.Bar', o.frame ?? 'Timber', [cu - 0.02, cu + 0.02], [y0, y1], [0.02, 0.05]);
  wall(face, 'Window.Bar', o.frame ?? 'Timber', [cu - h, cu + h], [(y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02], [0.02, 0.05]);
  wall(face, 'Window.Sill', o.sill ?? 'Wood', [cu - h - 0.1, cu + h + 0.1], [y0 - 0.07, y0], [0, 0.14]);
  if (o.shutters) {
    for (const s of [-1, 1]) {
      const a = s < 0 ? [cu - h - 0.07 - h, cu - h - 0.07] : [cu + h + 0.07, cu + h + 0.07 + h];
      wall(face, 'Window.Shutter', 'Shutter', a, [y0, y1], [0, 0.04]);
      wall(face, 'Window.Shutter.Seam', 'Timber', [(a[0] + a[1]) / 2 - 0.01, (a[0] + a[1]) / 2 + 0.01], [y0 + 0.03, y1 - 0.03], [0.04, 0.05]);
    }
  }
  if (o.flowers) {
    wall(face, 'Window.Box', 'Wood', [cu - h - 0.05, cu + h + 0.05], [y0 - 0.19, y0 - 0.07], [0.02, 0.2]);
    for (let i = 0; i < 4; i++) {
      const u = cu - h + 0.05 + (i * (w - 0.1)) / 3;
      wall(face, 'Window.Leaf', 'Leaf', [u - 0.05, u + 0.05], [y0 - 0.07, y0 + 0.02], [0.06, 0.17], { r: 0.3 });
      wall(face, 'Window.Flower', 'Flower', [u - 0.03, u + 0.03], [y0 + 0.0, y0 + 0.06], [0.09, 0.15], { r: 0.3 });
    }
  }
}

/** Plank door with frame, seams, iron hinges and a ring handle. */
function doorOn(wall, face, cu, y0, w, h, o = {}) {
  const hw = w / 2;
  wall(face, 'Door', 'Wood', [cu - hw, cu + hw], [y0, y0 + h], [0, 0.06]);
  for (let i = 1; i < 4; i++) {
    const u = cu - hw + (i * w) / 4;
    wall(face, 'Door.Seam', 'WoodDark', [u - 0.012, u + 0.012], [y0 + 0.04, y0 + h - 0.04], [0.06, 0.068]);
  }
  for (const y of [y0 + 0.35, y0 + h - 0.45]) wall(face, 'Door.Hinge', 'Iron', [cu - hw + 0.03, cu + hw * 0.4], [y, y + 0.06], [0.06, 0.075]);
  wall(face, 'Door.Handle', 'Iron', [cu + hw * 0.6, cu + hw * 0.6 + 0.07], [y0 + h * 0.47, y0 + h * 0.47 + 0.09], [0.06, 0.1], { r: 0.3 });
  const f = o.frame ?? 'Timber';
  wall(face, 'Door.Frame', f, [cu - hw - 0.13, cu - hw], [y0, y0 + h + 0.15], [0, 0.09]);
  wall(face, 'Door.Frame', f, [cu + hw, cu + hw + 0.13], [y0, y0 + h + 0.15], [0, 0.09]);
  wall(face, 'Door.Frame', f, [cu - hw - 0.13, cu + hw + 0.13], [y0 + h, y0 + h + 0.15], [0, 0.1]);
}

// --- House: two-storey timber-framed cottage like the town center - grey
// plaster, jettied upper floor over a band in the player's colour, shingle
// roof, and an open lean-to with firewood on one side. 4 m wide (size 0.8).
/**
 * One of four houses: `storeys` 1 or 2, `stone` builds the ground floor from
 * rubble stone instead of plaster, `mirror` flips it left-right and `turn`
 * rotates it by quarter turns (only halves keep the width the game scales
 * buildings by) - door, shed and chimney end up elsewhere.
 */
function house({ file, storeys = 2, stone = false, mirror = false, turn = 0 }) {
  const m = model();
  const { box, beam } = m;
  const two = storeys === 2;
  const W = 1.45, D = 1.25;     // half size of the ground floor
  const P = 0.35;               // stone plinth
  const G = 2.2;                // top of the ground floor
  const J = 0.12;               // jetty: the upper floor sticks out this far
  const E = two ? 3.45 : G + 0.26, R = two ? 5.2 : 4.35;      // eaves and ridge
  const WU = W + J, DU = D + J;
  const wall = walls(m, W, D);
  const upper = walls(m, WU, DU);

  box('Ground', 'Dirt', [-2.0, 2.05], [0, 0.03], [-1.75, 1.75], { r: 0.25 });
  box('Plinth', 'Stone', [-W - 0.08, W + 0.08], [0, P], [-D - 0.08, D + 0.08]);
  for (let i = 0; i < 6; i++) {
    const x = -W + 0.2 + i * 0.52;
    box('Plinth.Stone', 'StoneDark', [x - 0.2, x + 0.18], [0.05 + (i % 2) * 0.05, 0.3 - (i % 3) * 0.03], [D + 0.07, D + 0.11]);
  }

  // Ground floor: plaster in a timber frame - or rubble stone with lighter
  // corner stones.
  box('Walls', stone ? 'Stone' : 'PlasterGrey', [-W, W], [P, G], [-D, D]);
  for (const face of ['front', 'back', 'left', 'right']) {
    const half = face === 'front' || face === 'back' ? W : D;
    if (stone) {
      for (let row = 0; row < 6; row++) {
        for (let i = 0; i < 5; i++) {
          const u = -half + 0.1 + i * 0.6 + (row % 2) * 0.3;
          if (u + 0.45 > half) continue;
          wall(face, 'Wall.Stone', (row + i) % 3 ? 'StoneDark' : 'StoneLight', [u, u + 0.45], [P + 0.05 + row * 0.3, P + 0.3 + row * 0.3], [0, 0.03]);
        }
      }
      for (const u of [-half, half - 0.3]) {
        for (let i = 0; i < 6; i++) wall(face, 'Wall.Quoin', 'StoneLight', [u + (i % 2) * 0.08, u + 0.3], [P + i * 0.3, P + i * 0.3 + 0.27], [0, 0.05]);
      }
    } else {
      for (const u of [-half, 0, half]) wall(face, 'Timber.Post', 'Timber', [u - 0.08, u + 0.08], [P, G], [0, 0.06]);
      wall(face, 'Timber.Sill', 'Timber', [-half, half], [P, P + 0.12], [0, 0.06]);
    }
  }
  // Band in the player's colour under the jettied upper floor.
  box('Band', 'Paint', [-WU - 0.02, WU + 0.02], [G, G + 0.2], [-DU - 0.02, DU + 0.02]);
  box('Band.Edge', 'Timber', [-WU - 0.04, WU + 0.04], [G + 0.2, G + 0.26], [-DU - 0.04, DU + 0.04]);
  for (const x of [-W + 0.3, 0, W - 0.3]) {
    // Joist ends under the jetty.
    box('Joist', 'Timber', [x - 0.07, x + 0.07], [G - 0.1, G], [D, DU + 0.02]);
    box('Joist', 'Timber', [x - 0.07, x + 0.07], [G - 0.1, G], [-DU - 0.02, -D]);
  }

  // Upper floor: plaster, posts, a rail and braces like the town center.
  const U0 = G + 0.26;
  if (two) {
    box('Upper', 'PlasterGrey', [-WU, WU], [U0, E], [-DU, DU]);
    for (const face of ['front', 'back', 'left', 'right']) {
      const half = face === 'front' || face === 'back' ? WU : DU;
      for (const u of [-half, -half / 3, half / 3, half]) upper(face, 'Timber.Post', 'Timber', [u - 0.07, u + 0.07], [U0, E], [0, 0.06]);
      upper(face, 'Timber.Plate', 'Timber', [-half - 0.04, half + 0.04], [E - 0.14, E], [0, 0.07]);
    }
    for (const z of [DU + 0.03, -DU - 0.03]) {
      for (const t of [-1, 1]) beam('Timber.Brace', 'Timber', [t * (WU - 0.08), U0, z], [t * WU / 3, E - 0.14, z], 0.1);
    }
  }

  // Windows with warm light and open shutters, the door with a step.
  const lit = (w, face, u, y0, y1, width) => {
    const h = width / 2;
    w(face, 'Window.Light', 'WindowLit', [u - h, u + h], [y0, y1], [0, 0.03]);
    w(face, 'Window.Bar', 'Timber', [u - 0.02, u + 0.02], [y0, y1], [0.03, 0.06]);
    w(face, 'Window.Bar', 'Timber', [u - h, u + h], [(y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02], [0.03, 0.06]);
    w(face, 'Window.Sill', 'Timber', [u - h - 0.08, u + h + 0.08], [y0 - 0.07, y0], [0, 0.12]);
    w(face, 'Window.Lintel', 'Timber', [u - h - 0.07, u + h + 0.07], [y1, y1 + 0.07], [0, 0.08]);
    for (const s of [-1, 1]) {
      const a = s < 0 ? [u - h - 0.06 - h, u - h - 0.06] : [u + h + 0.06, u + h + 0.06 + h];
      w(face, 'Window.Shutter', 'Wood', a, [y0, y1], [0, 0.04]);
      for (const y of [y0 + 0.1, y1 - 0.14]) w(face, 'Window.Shutter.Band', 'Timber', a, [y, y + 0.04], [0.04, 0.055]);
    }
  };
  lit(wall, 'front', -0.85, 1.0, 1.6, 0.44);
  lit(wall, 'left', 0, 1.0, 1.6, 0.44);
  lit(wall, 'back', 0.5, 1.0, 1.6, 0.44);
  if (two) {
    lit(upper, 'front', -0.7, 2.75, 3.2, 0.42);
    lit(upper, 'front', 0.7, 2.75, 3.2, 0.42);
    lit(upper, 'left', 0, 2.75, 3.2, 0.42);
    lit(upper, 'right', 0, 2.75, 3.2, 0.42);
    lit(upper, 'back', -0.5, 2.75, 3.2, 0.42);
  } else {
    lit(wall, 'right', -0.4, 1.0, 1.6, 0.44);
  }
  // Flower box under the front window.
  wall('front', 'Window.Box', 'Wood', [-1.15, -0.55], [0.8, 0.92], [0.02, 0.2]);
  for (let i = 0; i < 4; i++) {
    const u = -1.08 + i * 0.15;
    wall('front', 'Window.Leaf', 'Ivy', [u - 0.06, u + 0.06], [0.92, 1.0], [0.05, 0.18], { r: 0.3 });
    wall('front', 'Window.Flower', 'Flower', [u - 0.03, u + 0.03], [0.98, 1.04], [0.09, 0.15], { r: 0.3 });
  }
  doorOn(wall, 'front', 0.55, P, 0.78, 1.75);
  box('Step', 'StoneLight', [0.05, 1.05], [0, P], [D + 0.02, D + 0.42], { r: 0.1 });
  lantern(m, 1.12, 1.9, D + 0.16);
  box('Lantern.Bracket', 'Iron', [1.1, 1.14], [2.08, 2.12], [D, D + 0.18]);
  // Shield in the player's colour above the door (on the gable of a
  // one-storey house).
  const sy = two ? 3.3 : E + 0.75;
  const sz = two ? DU + 0.05 : DU + 0.05;
  const sx = two ? 0 : -W - J - 0.08;
  if (two) {
    // Mittig zwischen den beiden oberen Fenstern, deren Läden bis u = ±0.22 reichen.
    m.extrude('Shield', 'Paint', 'z', [sz, sz + 0.05], [[-0.2, sy], [0.2, sy], [0.2, sy - 0.28], [0, sy - 0.55], [-0.2, sy - 0.28]]);
    beam('Shield.Stripe', 'Canvas', [-0.16, sy - 0.04, sz + 0.055], [0.16, sy - 0.36, sz + 0.055], 0.07);
  } else {
    m.extrude('Shield', 'Paint', 'x', [sx - 0.05, sx], [[-0.21, sy], [0.21, sy], [0.21, sy - 0.28], [0, sy - 0.58], [-0.21, sy - 0.28]]);
    beam('Shield.Stripe', 'Canvas', [sx - 0.055, sy - 0.04, -0.17], [sx - 0.055, sy - 0.38, 0.17], 0.07);
  }

  // Gable roof with shingles, ridge along x; plastered gables with a king post.
  const RX = WU + 0.3, RZ = DU + 0.42;
  for (const s of [1, -1]) slope(m, 'Roof', 'Shingle', 'x', [-RX, RX], [s * RZ, E - 0.1], [0, R], 0.12, 8);
  box('Roof.Ridge', 'ShingleDark', [-RX - 0.04, RX + 0.04], [R - 0.02, R + 0.15], [-0.12, 0.12], { axis: 'x', n: 6 });
  m.extrude('Gable', 'PlasterGrey', 'x', [-WU, WU], [[-DU, E], [DU, E], [0, R - 0.1]]);
  for (const s of [-1, 1]) {
    const x = s * (WU + 0.03);
    beam('Gable.KingPost', 'Timber', [x, E, 0], [x, R - 0.2, 0], 0.09);
    const collar = (E + R) / 2;
    beam('Gable.Collar', 'Timber', [x, collar, -0.75], [x, collar, 0.75], 0.09);
    for (const t of [-1, 1]) {
      beam('Gable.Brace', 'Timber', [x, E, t * (DU - 0.1)], [x, collar, t * 0.4], 0.08);
      beam('Gable.Barge', 'Timber', [s * (RX + 0.02), E - 0.06, t * (RZ - 0.04)], [s * (RX + 0.02), R + 0.1, 0], 0.12);
    }
    if (two) box('Gable.Window', 'WindowLit', [x - 0.02, x + 0.02], [4.45, 4.8], [-0.16, 0.16]);
  }
  // Chimney through the back of the roof.
  const CH = R + 0.55;
  box('Chimney', 'Stone', [-1.15, -0.72], [E - 0.2, CH], [-1.0, -0.57], { r: 0.06 });
  box('Chimney.Cap', 'StoneDark', [-1.22, -0.65], [CH, CH + 0.11], [-1.07, -0.5]);
  box('Chimney.Flue', 'Soot', [-1.05, -0.82], [CH + 0.11, CH + 0.12], [-0.9, -0.67]);

  // Open lean-to on the right with firewood, a chopping block and a barrel.
  const LX = W + 0.95;
  for (const z of [-D + 0.15, D - 0.15]) {
    box('Shed.Post', 'Timber', [LX - 0.09, LX + 0.09], [0, 1.9], [z - 0.09, z + 0.09]);
    beam('Shed.Brace', 'Timber', [LX, 1.45, z], [LX - 0.45, 1.88, z], 0.07);
  }
  box('Shed.Beam', 'Timber', [LX - 0.08, LX + 0.08], [1.85, 1.98], [-D - 0.1, D + 0.1]);
  slope(m, 'Shed.Roof', 'Shingle', 'z', [-D - 0.25, D + 0.25], [LX + 0.25, 1.9], [W, 2.35], 0.1, 3);
  for (let row = 0; row < 4; row++) {
    for (let c = 0; c < 5 - row; c++) {
      const z = -D + 0.3 + c * 0.24 + row * 0.12, y = 0.12 + row * 0.2;
      box('Firewood', 'Bark', [W + 0.12, W + 0.72], [y - 0.1, y + 0.1], [z - 0.1, z + 0.1], { axis: 'x', n: 7 });
      box('Firewood.End', 'LogEnd', [W + 0.72, W + 0.73], [y - 0.085, y + 0.085], [z - 0.085, z + 0.085], { axis: 'x', n: 7 });
    }
  }
  box('Block', 'Bark', [LX - 0.05, LX + 0.35], [0, 0.4], [D - 0.05, D + 0.35], { n: 9 });
  box('Block.Top', 'LogEnd', [LX - 0.03, LX + 0.33], [0.4, 0.41], [D - 0.03, D + 0.33], { n: 9 });
  beam('Axe.Handle', 'WoodLight', [LX + 0.13, 0.4, D + 0.15], [LX + 0.4, 0.8, D + 0.3], 0.04);
  box('Axe.Head', 'Iron', [LX + 0.05, LX + 0.2], [0.38, 0.5], [D + 0.12, D + 0.18], { x: [LX + 0.08, LX + 0.17] });
  barrel(m, -W - 0.3, D + 0.25, 0.75, 0.26);
  // Ivy up the front corner.
  for (let i = 0; i < 12; i++) {
    const a = i * 1.9, y = 0.1 + i * 0.17, s = 0.08 + (i % 3) * 0.02;
    const [x, z] = [-W - 0.04 + Math.cos(a) * 0.08, D + 0.04 + Math.sin(a) * 0.08];
    box('Ivy', i % 2 ? 'Ivy' : 'IvyDark', [x - s, x + s], [y, y + s * 1.4], [z - s, z + s], { r: 0.3 });
  }

  // Wo Dorfbewohner hineingehen: vor der Tür (unsichtbar, liest das Spiel aus).
  box('Entry', 'Soot', [0.52, 0.58], [0, 0.05], [D + 0.55, D + 0.6]);
  // Spiegeln und drehen: nur die Eckpunkte - Flächen haben keine Vorderseite,
  // die Beleuchtung rechnet mit der Flächennormale aus dem Bild.
  m.out = m.out.map((l) => {
    if (!l.startsWith('v ')) return l;
    let [x, y, z] = l.split(' ').slice(1).map(Number);
    if (mirror) x = -x;
    for (let i = 0; i < turn; i++) [x, z] = [z, -x];
    return `v ${+x.toFixed(3)} ${y} ${+z.toFixed(3)}`;
  });
  write(dir, file, header(file, 'Haus',
    '# Material Paint (Band und Wappen) bekommt die Gebaeudefarbe aus dem Spiel.\n# Das Objekt Entry markiert den Eingang und wird nicht gezeichnet.\n'), m, '0.200 0.350 0.750');
}

// --- Town center: timber-framed house on stilts with a cross-gabled shingle
// roof and four open lean-to canopies, one on each side - seen at the game's
// oblique angle the plan reads as an X, like the AoE2 town center. 10 m wide
// (size 2).
function townCenter() {
  const m = model();
  const { box, beam } = m;
  const C = 2.2;   // half width of the house
  const F = 1.5;   // floor of the upper storey (on stilts)
  const E = 4.3;   // eaves
  const R = 6.7;   // ridge
  const WING = 5.0; // outer end of the canopies

  // Quarter turns about the vertical axis - one canopy is built for +z and
  // turned for the other sides. k = 0: +z, 1: +x, 2: -z, 3: -x.
  const turn = (k, x, z) => [[x, z], [z, -x], [-x, -z], [-z, x]][k];
  const range = (a, b) => [Math.min(a, b), Math.max(a, b)];
  /** Axis-aligned box of the +z canopy, turned by k quarters. */
  const rbox = (k, name, mtl, [x0, x1], y, [z0, z1], o = {}) => {
    const [ax, az] = turn(k, x0, z0), [bx, bz] = turn(k, x1, z1);
    const opts = { ...o };
    if (o.x || o.z) {
      const [tx0, tz0] = turn(k, (o.x ?? [x0, x1])[0], (o.z ?? [z0, z1])[0]);
      const [tx1, tz1] = turn(k, (o.x ?? [x0, x1])[1], (o.z ?? [z0, z1])[1]);
      opts.x = range(tx0, tx1);
      opts.z = range(tz0, tz1);
    }
    box(name, mtl, range(ax, bx), y, range(az, bz), opts);
  };
  const rbeam = (k, name, mtl, p0, p1, w, o) => {
    const [ax, az] = turn(k, p0[0], p0[2]), [bx, bz] = turn(k, p1[0], p1[2]);
    beam(name, mtl, [ax, p0[1], az], [bx, p1[1], bz], w, o);
  };

  // Trampled ground under the whole building.
  box('Ground', 'Dirt', [-5, 5], [0, 0.03], [-5, 5], { r: 0.25 });

  // --- Stilts, floor and the band in the player's colour -------------------
  for (const x of [-C + 0.15, 0, C - 0.15]) {
    for (const z of [-C + 0.15, 0, C - 0.15]) {
      if (x === 0 && z === 0) continue;
      box('Stilt', 'Timber', [x - 0.14, x + 0.14], [0, F], [z - 0.14, z + 0.14]);
      box('Stilt.Foot', 'Stone', [x - 0.22, x + 0.22], [0, 0.18], [z - 0.22, z + 0.22], { r: 0.2 });
    }
  }
  box('Floor', 'Wood', [-C - 0.1, C + 0.1], [F - 0.12, F + 0.02], [-C - 0.1, C + 0.1]);
  box('Band', 'Paint', [-C - 0.16, C + 0.16], [F + 0.02, F + 0.26], [-C - 0.16, C + 0.16]);
  box('Band.Edge', 'Timber', [-C - 0.18, C + 0.18], [F + 0.26, F + 0.32], [-C - 0.18, C + 0.18]);

  // --- Upper storey: grey plaster in a timber frame ----------------------
  const U0 = F + 0.32;
  box('Walls', 'PlasterGrey', [-C, C], [U0, E], [-C, C]);
  const wall = walls(m, C, C);
  for (const face of ['front', 'back', 'left', 'right']) {
    for (const u of [-C, -0.75, 0.75, C]) {
      wall(face, 'Timber.Post', 'Timber', [u - 0.09, u + 0.09], [U0, E], [0, 0.06]);
    }
    wall(face, 'Timber.Rail', 'Timber', [-C, C], [2.85, 2.97], [0, 0.06]);
    wall(face, 'Timber.Plate', 'Timber', [-C - 0.05, C + 0.05], [E - 0.16, E], [0, 0.07]);
  }
  // Braces in the outer panels, like in the picture.
  for (const [z, sgn] of [[C + 0.03, 1], [-C - 0.03, -1]]) {
    for (const s of [-1, 1]) {
      beam('Timber.Brace', 'Timber', [s * (C - 0.1), U0, z], [s * 0.85, 2.85, z], 0.11);
      beam('Timber.Brace', 'Timber', [s * 0.85, 2.97, z], [s * (C - 0.1), E - 0.16, z], 0.11);
    }
    void sgn;
  }
  for (const x of [C + 0.03, -C - 0.03]) {
    for (const s of [-1, 1]) {
      beam('Timber.Brace', 'Timber', [x, U0, s * (C - 0.1)], [x, 2.85, s * 0.85], 0.11);
      beam('Timber.Brace', 'Timber', [x, 2.97, s * 0.85], [x, E - 0.16, s * (C - 0.1)], 0.11);
    }
  }
  // Windows with light behind them and open shutters; the door at the top
  // of the stairs on the front.
  const lit = (face, u, y0, y1, w) => {
    const h = w / 2;
    wall(face, 'Window.Light', 'WindowLit', [u - h, u + h], [y0, y1], [0, 0.03]);
    wall(face, 'Window.Bar', 'Timber', [u - 0.02, u + 0.02], [y0, y1], [0.03, 0.06]);
    wall(face, 'Window.Frame', 'Timber', [u - h - 0.07, u + h + 0.07], [y0 - 0.07, y0], [0, 0.12]);
    wall(face, 'Window.Frame', 'Timber', [u - h - 0.07, u + h + 0.07], [y1, y1 + 0.07], [0, 0.08]);
    for (const s of [-1, 1]) {
      const a = s < 0 ? [u - h - 0.07 - h, u - h - 0.07] : [u + h + 0.07, u + h + 0.07 + h];
      wall(face, 'Window.Shutter', 'Wood', a, [y0, y1], [0, 0.04]);
      for (const y of [y0 + 0.12, y1 - 0.16]) wall(face, 'Window.Shutter.Band', 'Timber', a, [y, y + 0.04], [0.04, 0.055]);
    }
  };
  lit('front', -0.95, 3.15, 3.95, 0.55);
  lit('left', 0, 3.15, 3.95, 0.6);
  lit('right', 0, 3.15, 3.95, 0.6);
  lit('back', 0, 3.15, 3.95, 0.6);
  lit('front', -0.95, 1.95, 2.6, 0.5);
  wall('front', 'Door', 'Wood', [0.45, 1.35], [U0, 2.75], [0, 0.05]);
  for (let i = 1; i < 4; i++) wall('front', 'Door.Seam', 'WoodDark', [0.45 + i * 0.225 - 0.01, 0.45 + i * 0.225 + 0.01], [U0 + 0.05, 2.7], [0.05, 0.06]);
  wall('front', 'Door.Frame', 'Timber', [0.33, 1.47], [2.75, 2.87], [0, 0.08]);
  // Shields in the player's colour with a white stripe, on the front and side.
  const shield = (face, u, y) => {
    const pts = [[-0.24, 0.3], [0.24, 0.3], [0.24, 0.02], [0, -0.3], [-0.24, 0.02]];
    const place = { front: (a, b, w) => [u + a, y + b, C + w], right: (a, b, w) => [C + w, y + b, -(u + a)] }[face];
    const [x0, , z0] = place(0, 0, 0.07), [x1, , z1] = place(0, 0, 0.12);
    const axis = face === 'front' ? 'z' : 'x';
    const span = axis === 'z' ? [z0, z1] : [x0, x1];
    m.extrude('Shield', 'Paint', axis, span, pts.map(([a, b]) => axis === 'z' ? [u + a, y + b] : [-(u + a), y + b]));
    beam('Shield.Stripe', 'Canvas', place(-0.2, 0.26, 0.125), place(0.2, -0.12, 0.125), 0.09);
    beam('Shield.Rim', 'Iron', place(-0.24, 0.3, 0.11), place(0.24, 0.3, 0.11), 0.04);
  };
  // Links neben den Fenstern (die mit Läden bis u = -1.57 reichen).
  shield('front', -1.86, 2.5);
  shield('right', 1.35, 3.55);

  // Stairs up to the door, with a handrail.
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const y = ((i + 1) / steps) * F;
    const z = C + 0.1 + (steps - 1 - i) * 0.3;
    box('Stairs.Step', 'Wood', [0.4, 1.4], [y - 0.07, y], [z, z + 0.32]);
  }
  for (const x of [0.36, 1.44]) {
    beam('Stairs.String', 'Timber', [x, 0, C + 2.25], [x, F, C + 0.1], 0.1);
    beam('Stairs.Rail', 'Timber', [x, 0.9, C + 2.25], [x, F + 0.9, C + 0.1], 0.07);
    box('Stairs.Post', 'Timber', [x - 0.05, x + 0.05], [0, 0.95], [C + 2.2, C + 2.3]);
  }

  // --- Cross-gabled shingle roof -----------------------------------------
  const RC = C + 0.55;
  for (const s of [1, -1]) {
    slope(m, 'Roof', 'Shingle', 'x', [-RC + 0.1, RC - 0.1], [s * RC, E - 0.12], [0, R], 0.13, 9);
    slope(m, 'Roof', 'Shingle', 'z', [-RC + 0.1, RC - 0.1], [s * RC, E - 0.12], [0, R], 0.13, 9);
  }
  box('Roof.Ridge', 'ShingleDark', [-RC + 0.05, RC - 0.05], [R - 0.02, R + 0.16], [-0.14, 0.14], { axis: 'x', n: 6 });
  box('Roof.Ridge', 'ShingleDark', [-0.14, 0.14], [R - 0.02, R + 0.16], [-RC + 0.05, RC - 0.05], { axis: 'z', n: 6 });
  m.extrude('Gable', 'PlasterGrey', 'x', [-C, C], [[-C, E], [C, E], [0, R - 0.1]]);
  m.extrude('Gable', 'PlasterGrey', 'z', [-C, C], [[-C, E], [C, E], [0, R - 0.1]]);
  for (const s of [-1, 1]) {
    // Gable framing and bargeboards on all four gables.
    beam('Gable.KingPost', 'Timber', [0, E, s * (C + 0.03)], [0, R - 0.2, s * (C + 0.03)], 0.1);
    beam('Gable.KingPost', 'Timber', [s * (C + 0.03), E, 0], [s * (C + 0.03), R - 0.2, 0], 0.1);
    beam('Gable.Collar', 'Timber', [-1.1, 5.5, s * (C + 0.03)], [1.1, 5.5, s * (C + 0.03)], 0.1);
    beam('Gable.Collar', 'Timber', [s * (C + 0.03), 5.5, -1.1], [s * (C + 0.03), 5.5, 1.1], 0.1);
    for (const t of [-1, 1]) {
      beam('Gable.Barge', 'Timber', [t * (RC - 0.05), E - 0.05, s * (RC - 0.08)], [0, R + 0.1, s * (RC - 0.08)], 0.14);
      beam('Gable.Barge', 'Timber', [s * (RC - 0.08), E - 0.05, t * (RC - 0.05)], [s * (RC - 0.08), R + 0.1, 0], 0.14);
    }
  }
  box('Gable.Window', 'WindowLit', [-0.22, 0.22], [4.75, 5.25], [C + 0.02, C + 0.05]);
  box('Gable.Window', 'WindowLit', [C + 0.02, C + 0.05], [4.75, 5.25], [-0.22, 0.22]);
  // Chimney through the back roof.
  box('Chimney', 'Stone', [-1.45, -0.9], [4.6, 7.4], [-1.6, -1.05], { r: 0.06 });
  box('Chimney.Cap', 'StoneDark', [-1.52, -0.83], [7.4, 7.52], [-1.67, -0.98]);
  box('Chimney.Flue', 'Soot', [-1.35, -1.0], [7.52, 7.53], [-1.5, -1.15]);
  // Flag on the crossing of the ridges (object Cloth waves in the game).
  box('Flag.Mast', 'Wood', [-0.045, 0.045], [R, R + 2.3], [-0.045, 0.045], { n: 6 });
  box('Flag.Knob', 'Gold', [-0.07, 0.07], [R + 2.3, R + 2.42], [-0.07, 0.07], { n: 6 });
  box('Cloth', 'Paint', [0.045, 1.35], [R + 1.45, R + 2.25], [-0.025, 0.025]);

  // --- Four open canopies, one per side ------------------------------------
  const W2 = 1.85; // half width of a canopy
  const EAVE = 2.35, RIDGE = 3.35;
  for (let k = 0; k < 4; k++) {
    // Posts at the outer end and against the house, with knee braces.
    for (const x of [-W2 + 0.2, W2 - 0.2]) {
      for (const z of [C + 0.2, WING - 0.25]) {
        rbox(k, 'Canopy.Post', 'Timber', [x - 0.12, x + 0.12], [0, EAVE], [z - 0.12, z + 0.12]);
      }
      rbox(k, 'Canopy.Beam', 'Timber', [x - 0.1, x + 0.1], [EAVE - 0.2, EAVE], [C, WING - 0.1]);
      rbeam(k, 'Canopy.Brace', 'Timber', [x, EAVE - 0.8, WING - 0.25], [x, EAVE - 0.2, WING - 0.85], 0.09);
    }
    rbox(k, 'Canopy.Beam', 'Timber', [-W2, W2], [EAVE - 0.22, EAVE], [WING - 0.36, WING - 0.14]);
    for (const s of [-1, 1]) rbeam(k, 'Canopy.Brace', 'Timber', [s * (W2 - 0.2), EAVE - 0.8, WING - 0.25], [s * (W2 - 0.8), EAVE - 0.22, WING - 0.25], 0.09);
    // Gable roof along the canopy, shingles like the house.
    const along = k % 2 === 0 ? 'z' : 'x';
    const sgn = k < 2 ? 1 : -1;
    const span = range(sgn * (C - 0.3), sgn * (WING + 0.15));
    for (const s of [1, -1]) {
      // In the plane across the roof axis the "u" coordinate is x for a
      // z-axis roof and z for an x-axis roof (see lib.slope); the roof is
      // symmetric, so turning only swaps the axis.
      slope(m, 'Canopy.Roof', 'Shingle', along, span, [s * (W2 + 0.3), EAVE - 0.05], [0, RIDGE], 0.12, 5);
    }
    rbox(k, 'Canopy.Ridge', 'ShingleDark', [-0.12, 0.12], [RIDGE - 0.02, RIDGE + 0.14], [C - 0.3, WING + 0.15], { axis: 'z', n: 6 });
    // Planked gable at the open end.
    const gable = [[-W2, EAVE], [W2, EAVE], [0, RIDGE - 0.1]].map(([u, y]) => [turn(k, u, 0), y]);
    const zEnd = WING - 0.05;
    const [gx, gz] = turn(k, 0, zEnd);
    if (along === 'z') m.extrude('Canopy.Gable', 'WoodLight', 'z', range(gz - 0.04, gz + 0.04), gable.map(([[u], y]) => [u, y]));
    else m.extrude('Canopy.Gable', 'WoodLight', 'x', range(gx - 0.04, gx + 0.04), gable.map(([[, v], y]) => [v, y]));
    // Ivy climbing the outer posts.
    for (const x of k % 2 ? [-W2 + 0.2] : [W2 - 0.2]) {
      for (let i = 0; i < 14; i++) {
        const y = 0.1 + i * 0.16;
        const a = i * 1.9;
        const [dx, dz] = [Math.cos(a) * 0.16, Math.sin(a) * 0.16];
        const s = 0.09 + (i % 3) * 0.025;
        rbox(k, 'Ivy', i % 2 ? 'Ivy' : 'IvyDark', [x + dx - s, x + dx + s], [y, y + s * 1.4], [WING - 0.25 + dz - s, WING - 0.25 + dz + s], { r: 0.3 });
      }
    }
  }

  // --- Things under the canopies and the house ------------------------------
  // Front: crates stacked by the stairs, a barrel, sacks.
  crate(m, [-1.55, -0.95], 0.03, [3.4, 4.0]);
  crate(m, [-1.5, -1.0], 0.63, [3.45, 3.95]);
  crate(m, [-0.9, -0.35], 0.03, [3.6, 4.15]);
  barrel(m, -1.3, 4.5, 0.8, 0.28);
  // Right: cart wheel leaning against a post, barrels.
  const wheel = (x, z) => {
    box('Wheel', 'Wood', [x - 0.05, x + 0.05], [0.05, 1.05], [z - 0.5, z + 0.5], { axis: 'x', n: 12 });
    box('Wheel.Hub', 'WoodDark', [x - 0.09, x + 0.09], [0.47, 0.63], [z - 0.08, z + 0.08], { axis: 'x', n: 8 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      beam('Wheel.Spoke', 'WoodDark', [x + 0.06, 0.55, z], [x + 0.06, 0.55 + Math.sin(a) * 0.44, z + Math.cos(a) * 0.44], 0.05);
    }
  };
  wheel(4.35, 1.2);
  barrel(m, 3.4, -1.1, 0.85, 0.3);
  barrel(m, 3.95, -0.6, 0.85, 0.3);
  // Back: a pile of firewood and a barrel.
  for (let row = 0; row < 3; row++) {
    for (let c = 0; c < 4 - row; c++) {
      const x = -1.2 + c * 0.3 + row * 0.15, y = 0.15 + row * 0.26;
      box('Firewood', 'Bark', [x - 0.13, x + 0.13], [y - 0.13, y + 0.13], [-4.4, -3.4], { axis: 'z', n: 7 });
      box('Firewood.End', 'LogEnd', [x - 0.11, x + 0.11], [y - 0.11, y + 0.11], [-3.4, -3.39], { axis: 'z', n: 7 });
    }
  }
  barrel(m, 1.2, -3.9, 0.85, 0.3);
  // Left: sacks of grain and a barrel.
  for (const [x, z, h] of [[-3.4, 1.0, 0.55], [-3.8, 1.3, 0.5], [-3.5, 1.6, 0.5], [-3.9, 0.8, 0.45]]) {
    box('Sack', 'Sack', [x - 0.22, x + 0.22], [0.03, h], [z - 0.2, z + 0.2], { r: 0.3, x: [x - 0.15, x + 0.15], z: [z - 0.13, z + 0.13] });
  }
  barrel(m, -4.1, -1.0, 0.85, 0.3);
  // Under the house: barrels and a crate between the stilts.
  barrel(m, 1.2, 0.9, 0.85, 0.32);
  barrel(m, -1.1, -0.9, 0.85, 0.32);
  crate(m, [-1.4, -0.8], 0.03, [0.5, 1.1]);
  // Plants at the foot of posts.
  for (const [x, z] of [[1.9, 4.9], [-4.9, -1.7], [4.9, -1.7], [-1.7, -4.9], [0.2, 4.95]]) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      beam('Plant', 'Ivy', [x, 0, z], [x + Math.cos(a) * 0.3, 0.35 + (i % 2) * 0.15, z + Math.sin(a) * 0.3], 0.14, { w1: 0.02 });
    }
  }
  lantern(m, 0.9, 3.05, C + 0.35);
  box('Lantern.Bracket', 'Iron', [0.88, 0.92], [3.23, 3.27], [C, C + 0.37]);

  // Wo Dorfbewohner hineingehen: am Fuß der Treppe (unsichtbar, liest das Spiel aus).
  box('Entry', 'Soot', [0.87, 0.93], [0, 0.05], [C + 2.45, C + 2.5]);
  write(dir, 'town_center', header('town_center', 'Hauptgebaeude',
    '# Material Paint (Band, Wappen und Fahne) bekommt die Gebaeudefarbe aus dem Spiel,\n# das Objekt Cloth (Fahnentuch am Mast bei x = 0) weht.\n'), m, '0.200 0.350 0.750');
}

// --- Mill: timber-framed tower like the house and the town center - stone
// base, grey plaster, jettied upper floor over a band in the player's colour,
// shingle roof with the gable to the front and four lattice sails before it,
// a lean-to with flour sacks. 4.3 m wide without the sails (size 0.86).
/**
 * One of four mills: `stone` builds the lower storey from rubble stone,
 * `mirror` flips door and lean-to to the other side, `tall` adds height and
 * longer sails, `stripes` paints the sail canvas in stripes. No turning -
 * the sails have to stay at the front, where the game spins them.
 */
function mill({ file, stone = false, mirror = false, tall = false, stripes = false }) {
  const m = model();
  const { box, beam } = m;
  const W = 1.45, D = 1.45;   // half size of the lower storey
  const P = 0.6;              // stone base
  const G = 3.3;              // top of the lower storey
  const J = 0.12;             // jetty
  const E = tall ? 6.9 : 5.9, R = tall ? 9.0 : 8.0;     // eaves, ridge
  const WU = W + J, DU = D + J;
  const wall = walls(m, W, D);
  const upper = walls(m, WU, DU);

  box('Ground', 'Dirt', [-2.2, 2.2], [0, 0.03], [-1.9, 2.2], { r: 0.25 });
  box('Base', 'Stone', [-W - 0.1, W + 0.1], [0, P], [-D - 0.1, D + 0.1]);
  for (const face of ['front', 'back', 'left', 'right']) {
    for (let i = 0; i < 5; i++) {
      const u = -W + 0.12 + i * 0.6;
      wall(face, 'Base.Stone', i % 2 ? 'StoneDark' : 'StoneLight', [u, u + 0.45], [0.08 + (i % 2) * 0.12, P - 0.1], [0.1, 0.14]);
    }
  }

  // Lower storey: plaster in a timber frame with braces - or rubble stone.
  box('Walls', stone ? 'Stone' : 'PlasterGrey', [-W, W], [P, G], [-D, D]);
  for (const face of ['front', 'back', 'left', 'right']) {
    if (stone) {
      for (let row = 0; row < 9; row++) {
        for (let i = 0; i < 5; i++) {
          const u = -W + 0.1 + i * 0.6 + (row % 2) * 0.3;
          if (u + 0.45 > W) continue;
          wall(face, 'Wall.Stone', (row + i) % 3 ? 'StoneDark' : 'StoneLight', [u, u + 0.45], [P + 0.05 + row * 0.3, P + 0.3 + row * 0.3], [0, 0.03]);
        }
      }
      for (const u of [-W, W - 0.3]) {
        for (let i = 0; i < 9; i++) wall(face, 'Wall.Quoin', 'StoneLight', [u + (i % 2) * 0.08, u + 0.3], [P + i * 0.3, P + i * 0.3 + 0.27], [0, 0.05]);
      }
    } else {
      for (const u of [-W, 0, W]) wall(face, 'Timber.Post', 'Timber', [u - 0.08, u + 0.08], [P, G], [0, 0.06]);
      wall(face, 'Timber.Sill', 'Timber', [-W, W], [P, P + 0.12], [0, 0.06]);
      wall(face, 'Timber.Rail', 'Timber', [-W, W], [1.95, 2.05], [0, 0.06]);
    }
  }
  if (!stone) {
    for (const s of [-1, 1]) {
      for (const z of [D + 0.03, -D - 0.03]) beam('Timber.Brace', 'Timber', [s * (W - 0.08), 2.05, z], [s * 0.1, G - 0.05, z], 0.1);
      for (const x of [W + 0.03, -W - 0.03]) beam('Timber.Brace', 'Timber', [x, 2.05, s * (D - 0.08)], [x, G - 0.05, s * 0.1], 0.1);
    }
  }
  // Band in the player's colour and the jettied upper floor.
  box('Band', 'Paint', [-WU - 0.02, WU + 0.02], [G, G + 0.2], [-DU - 0.02, DU + 0.02]);
  box('Band.Edge', 'Timber', [-WU - 0.04, WU + 0.04], [G + 0.2, G + 0.26], [-DU - 0.04, DU + 0.04]);
  const U0 = G + 0.26;
  box('Upper', 'PlasterGrey', [-WU, WU], [U0, E], [-DU, DU]);
  for (const face of ['front', 'back', 'left', 'right']) {
    for (const u of [-WU, -WU / 3, WU / 3, WU]) upper(face, 'Timber.Post', 'Timber', [u - 0.07, u + 0.07], [U0, E], [0, 0.06]);
    upper(face, 'Timber.Rail', 'Timber', [-WU, WU], [4.55, 4.65], [0, 0.06]);
    if (tall) upper(face, 'Timber.Rail', 'Timber', [-WU, WU], [5.75, 5.85], [0, 0.06]);
    upper(face, 'Timber.Plate', 'Timber', [-WU - 0.04, WU + 0.04], [E - 0.14, E], [0, 0.07]);
  }

  // Windows with warm light and open shutters.
  const lit = (w, face, u, y0, y1, width) => {
    const h = width / 2;
    w(face, 'Window.Light', 'WindowLit', [u - h, u + h], [y0, y1], [0, 0.03]);
    w(face, 'Window.Bar', 'Timber', [u - 0.02, u + 0.02], [y0, y1], [0.03, 0.06]);
    w(face, 'Window.Sill', 'Timber', [u - h - 0.08, u + h + 0.08], [y0 - 0.07, y0], [0, 0.12]);
    w(face, 'Window.Lintel', 'Timber', [u - h - 0.07, u + h + 0.07], [y1, y1 + 0.07], [0, 0.08]);
    for (const s of [-1, 1]) {
      const a = s < 0 ? [u - h - 0.06 - h, u - h - 0.06] : [u + h + 0.06, u + h + 0.06 + h];
      w(face, 'Window.Shutter', 'Wood', a, [y0, y1], [0, 0.04]);
      for (const y of [y0 + 0.1, y1 - 0.14]) w(face, 'Window.Shutter.Band', 'Timber', a, [y, y + 0.04], [0.04, 0.055]);
    }
  };
  lit(wall, 'front', -0.75, 1.1, 1.75, 0.44);
  lit(wall, 'left', 0.5, 1.1, 1.75, 0.44);
  lit(wall, 'back', 0, 1.1, 1.75, 0.44);
  lit(upper, 'right', -0.55, 3.8, 4.4, 0.42);
  lit(upper, 'left', 0, 3.8, 4.4, 0.42);
  lit(upper, 'back', 0, 3.8, 4.4, 0.42);
  lit(upper, 'front', 0.75, 4.85, 5.45, 0.38);
  if (tall) {
    lit(upper, 'left', 0, 6.05, 6.6, 0.4);
    lit(upper, 'right', 0.3, 6.05, 6.6, 0.4);
  }
  // Door on the right side (the sails sweep the front), steps and a lantern.
  doorOn(wall, 'right', 0.35, P, 0.85, 1.9);
  box('Step', 'StoneLight', [W + 0.02, W + 0.5], [0, P], [-0.9, 0.25], { r: 0.1 });
  box('Step', 'StoneLight', [W + 0.02, W + 0.3], [P * 0.5, P], [-0.9, 0.25]);
  lantern(m, W + 0.16, 2.55, -0.85);
  box('Lantern.Bracket', 'Iron', [W, W + 0.18], [2.73, 2.77], [-0.87, -0.83]);
  // Shield in the player's colour on the right upper wall.
  m.extrude('Shield', 'Paint', 'x', [WU + 0.05, WU + 0.1], [[0.25, 5.45], [0.75, 5.45], [0.75, 5.15], [0.5, 4.8], [0.25, 5.15]]);
  beam('Shield.Stripe', 'Canvas', [WU + 0.105, 5.41, 0.29], [WU + 0.105, 5.02, 0.71], 0.07);

  // Shingle roof, gable to the front where the sails turn.
  const RX = WU + 0.38, RZ = DU + 0.35;
  for (const s of [1, -1]) slope(m, 'Roof', 'Shingle', 'z', [-RZ, RZ], [s * RX, E - 0.1], [0, R], 0.12, 8);
  box('Roof.Ridge', 'ShingleDark', [-0.12, 0.12], [R - 0.02, R + 0.15], [-RZ - 0.04, RZ + 0.04], { axis: 'z', n: 6 });
  m.extrude('Gable', 'PlasterGrey', 'z', [-DU, DU], [[-WU, E], [WU, E], [0, R - 0.1]]);
  for (const s of [-1, 1]) {
    const z = s * (DU + 0.03);
    beam('Gable.KingPost', 'Timber', [0, E, z], [0, R - 0.2, z], 0.1);
    for (const t of [-1, 1]) {
      beam('Gable.Brace', 'Timber', [t * (WU - 0.1), E, z], [t * 0.35, E + 1.1, z], 0.09);
      beam('Gable.Barge', 'Timber', [t * (RX - 0.04), E - 0.06, s * (RZ + 0.02)], [0, R + 0.1, s * (RZ + 0.02)], 0.13);
    }
  }
  box('Finial', 'Wood', [-0.07, 0.07], [R + 0.1, R + 0.55], [RZ - 0.07, RZ + 0.07], { n: 6, x: [0, 0], z: [RZ, RZ] });

  // Axle and hub on the front gable.
  const HY = E + 0.65, HZ = DU + 0.9;
  box('Axle', 'Wood', [-0.15, 0.15], [HY - 0.15, HY + 0.15], [DU - 0.2, HZ - 0.1], { axis: 'z', n: 8 });
  box('Axle.Bearing', 'Timber', [-0.32, 0.32], [HY - 0.3, HY - 0.12], [DU, DU + 0.5]);
  box('Hub', 'WoodDark', [-0.32, 0.32], [HY - 0.32, HY + 0.32], [HZ - 0.12, HZ + 0.12], { axis: 'z', n: 8 });
  box('Hub.Cap', 'Iron', [-0.15, 0.15], [HY - 0.15, HY + 0.15], [HZ + 0.12, HZ + 0.2], { axis: 'z', n: 8 });

  // Sails: four blades with a spar, lattice frame and canvas on the trailing
  // side, each turned by 90 degrees so the set stays centred on the hub.
  const L = tall ? 5.2 : 4.5, Z = [HZ + 0.02, HZ + 0.12];
  const rect = (k, [a0, a1], [b0, b1]) => {
    const c = Math.round(Math.cos((k * Math.PI) / 2)), s = Math.round(Math.sin((k * Math.PI) / 2));
    const pts = [[a0, b0], [a1, b1]].map(([a, b]) => [a * c - b * s, a * s + b * c]);
    return [[Math.min(pts[0][0], pts[1][0]), Math.max(pts[0][0], pts[1][0])], [HY + Math.min(pts[0][1], pts[1][1]), HY + Math.max(pts[0][1], pts[1][1])]];
  };
  for (let k = 0; k < 4; k++) {
    const sb = (name, mtl, a, b, z) => { const [x, y] = rect(k, a, b); box(name, mtl, x, y, z); };
    sb('Sails.Spar', 'Wood', [0.25, L], [-0.09, 0.09], [Z[0], Z[1] + 0.04]);
    if (stripes) {
      // Gestreiftes Segeltuch: abwechselnd hell und in Spielerfarbe.
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a0 = 0.95 + (i * (L - 1.05)) / n, a1 = 0.95 + ((i + 1) * (L - 1.05)) / n;
        sb('Sails.Canvas', i % 2 ? 'Paint' : 'Canvas', [a0, a1], [-0.95, -0.1], [Z[0] - 0.02, Z[0] + 0.02]);
      }
    } else {
      sb('Sails.Canvas', 'Canvas', [0.95, L - 0.1], [-0.95, -0.1], [Z[0] - 0.02, Z[0] + 0.02]);
    }
    sb('Sails.Rail', 'Wood', [0.9, L], [-1.0, -0.9], Z);
    for (let i = 0; i <= 5; i++) {
      const a = 0.95 + (i * (L - 1.05)) / 5;
      sb('Sails.Bar', 'Wood', [a - 0.04, a + 0.04], [-1.0, 0.0], Z);
    }
  }

  // Lean-to on the left with flour sacks, a millstone and a cart wheel.
  const LX = -W - 0.75;
  for (const z of [-D + 0.2, D - 0.2]) {
    box('Shed.Post', 'Timber', [LX - 0.09, LX + 0.09], [0, 2.1], [z - 0.09, z + 0.09]);
    beam('Shed.Brace', 'Timber', [LX, 1.6, z], [LX + 0.45, 2.08, z], 0.07);
  }
  box('Shed.Beam', 'Timber', [LX - 0.08, LX + 0.08], [2.05, 2.18], [-D - 0.1, D + 0.1]);
  slope(m, 'Shed.Roof', 'Shingle', 'z', [-D - 0.25, D + 0.25], [LX - 0.25, 2.1], [-W, 2.6], 0.1, 3);
  for (const [x, z, h] of [[LX + 0.35, -0.8, 0.55], [LX + 0.3, -0.35, 0.5], [LX + 0.4, 0.1, 0.55], [LX + 0.3, 0.55, 0.5], [LX + 0.35, -0.55, 1.0]]) {
    const y0 = h > 0.9 ? 0.5 : 0.03;
    const hh = h > 0.9 ? 0.45 : h;
    box('Sack', 'Sack', [x - 0.22, x + 0.22], [y0, y0 + hh], [z - 0.2, z + 0.2], { r: 0.3, x: [x - 0.15, x + 0.15], z: [z - 0.13, z + 0.13] });
    box('Sack.Tie', 'WoodDark', [x - 0.12, x + 0.12], [y0 + hh - 0.08, y0 + hh - 0.04], [z - 0.1, z + 0.1], { r: 0.3 });
  }
  box('Millstone', 'StoneLight', [LX - 0.1, LX + 0.1], [0.05, 0.85], [0.75, 1.55], { axis: 'x', n: 12 });
  box('Millstone.Eye', 'StoneDark', [LX - 0.12, LX + 0.12], [0.36, 0.54], [1.06, 1.24], { axis: 'x', n: 8 });
  crate(m, [1.55, 2.0], 0.03, [1.2, 1.65]);
  barrel(m, 1.8, -1.55, 0.8, 0.28);
  // Ivy up a front corner.
  for (let i = 0; i < 14; i++) {
    const a = i * 1.9, y = 0.1 + i * 0.18, s = 0.08 + (i % 3) * 0.02;
    const [x, z] = [W + 0.04 + Math.cos(a) * 0.08, D + 0.04 + Math.sin(a) * 0.08];
    box('Ivy', i % 2 ? 'Ivy' : 'IvyDark', [x - s, x + s], [y, y + s * 1.4], [z - s, z + s], { r: 0.3 });
  }

  // Wo Dorfbewohner hineingehen: vor der Tür (unsichtbar, liest das Spiel aus).
  box('Entry', 'Soot', [W + 0.55, W + 0.6], [0, 0.05], [-0.4, -0.35]);
  if (mirror) {
    m.out = m.out.map((l) => {
      if (!l.startsWith('v ')) return l;
      const [x, y, z] = l.split(' ').slice(1);
      return `v ${-Number(x)} ${y} ${z}`;
    });
  }
  write(dir, file, header(file, 'Muehle',
    '# Die Objekte Sails.* drehen sich im Spiel um ihre Mitte (die Nabe), Blickachse\n# nach vorn. Material Paint (Band und Wappen) bekommt die Gebaeudefarbe aus dem Spiel.\n# Das Objekt Entry markiert den Eingang und wird nicht gezeichnet.\n'), m, '0.780 0.290 0.330');
}

// --- Lumber camp: open timber shed under a shingle roof like the house and
// the mill, with a band in the player's colour - a small storeroom at the
// back (plaster or stone) or, open, a bigger log pile - and a yard with a
// chopping block and a sawhorse. 5 m wide (size 1). Four variants.
function lumberCamp({ file, stone = false, open = false, mirror = false }) {
  const m = model();
  const { box, beam } = m;
  const X = 2.3, ZF = 1.15, ZB = -1.55;   // posts: half width, front, back
  const EF = 2.45, EB = 2.45, R = 3.75;   // eaves, ridge
  const ZR = (ZF + ZB) / 2;               // ridge line

  box('Ground', 'Dirt', [-2.5, 2.5], [0, 0.03], [-1.9, 2.45], { r: 0.2 });

  // Posts on stone feet, knee braces, beams all round.
  for (const x of [-X, 0, X]) {
    for (const z of [ZF, ZB]) {
      box('Post.Foot', 'Stone', [x - 0.16, x + 0.16], [0, 0.14], [z - 0.16, z + 0.16], { r: 0.2 });
      box('Post', 'Timber', [x - 0.11, x + 0.11], [0, z > 0 ? EF : EB], [z - 0.11, z + 0.11]);
    }
    for (const [z, s] of [[ZF, -1], [ZB, 1]]) beam('Brace', 'Timber', [x, 1.75, z], [x, 2.3, z + s * 0.55], 0.08);
  }
  for (const s of [-1, 1]) beam('Brace', 'Timber', [s * (X - 0.6), EF - 0.2, ZF], [s * X, EF - 0.8, ZF], 0.08);
  box('Beam.Front', 'Timber', [-X - 0.15, X + 0.15], [EF - 0.24, EF], [ZF - 0.12, ZF + 0.12]);
  box('Beam.Back', 'Timber', [-X - 0.15, X + 0.15], [EB - 0.24, EB], [ZB - 0.12, ZB + 0.12]);
  for (const x of [-X, 0, X]) box('Beam.Side', 'Timber', [x - 0.09, x + 0.09], [EF - 0.2, EF], [ZB - 0.1, ZF + 0.1]);
  // Band in the player's colour along the front beam, a pennant hanging from
  // it and a shield on each gable - so the camp shows whose it is.
  box('Band', 'Paint', [-X - 0.17, X + 0.17], [EF - 0.26, EF - 0.02], [ZF + 0.12, ZF + 0.17]);
  // Über dem Stammstapel - nicht vor Fenster und Tür des Lagerraums.
  const px = 1.25;
  m.extrude('Pennant', 'Paint', 'z', [ZF + 0.17, ZF + 0.2], [[px - 0.28, EF - 0.26], [px + 0.28, EF - 0.26], [px + 0.28, EF - 0.95], [px, EF - 1.2], [px - 0.28, EF - 0.95]]);
  box('Pennant.Stripe', 'Canvas', [px - 0.28, px + 0.28], [EF - 0.55, EF - 0.45], [ZF + 0.2, ZF + 0.21]);
  box('Pennant.Rod', 'Wood', [px - 0.34, px + 0.34], [EF - 0.3, EF - 0.24], [ZF + 0.15, ZF + 0.21], { axis: 'x', n: 6 });

  // Gable roof with shingles, ridge along x; planked gables.
  const RZF = ZF + 0.45, RZB = ZB - 0.45, RX = X + 0.35;
  slope(m, 'Roof', 'Shingle', 'x', [-RX, RX], [RZF, EF - 0.08], [ZR, R], 0.11, 6);
  slope(m, 'Roof', 'Shingle', 'x', [-RX, RX], [RZB, EB - 0.08], [ZR, R], 0.11, 6);
  box('Roof.Ridge', 'ShingleDark', [-RX - 0.04, RX + 0.04], [R - 0.02, R + 0.14], [ZR - 0.12, ZR + 0.12], { axis: 'x', n: 6 });
  for (const s of [-1, 1]) {
    const x = s * (X + 0.05);
    m.extrude('Gable', 'WoodLight', 'x', [x - 0.04, x + 0.04], [[ZB, EB], [ZF, EF], [ZR, R - 0.1]]);
    for (let i = 1; i < 5; i++) {
      const z = ZB + ((ZF - ZB) * i) / 5;
      const top = EF + (R - 0.1 - EF) * (1 - Math.abs(z - ZR) / ((ZF - ZB) / 2));
      box('Gable.Seam', 'WoodDark', [x - 0.05, x + 0.05], [EF, Math.max(EF, top - 0.05)], [z - 0.012, z + 0.012]);
    }
    for (const t of [RZF, RZB]) beam('Gable.Barge', 'Timber', [s * (RX + 0.02), EF - 0.1, t], [s * (RX + 0.02), R + 0.08, ZR], 0.12);
    // Shield on the gable, facing out to the side.
    const gx = s * (X + 0.1);
    m.extrude('Shield', 'Paint', 'x', s > 0 ? [gx, gx + 0.05] : [gx - 0.05, gx],
      [[ZR - 0.24, 3.2], [ZR + 0.24, 3.2], [ZR + 0.24, 2.92], [ZR, 2.62], [ZR - 0.24, 2.92]]);
    beam('Shield.Stripe', 'Canvas', [gx + s * 0.055, 3.16, ZR - 0.2], [gx + s * 0.055, 2.77, ZR + 0.2], 0.07);
  }

  if (!open) {
    // Storeroom at the back left: plaster in a timber frame or rubble stone,
    // a lit window, a plank door to the front and a shield.
    const [x0, x1, z0, z1] = [-X + 0.05, -0.1, ZB + 0.05, -0.15];
    box('Room.Plinth', 'Stone', [x0 - 0.04, x1 + 0.04], [0, 0.3], [z0 - 0.04, z1 + 0.04]);
    box('Room', stone ? 'Stone' : 'PlasterGrey', [x0, x1], [0.3, EB - 0.24], [z0, z1]);
    if (stone) {
      for (let row = 0; row < 6; row++) {
        for (let i = 0; i < 4; i++) {
          const u = x0 + 0.08 + i * 0.55 + (row % 2) * 0.27;
          if (u + 0.42 > x1) continue;
          box('Room.Stone', (row + i) % 3 ? 'StoneDark' : 'StoneLight', [u, u + 0.42], [0.35 + row * 0.3, 0.6 + row * 0.3], [z1, z1 + 0.03]);
        }
      }
    } else {
      for (const x of [x0, (x0 + x1) / 2, x1]) box('Room.Post', 'Timber', [x - 0.07, x + 0.07], [0.3, EB - 0.24], [z1, z1 + 0.05]);
      box('Room.Rail', 'Timber', [x0, x1], [1.4, 1.5], [z1, z1 + 0.05]);
      beam('Room.Brace', 'Timber', [x1 - 0.05, 1.5, z1 + 0.025], [(x0 + x1) / 2 + 0.05, EB - 0.3, z1 + 0.025], 0.09);
    }
    // Window and door on the front of the room.
    const wx = x0 + 0.5;
    box('Room.Window', 'WindowLit', [wx - 0.22, wx + 0.22], [1.0, 1.45], [z1, z1 + 0.03]);
    box('Room.Window.Bar', 'Timber', [wx - 0.02, wx + 0.02], [1.0, 1.45], [z1 + 0.03, z1 + 0.06]);
    box('Room.Window.Frame', 'Timber', [wx - 0.29, wx + 0.29], [0.93, 1.0], [z1, z1 + 0.12]);
    for (const s of [-1, 1]) box('Room.Window.Shutter', 'Wood', s < 0 ? [wx - 0.5, wx - 0.26] : [wx + 0.26, wx + 0.5], [1.0, 1.45], [z1, z1 + 0.04]);
    const dx = x1 - 0.55;
    box('Room.Door', 'Wood', [dx - 0.35, dx + 0.35], [0.3, 1.95], [z1, z1 + 0.05]);
    for (let i = 1; i < 4; i++) box('Room.Door.Seam', 'WoodDark', [dx - 0.35 + i * 0.175 - 0.01, dx - 0.35 + i * 0.175 + 0.01], [0.35, 1.9], [z1 + 0.05, z1 + 0.06]);
    box('Room.Door.Frame', 'Timber', [dx - 0.45, dx + 0.45], [1.95, 2.07], [z1, z1 + 0.08]);
    m.extrude('Shield', 'Paint', 'z', [z1 + 0.05, z1 + 0.1], [[wx - 0.2, 2.05], [wx + 0.2, 2.05], [wx + 0.2, 1.8], [wx, 1.55], [wx - 0.2, 1.8]]);
    beam('Shield.Stripe', 'Canvas', [wx - 0.16, 2.01, z1 + 0.105], [wx + 0.16, 1.66, z1 + 0.105], 0.06);
  }

  // Log pile under the roof - on the right, or across the whole shed when open.
  const pileX = open ? [-X + 0.25, X - 0.25] : [0.15, X - 0.2];
  const rows = open ? 5 : 4;
  for (let row = 0; row < rows; row++) {
    const count = 5 - Math.floor(row * 0.8);
    for (let i = 0; i < count; i++) {
      const z = ZB + 0.35 + i * 0.38 + row * 0.18;
      const y = 0.2 + row * 0.33;
      const d = ((row * 7 + i * 3) % 5) * 0.05 - 0.1;
      log(m, [pileX[0] + d, pileX[1] - d], y, z, 0.17);
    }
  }
  for (const x of [pileX[0] - 0.1, pileX[1] + 0.1]) box('Pile.Stake', 'Wood', [x - 0.04, x + 0.04], [0, 1.2], [ZB + 0.2, ZB + 0.28]);
  // Stacked planks by the front post (room variants) and tools on a post.
  if (!open) {
    for (let j = 0; j < 5; j++) box('Planks', j % 2 ? 'WoodLight' : 'LogEnd', [-2.15, -0.35], [0.06 + j * 0.08, 0.13 + j * 0.08], [0.05, 0.45]);
    box('Planks.Spacer', 'Wood', [-1.9, -1.8], [0, 0.06], [0.05, 0.45]);
    box('Planks.Spacer', 'Wood', [-0.7, -0.6], [0, 0.06], [0.05, 0.45]);
  }
  for (const [x, dy] of [[0.07, 0], [0.12, 0.25]]) {
    box('Tool.Handle', 'WoodLight', [x - 0.02, x + 0.02], [1.0 + dy, 1.8 + dy], [ZF - 0.16, ZF - 0.12]);
    box('Tool.Head', 'Iron', [x - 0.03, x + 0.12], [1.0 + dy, 1.13 + dy], [ZF - 0.17, ZF - 0.12], { x: [x - 0.03, x + 0.03] });
  }
  box('Saw.Blade', 'Iron', [-0.95, -0.2], [1.6, 1.7], [ZF - 0.14, ZF - 0.12], { x: [-0.95, -0.35] });
  box('Saw.Handle', 'WoodLight', [-0.2, -0.08], [1.6, 1.78], [ZF - 0.15, ZF - 0.11]);

  // Yard: chopping block with an axe, split firewood, sawhorse with a log.
  box('Block', 'Bark', [0.95, 1.55], [0, 0.5], [1.55, 2.15], { n: 10 });
  box('Block.Top', 'LogEnd', [0.97, 1.53], [0.5, 0.52], [1.57, 2.13], { n: 10 });
  beam('Axe.Handle', 'WoodLight', [1.2, 0.5, 1.8], [1.55, 1.05, 2.15], 0.05);
  box('Axe.Head', 'Iron', [1.1, 1.3], [0.47, 0.6], [1.75, 1.83], { x: [1.14, 1.26] });
  for (let i = 0; i < 7; i++) {
    const x = 1.75 + (i % 3) * 0.18, z = 1.6 + Math.floor(i / 3) * 0.2, y = i === 6 ? 0.14 : 0;
    box('Firewood', i % 2 ? 'LogEnd' : 'Bark', [x - 0.08, x + 0.08], [y, y + 0.14], [z - 0.07, z + 0.07], { n: 3, rot: i });
  }
  for (const x of [-1.25, -0.55]) {
    beam('Sawhorse.Leg', 'Wood', [x, 0, 1.6], [x, 0.8, 2.05], 0.07);
    beam('Sawhorse.Leg', 'Wood', [x, 0, 2.1], [x, 0.8, 1.65], 0.07);
  }
  log(m, [-1.7, -0.05], 0.9, 1.85, 0.14);
  lantern(m, 0, EF - 0.6, ZF + 0.02);
  box('Lantern.Chain', 'Iron', [-0.01, 0.01], [EF - 0.4, EF - 0.24], [ZF, ZF + 0.04]);
  // Ivy up a front post.
  for (let i = 0; i < 12; i++) {
    const a = i * 1.9, y = 0.1 + i * 0.18, s = 0.07 + (i % 3) * 0.02;
    const [x, z] = [X + Math.cos(a) * 0.14, ZF + Math.sin(a) * 0.14];
    box('Ivy', i % 2 ? 'Ivy' : 'IvyDark', [x - s, x + s], [y, y + s * 1.4], [z - s, z + s], { r: 0.3 });
  }

  // Wo Dorfbewohner abladen: vorn unter dem Dach (unsichtbar, liest das Spiel aus).
  box('Entry', 'Soot', [0.32, 0.38], [0, 0.05], [1.5, 1.55]);
  if (mirror) {
    m.out = m.out.map((l) => {
      if (!l.startsWith('v ')) return l;
      const [x, y, z] = l.split(' ').slice(1);
      return `v ${-Number(x)} ${y} ${z}`;
    });
  }
  write(dir, file, header(file, 'Holzlager', '# Material Paint (Band und Wappen) bekommt die Gebaeudefarbe aus dem Spiel.\n# Das Objekt Entry markiert den Eingang und wird nicht gezeichnet.\n'), m, '0.490 0.360 0.190');
}

// --- Mining camp: shed on a stone back wall, rails with an ore cart, piles
// of stone and gold, 5 m wide (size 1) ----------------------------------------
function miningCamp() {
  const m = model();
  const { box, beam } = m;
  const X = 2.1, ZF = 0.9, ZB = -1.45, EY = 2.35, RY = 3.35;

  // Stone back wall in courses, timber posts, floor of planks.
  box('Wall', 'Stone', [-X, X], [0, EY], [ZB - 0.3, ZB]);
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 6; i++) {
      const x = -X + 0.05 + i * 0.7 + (row % 2) * 0.35;
      if (x + 0.6 > X) continue;
      box('Wall.Stone', (row + i) % 3 ? 'StoneDark' : 'StoneLight', [x, x + 0.6], [row * 0.38 + 0.03, row * 0.38 + 0.35], [ZB, ZB + 0.03]);
      box('Wall.Stone', (row + i + 1) % 3 ? 'StoneDark' : 'StoneLight', [-x - 0.6, -x], [row * 0.38 + 0.03, row * 0.38 + 0.35], [ZB - 0.33, ZB - 0.3]);
    }
  }
  m.extrude('Wall.Gable', 'Stone', 'z', [ZB - 0.3, ZB], [[-X, EY], [X, EY], [0, RY - 0.1]]);
  for (const x of [-X, X]) {
    box('Post', 'Timber', [x - 0.12, x + 0.12], [0, EY], [ZF - 0.12, ZF + 0.12]);
    beam('Brace', 'Timber', [x, EY - 0.7, ZF], [x, EY - 0.12, ZF - 0.6], 0.1);
    box('Beam.Side', 'Timber', [x - 0.1, x + 0.1], [EY - 0.2, EY], [ZB - 0.3, ZF + 0.12]);
  }
  box('Beam.Front', 'Timber', [-X - 0.15, X + 0.15], [EY - 0.24, EY], [ZF - 0.12, ZF + 0.12]);
  box('Beam.Ridge', 'Timber', [-0.1, 0.1], [RY - 0.25, RY - 0.05], [ZB - 0.3, ZF + 0.5]);
  box('Post.King', 'Timber', [-0.07, 0.07], [EY, RY - 0.2], [ZF - 0.07, ZF + 0.07]);
  box('Floor', 'Wood', [-X, X], [0, 0.1], [ZB, ZF]);
  for (let i = 1; i < 12; i++) box('Floor.Seam', 'WoodDark', [-X + i * (2 * X / 12) - 0.01, -X + i * (2 * X / 12) + 0.01], [0.1, 0.105], [ZB, ZF]);

  // Gable roof, ridge along z, in courses.
  for (const s of [-1, 1]) slope(m, 'Roof', 'Paint', 'z', [ZB - 0.45, ZF + 0.55], [s * 2.5, EY - 0.1], [0, RY], 0.12, 4);
  box('Roof.Ridge', 'Iron', [-0.12, 0.12], [RY + 0.02, RY + 0.18], [ZB - 0.5, ZF + 0.6], { axis: 'z', n: 6 });

  // Rails with sleepers running out of the shed, ore cart full of rock and gold.
  for (let i = 0; i < 10; i++) {
    const z = ZB + 0.25 + i * 0.4;
    box('Sleeper', 'Timber', [-0.6, 0.6], [0.1, 0.18], [z - 0.07, z + 0.07]);
  }
  for (const x of [-0.36, 0.36]) {
    box('Rail', 'Iron', [x - 0.03, x + 0.03], [0.18, 0.25], [ZB + 0.1, 2.45]);
    box('Rail.Foot', 'Iron', [x - 0.05, x + 0.05], [0.18, 0.2], [ZB + 0.1, 2.45]);
  }
  box('Rail.Stop', 'Timber', [-0.55, 0.55], [0.18, 0.4], [2.45, 2.6]);
  const CZ = 1.6;
  box('Cart', 'Wood', [-0.5, 0.5], [0.45, 1.0], [CZ - 0.42, CZ + 0.42], { x: [-0.58, 0.58], z: [CZ - 0.5, CZ + 0.5] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box('Cart.Corner', 'Iron', sx > 0 ? [0.46, 0.56] : [-0.56, -0.46], [0.45, 1.0], sz > 0 ? [CZ + 0.36, CZ + 0.46] : [CZ - 0.46, CZ - 0.36],
      { x: sx > 0 ? [0.54, 0.6] : [-0.6, -0.54], z: sz > 0 ? [CZ + 0.44, CZ + 0.52] : [CZ - 0.52, CZ - 0.44] });
  }
  box('Cart.Band', 'Iron', [-0.56, 0.56], [0.92, 0.98], [CZ - 0.49, CZ + 0.49]);
  for (const x of [-0.37, 0.37]) {
    for (const z of [CZ - 0.27, CZ + 0.27]) {
      box('Cart.Wheel', 'Iron', [x - 0.04, x + 0.04], [0.25, 0.61], [z - 0.18, z + 0.18], { axis: 'x', n: 10 });
      box('Cart.Hub', 'WoodDark', [x - 0.07, x + 0.07], [0.37, 0.49], [z - 0.06, z + 0.06], { axis: 'x', n: 6 });
    }
  }
  box('Cart.Axle', 'Iron', [-0.45, 0.45], [0.4, 0.46], [CZ - 0.3, CZ - 0.24]);
  box('Cart.Axle', 'Iron', [-0.45, 0.45], [0.4, 0.46], [CZ + 0.24, CZ + 0.3]);
  const lumps = [[-0.3, CZ - 0.2, 'Ore'], [0.05, CZ - 0.25, 'Gold'], [0.3, CZ, 'Ore'], [-0.15, CZ + 0.15, 'Gold'], [0.2, CZ + 0.28, 'Ore'], [-0.35, CZ + 0.3, 'Stone'], [0.0, CZ + 0.02, 'GoldDark']];
  lumps.forEach(([x, z, mtl], i) => box('Cart.Load', mtl, [x - 0.17, x + 0.17], [0.9, 1.08 + (i % 3) * 0.05], [z - 0.15, z + 0.15], { r: 0.3, n: i % 2 ? 6 : 0 }));

  // Piles of quarried stone and gold ore in the yard.
  const pile = (cx, cz, mtls, seed) => {
    const spots = [[-0.35, -0.2, 0], [0.1, -0.3, 0], [0.4, 0.05, 0], [-0.2, 0.25, 0], [0.2, 0.35, 0], [-0.05, 0, 0.22], [0.25, -0.05, 0.2], [-0.25, -0.05, 0.2], [0.02, 0.05, 0.42]];
    spots.forEach(([dx, dz, y], i) => {
      const s = 0.2 + ((i * 7 + seed) % 4) * 0.03;
      box('Pile', mtls[(i + seed) % mtls.length], [cx + dx - s, cx + dx + s], [y, y + s * 1.2], [cz + dz - s * 0.9, cz + dz + s * 0.9],
        { r: 0.3, x: [cx + dx - s * 0.7, cx + dx + s * 0.7], z: [cz + dz - s * 0.6, cz + dz + s * 0.6] });
    });
  };
  pile(-1.5, 1.8, ['Stone', 'StoneDark', 'StoneLight'], 1);
  pile(1.5, 1.8, ['Gold', 'GoldDark', 'Ore', 'Gold'], 2);

  // Under the roof: rack with pickaxes and a shovel, crates, lantern.
  box('Rack', 'Wood', [-1.95, -1.1], [1.1, 1.18], [ZB + 0.05, ZB + 0.15]);
  box('Rack', 'Wood', [-1.95, -1.1], [0.3, 0.38], [ZB + 0.05, ZB + 0.15]);
  for (const [x, lean] of [[-1.8, 0.2], [-1.5, 0.25]]) {
    beam('Pickaxe.Handle', 'WoodLight', [x, 0.1, ZB + 0.45], [x, 1.35, ZB + 0.45 - lean - 0.2], 0.05);
    beam('Pickaxe.Head', 'Iron', [x - 0.28, 1.25, ZB + 0.2 - lean + 0.05], [x, 1.42, ZB + 0.2 - lean + 0.05], 0.05, { w1: 0.06 });
    beam('Pickaxe.Head', 'Iron', [x + 0.28, 1.25, ZB + 0.2 - lean + 0.05], [x, 1.42, ZB + 0.2 - lean + 0.05], 0.05, { w1: 0.06 });
  }
  beam('Shovel.Handle', 'WoodLight', [-1.2, 0.35, ZB + 0.4], [-1.2, 1.5, ZB + 0.12], 0.045);
  box('Shovel.Blade', 'Iron', [-1.32, -1.08], [0.1, 0.4], [ZB + 0.38, ZB + 0.44], { x: [-1.3, -1.1] });
  crate(m, [1.2, 1.75], 0.1, [ZB + 0.1, ZB + 0.65]);
  crate(m, [1.3, 1.7], 0.65, [ZB + 0.18, ZB + 0.58]);
  box('Sieve', 'Wood', [0.9, 1.3], [0.1, 0.2], [0.1, 0.5], { n: 10 });
  lantern(m, X - 0.05, 1.7, ZF + 0.2);
  box('Lantern.Hook', 'Iron', [X - 0.08, X - 0.02], [1.9, 1.95], [ZF, ZF + 0.22]);
  // Wo Dorfbewohner abladen: vorn neben den Schienen (unsichtbar, liest das Spiel aus).
  box('Entry', 'Soot', [-0.93, -0.87], [0, 0.05], [1.3, 1.35]);
  write(dir, 'mining_camp', header('mining_camp', 'Minenlager', '# Material Paint (das Dach) bekommt die Gebaeudefarbe aus dem Spiel.\n# Das Objekt Entry markiert den Eingang und wird nicht gezeichnet.\n'), m, '0.590 0.600 0.640');
}

house({ file: 'house' });
house({ file: 'house_2', stone: true, mirror: true });
// Halbe Drehungen: eine Vierteldrehung vertauschte Breite und Tiefe, und das
// Spiel skaliert Gebäude nach der Breite - das Haus wäre größer geworden.
house({ file: 'house_3', storeys: 1, turn: 2 });
house({ file: 'house_4', storeys: 1, stone: true, mirror: true });
townCenter();
mill({ file: 'mill' });
mill({ file: 'mill_2', stone: true, mirror: true });
mill({ file: 'mill_3', tall: true });
mill({ file: 'mill_4', stone: true, mirror: true, tall: true, stripes: true });
lumberCamp({ file: 'lumber_camp' });
lumberCamp({ file: 'lumber_camp_2', stone: true, mirror: true });
lumberCamp({ file: 'lumber_camp_3', open: true });
lumberCamp({ file: 'lumber_camp_4', open: true, mirror: true });
miningCamp();
