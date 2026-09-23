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

// --- House: half-timbered cottage, 4 m wide (size 0.8) ---------------------
function house() {
  const m = model();
  const { box, beam } = m;
  const W = 1.7, D = 1.4, P = 0.35, E = 2.78, RY = 4.3, RX = 1.98, RZ = 1.75;
  const wall = walls(m, W, D);

  box('Plinth', 'Stone', [-1.78, 1.78], [0, P], [-1.48, 1.48]);
  for (let i = 0; i < 7; i++) {
    const x = -1.55 + i * 0.52;
    box('Plinth.Stone', 'StoneDark', [x - 0.2, x + 0.18], [0.04 + (i % 2) * 0.05, 0.28 - (i % 3) * 0.03], [1.47, 1.51]);
  }
  box('Walls', 'Plaster', [-W, W], [P, E], [-D, D]);

  // Timber frame: corner posts, sill, rail and top plate all round, braces.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box('Timber.Post', 'Timber', sx > 0 ? [W - 0.08, W + 0.05] : [-W - 0.05, -W + 0.08], [P, E], sz > 0 ? [D - 0.08, D + 0.05] : [-D - 0.05, -D + 0.08]);
  }
  for (const face of ['front', 'back']) {
    wall(face, 'Timber.Sill', 'Timber', [-W, W], [P, P + 0.14], [0, 0.05]);
    wall(face, 'Timber.Plate', 'Timber', [-W, W], [E - 0.16, E], [0, 0.05]);
  }
  for (const face of ['left', 'right']) {
    wall(face, 'Timber.Sill', 'Timber', [-D, D], [P, P + 0.14], [0, 0.05]);
    wall(face, 'Timber.Plate', 'Timber', [-D, D], [E - 0.16, E], [0, 0.05]);
    wall(face, 'Timber.Rail', 'Timber', [-D, D], [1.66, 1.78], [0, 0.05]);
    wall(face, 'Timber.Stud', 'Timber', [-0.06, 0.06], [P, E], [0, 0.05]);
  }
  wall('front', 'Timber.Rail', 'Timber', [-W, -0.58], [1.66, 1.78], [0, 0.05]);
  wall('front', 'Timber.Rail', 'Timber', [0.58, W], [1.66, 1.78], [0, 0.05]);
  wall('back', 'Timber.Rail', 'Timber', [-W, W], [1.66, 1.78], [0, 0.05]);
  for (const s of [-1, 1]) {
    // V braces in the upper panels of the front and back.
    for (const z of [D + 0.025, -D - 0.025]) {
      beam('Timber.Brace', 'Timber', [s * 1.6, 1.78, z], [s * 1.08, E - 0.16, z], 0.1);
      beam('Timber.Brace', 'Timber', [s * 0.62, 1.78, z], [s * 1.08, E - 0.16, z], 0.1);
    }
    // Braces from the corners on the sides.
    for (const z0 of [-D + 0.05, D - 0.05]) {
      beam('Timber.Brace', 'Timber', [s * (W + 0.025), P + 0.14, z0], [s * (W + 0.025), 1.66, z0 * 0.45], 0.1);
    }
  }

  doorOn(wall, 'front', 0, P, 0.9, 2.1);
  box('Step', 'Stone', [-0.66, 0.66], [0, 0.2], [D + 0.08, D + 0.55], { r: 0.1 });
  for (const s of [-1, 1]) windowOn(wall, 'front', s * 1.15, [1.02, 1.56], 0.46, { shutters: true, flowers: true });
  windowOn(wall, 'left', 0.55, [1.02, 1.56], 0.5, { shutters: true });
  windowOn(wall, 'right', 0.7, [1.02, 1.56], 0.5, { shutters: true });
  windowOn(wall, 'back', -0.6, [1.02, 1.56], 0.5);
  lantern(m, 0.72, 2.25, D + 0.18);
  box('Lantern.Bracket', 'Iron', [0.7, 0.74], [2.42, 2.46], [D, D + 0.2]);

  // Gable roof, ridge along x: tiled courses, ridge cap, gable walls with
  // king post, collar and attic window, bargeboards.
  for (const s of [1, -1]) slope(m, 'Roof', 'Paint', 'x', [-RX, RX], [s * RZ, E - 0.16], [0, RY], 0.14, 5);
  box('Roof.Ridge', 'RoofDark', [-RX - 0.05, RX + 0.05], [RY + 0.04, RY + 0.24], [-0.13, 0.13], { axis: 'x', n: 6 });
  m.extrude('Gable', 'Plaster', 'x', [-W, W], [[-D, E], [D, E], [0, RY - 0.12]]);
  for (const s of [-1, 1]) {
    const x = s * (W + 0.025);
    box('Gable.KingPost', 'Timber', [x - 0.03, x + 0.03], [E, RY - 0.2], [-0.06, 0.06]);
    box('Gable.Collar', 'Timber', [x - 0.03, x + 0.03], [3.3, 3.42], [-0.85, 0.85]);
    box('Gable.Window', 'Glass', [x - 0.02, x + 0.02], [3.52, 3.86], [-0.34, -0.1]);
    box('Gable.Window', 'Glass', [x - 0.02, x + 0.02], [3.52, 3.86], [0.1, 0.34]);
    for (const z of [1, -1]) beam('Gable.Barge', 'Timber', [s * (RX + 0.03), E - 0.02, z * (RZ + 0.03)], [s * (RX + 0.03), RY + 0.14, 0], 0.13);
  }
  // Chimney through the back slope.
  box('Chimney', 'Stone', [0.75, 1.2], [2.6, 5.0], [-0.9, -0.45], { r: 0.06 });
  for (const y of [3.9, 4.4]) box('Chimney.Band', 'StoneDark', [0.73, 1.22], [y, y + 0.06], [-0.92, -0.43]);
  box('Chimney.Cap', 'StoneDark', [0.69, 1.26], [5.0, 5.12], [-0.96, -0.39]);
  box('Chimney.Flue', 'Soot', [0.83, 1.12], [5.12, 5.13], [-0.82, -0.53]);

  // Yard: water barrel by the door, firewood stacked against the right wall.
  barrel(m, -1.35, D + 0.4, 0.8, 0.28);
  for (let row = 0; row < 3; row++) {
    for (let c = 0; c < 2 - (row === 2 ? 1 : 0); c++) {
      const x = W + 0.1 + c * 0.14 + (row % 2) * 0.07;
      const y = 0.08 + row * 0.13;
      m.box('Firewood', 'Bark', [x - 0.07, x + 0.07], [y - 0.07, y + 0.07], [-1.3, -0.25], { axis: 'z', n: 7 });
      for (const [a, b] of [[-1.312, -1.3], [-0.25, -0.238]]) m.box('Firewood.End', 'LogEnd', [x - 0.06, x + 0.06], [y - 0.06, y + 0.06], [a, b], { axis: 'z', n: 7 });
    }
  }
  write(dir, 'house', header('house', 'Haus', '# Material Paint (das Dach) bekommt die Gebaeudefarbe aus dem Spiel.\n'), m, '0.840 0.620 0.380');
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
  shield('front', -0.95, 3.0 - 0.45);
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

  write(dir, 'town_center', header('town_center', 'Hauptgebaeude',
    '# Material Paint (Band, Wappen und Fahne) bekommt die Gebaeudefarbe aus dem Spiel,\n# das Objekt Cloth (Fahnentuch am Mast bei x = 0) weht.\n'), m, '0.200 0.350 0.750');
}

// --- Mill: tapered tower with a conical cap and four lattice sails, 4.3 m
// wide without the sails (size 0.86) ----------------------------------------
function mill() {
  const m = model();
  const { box, beam } = m;
  const r = (y) => 1.95 - (0.55 * (y - 0.5)) / 6.5; // tower radius
  const face = (y) => r(y) * Math.cos(Math.PI / 10); // distance to a flat face
  const N = 10, rot = Math.PI / 2 + Math.PI / 10; // flat face towards +z

  box('Plinth', 'Stone', [-2.15, 2.15], [0, 0.5], [-2.15, 2.15], { n: N, rot, x: [-2.05, 2.05], z: [-2.05, 2.05] });
  box('Tower', 'Plaster', [-1.95, 1.95], [0.5, 7.0], [-1.95, 1.95], { n: N, rot, x: [-1.4, 1.4], z: [-1.4, 1.4] });
  for (const y of [0.5, 3.4, 6.7]) {
    const rr = r(y) + 0.03;
    box('Tower.Band', 'StoneDark', [-rr, rr], [y, y + 0.16], [-rr, rr], { n: N, rot });
  }
  // Door with frame and steps, windows up the tower.
  const dz = (y) => face(y) + 0.01;
  box('Door', 'Wood', [-0.45, 0.45], [0.5, 2.6], [dz(0.5) - 0.03, dz(0.5) + 0.05], { z: [dz(2.6) - 0.03, dz(2.6) + 0.05] });
  for (let i = 1; i < 4; i++) {
    const x = -0.45 + i * 0.225;
    box('Door.Seam', 'WoodDark', [x - 0.012, x + 0.012], [0.55, 2.55], [dz(0.5) + 0.05, dz(0.5) + 0.06], { z: [dz(2.6) + 0.05, dz(2.6) + 0.06] });
  }
  box('Door.Handle', 'Iron', [0.25, 0.32], [1.5, 1.6], [dz(1.5) + 0.04, dz(1.5) + 0.1], { r: 0.3 });
  for (const s of [-1, 1]) {
    box('Door.Frame', 'Timber', s > 0 ? [0.45, 0.58] : [-0.58, -0.45], [0.5, 2.75], [dz(0.5) - 0.03, dz(0.5) + 0.09], { z: [dz(2.75) - 0.03, dz(2.75) + 0.09] });
  }
  box('Door.Frame', 'Timber', [-0.58, 0.58], [2.6, 2.75], [dz(2.6) - 0.03, dz(2.6) + 0.1]);
  box('Step', 'StoneLight', [-0.65, 0.65], [0, 0.25], [2.0, 2.5]);
  box('Step', 'StoneLight', [-0.6, 0.6], [0.25, 0.5], [1.85, 2.2]);
  for (const [y, a] of [[4.4, 0], [4.9, Math.PI * 0.6], [4.9, -Math.PI * 0.6], [2.2, Math.PI]]) {
    const d = face(y + 0.3);
    const c = Math.cos(a), s = Math.sin(a);
    const at = (u, w) => [u * c + w * s, -u * s + w * c];
    // Window on the face at angle a (0 = front): glass and frame.
    for (const [mtl, hw, w0, w1, y0, y1] of [['Timber', 0.3, 0, 0.07, y - 0.06, y + 0.7], ['Glass', 0.22, 0.02, 0.09, y, y + 0.62]]) {
      const pts = [at(-hw, d + w0), at(hw, d + w0), at(hw, d + w1), at(-hw, d + w1)];
      m.extrude('Window', mtl, 'y', [y0, y1], pts);
    }
    const bar = [at(-0.22, d + 0.09), at(0.22, d + 0.09), at(0.22, d + 0.11), at(-0.22, d + 0.11)];
    m.extrude('Window.Bar', 'Timber', 'y', [y + 0.29, y + 0.33], bar);
  }

  // Cap: timber rim, conical roof in courses, finial.
  box('Cap.Rim', 'Wood', [-1.6, 1.6], [7.0, 7.25], [-1.6, 1.6], { n: N, rot });
  const cone = [[1.75, 7.25], [1.25, 7.95], [0.7, 8.65], [0, 9.5]];
  for (let i = 0; i < 3; i++) {
    const [r0, y0] = cone[i], [r1, y1] = cone[i + 1];
    box('Cap', 'Paint', [-r0, r0], [y0 - (i ? 0.08 : 0), y1], [-r0, r0], { n: N, rot, x: [-r1, r1], z: [-r1, r1] });
  }
  box('Cap.Finial', 'Wood', [-0.08, 0.08], [9.4, 9.8], [-0.08, 0.08], { n: 6, x: [0, 0], z: [0, 0] });

  // Axle and hub, tail pole down to the ground at the back.
  const HY = 7.65, HZ = 2.45;
  box('Axle', 'Wood', [-0.15, 0.15], [HY - 0.15, HY + 0.15], [1.0, HZ - 0.1], { axis: 'z', n: 8 });
  box('Hub', 'WoodDark', [-0.32, 0.32], [HY - 0.32, HY + 0.32], [HZ - 0.12, HZ + 0.12], { axis: 'z', n: 8 });
  beam('Tail', 'Wood', [0, 7.15, -1.4], [0, 0.4, -3.4], 0.16);
  beam('Tail.Strut', 'Wood', [0, 7.0, -1.2], [0, 4.2, -2.55], 0.1);
  box('Tail.Post', 'Timber', [-0.12, 0.12], [0, 0.55], [-3.52, -3.28]);

  // Sails: four blades with a spar, lattice frame and canvas on the trailing
  // side, each turned by 90 degrees so the set stays centred on the hub.
  const L = 4.4, Z = [HZ + 0.02, HZ + 0.12];
  const rect = (k, [a0, a1], [b0, b1]) => {
    const c = Math.round(Math.cos((k * Math.PI) / 2)), s = Math.round(Math.sin((k * Math.PI) / 2));
    const pts = [[a0, b0], [a1, b1]].map(([a, b]) => [a * c - b * s, a * s + b * c]);
    return [[Math.min(pts[0][0], pts[1][0]), Math.max(pts[0][0], pts[1][0])], [HY + Math.min(pts[0][1], pts[1][1]), HY + Math.max(pts[0][1], pts[1][1])]];
  };
  for (let k = 0; k < 4; k++) {
    const sb = (name, mtl, a, b, z) => { const [x, y] = rect(k, a, b); box(name, mtl, x, y, z); };
    sb('Sails.Spar', 'Wood', [0.25, L], [-0.09, 0.09], [Z[0], Z[1] + 0.04]);
    sb('Sails.Canvas', 'Canvas', [0.95, L - 0.1], [-0.95, -0.1], [Z[0] - 0.02, Z[0] + 0.02]);
    sb('Sails.Rail', 'Wood', [0.9, L], [-1.0, -0.9], Z);
    for (let i = 0; i <= 5; i++) {
      const a = 0.95 + (i * (L - 1.05)) / 5;
      sb('Sails.Bar', 'Wood', [a - 0.04, a + 0.04], [-1.0, 0.0], Z);
    }
  }

  // Flour sacks and a crate by the door.
  for (const [x, z, h] of [[-1.25, 2.0, 0.55], [-0.95, 2.3, 0.5], [1.2, 2.05, 0.55]]) {
    box('Sack', 'Sack', [x - 0.22, x + 0.22], [0, h], [z - 0.2, z + 0.2], { r: 0.3, x: [x - 0.15, x + 0.15], z: [z - 0.13, z + 0.13] });
    box('Sack.Tie', 'WoodDark', [x - 0.12, x + 0.12], [h - 0.08, h - 0.04], [z - 0.1, z + 0.1], { r: 0.3 });
  }
  crate(m, [1.45, 1.95], 0, [1.2, 1.7]);
  write(dir, 'mill', header('mill', 'Muehle',
    '# Die Objekte Sails.* drehen sich im Spiel um ihre Mitte (die Nabe), Blickachse\n# nach vorn. Material Paint (die Haube) bekommt die Gebaeudefarbe aus dem Spiel.\n'), m, '0.780 0.290 0.330');
}

// --- Lumber camp: open shed with a log pile, chopping block and sawhorse,
// 5 m wide (size 1) ---------------------------------------------------------
function lumberCamp() {
  const m = model();
  const { box, beam } = m;
  const X = 2.2, ZF = 1.45, ZB = -1.5, YF = 2.9, YB = 2.35;

  // Posts with knee braces, beams.
  for (const x of [-X, X]) {
    box('Post', 'Wood', [x - 0.11, x + 0.11], [0, YF], [ZF - 0.11, ZF + 0.11], { r: 0.25 });
    box('Post', 'Wood', [x - 0.11, x + 0.11], [0, YB], [ZB - 0.11, ZB + 0.11], { r: 0.25 });
    box('Post.Foot', 'Stone', [x - 0.17, x + 0.17], [0, 0.12], [ZF - 0.17, ZF + 0.17], { r: 0.2 });
    box('Beam.Side', 'Timber', [x - 0.09, x + 0.09], [YB - 0.2, YB], [ZB - 0.15, ZF + 0.15], { y: [YF - 0.2, YF] });
    beam('Brace', 'Timber', [x, YF - 0.8, ZF], [x, YF - 0.2, ZF - 0.6], 0.09);
  }
  box('Beam.Front', 'Timber', [-X - 0.2, X + 0.2], [YF - 0.24, YF], [ZF - 0.12, ZF + 0.12]);
  box('Beam.Back', 'Timber', [-X - 0.2, X + 0.2], [YB - 0.24, YB], [ZB - 0.12, ZB + 0.12]);
  for (const s of [-1, 1]) beam('Brace', 'Timber', [s * (X - 0.6), YF - 0.24, ZF], [s * X, YF - 0.9, ZF], 0.09);

  // Back wall of vertical planks, low side walls of horizontal boards.
  for (let i = 0; i < 18; i++) {
    const x = -X + i * (2 * X / 18);
    box('Wall.Plank', i % 3 === 1 ? 'WoodLight' : 'Wood', [x, x + 2 * X / 18 - 0.015], [0, YB - 0.24 - (i % 2) * 0.03], [ZB - 0.06, ZB + 0.02]);
  }
  for (const x of [-X, X]) {
    for (let j = 0; j < 4; j++) box('Wall.Board', j % 2 ? 'WoodLight' : 'Wood', [x - 0.04, x + 0.04], [j * 0.26, j * 0.26 + 0.24], [ZB, ZF - 0.6]);
  }

  // Mono-pitch roof with planks and battens.
  const RX = 2.5, RF = 1.95, RB = -1.95;
  const yAt = (z) => YB + ((z - ZB) * (YF - YB)) / (ZF - ZB);
  m.extrude('Roof', 'Paint', 'x', [-RX, RX], [[RB, yAt(RB)], [RF, yAt(RF)], [RF, yAt(RF) + 0.12], [RB, yAt(RB) + 0.12]]);
  for (let i = 0; i <= 10; i++) {
    const x = -RX + 0.1 + i * ((2 * RX - 0.2) / 10);
    beam('Roof.Seam', 'Timber', [x, yAt(RB) + 0.13, RB], [x, yAt(RF) + 0.13, RF], 0.035);
  }
  for (const z of [RB + 0.05, RF - 0.05]) box('Roof.Edge', 'Timber', [-RX - 0.02, RX + 0.02], [yAt(z) - 0.02, yAt(z) + 0.16], [z - 0.05, z + 0.05]);

  // Log pile under the roof, four rows.
  const rows = [[0.2, [-1.2, -0.8, -0.4, 0, 0.4]], [0.54, [-1.0, -0.6, -0.2, 0.2]], [0.88, [-0.8, -0.4, 0]], [1.22, [-0.6, -0.2]]];
  rows.forEach(([y, zs], ri) => zs.forEach((z, i) => {
    const d = ((ri * 7 + i * 3) % 5) * 0.06 - 0.12;
    log(m, [-1.6 + d, 1.55 - d], y, z, 0.19);
  }));
  box('Pile.Stake', 'Wood', [-1.72, -1.64], [0, 1.2], [0.52, 0.6]);
  box('Pile.Stake', 'Wood', [1.62, 1.7], [0, 1.2], [0.52, 0.6]);
  // Planks stacked in the right corner, tools on the back wall.
  for (let j = 0; j < 6; j++) box('Planks', j % 2 ? 'WoodLight' : 'LogEnd', [1.72, 2.12], [0.06 + j * 0.08, 0.13 + j * 0.08], [-1.35, 0.6]);
  box('Planks.Spacer', 'Wood', [1.72, 2.12], [0, 0.06], [-1.2, -1.1]);
  box('Planks.Spacer', 'Wood', [1.72, 2.12], [0, 0.06], [0.35, 0.45]);
  for (const x of [-1.95, -1.75]) {
    box('Tool.Handle', 'WoodLight', [x - 0.02, x + 0.02], [1.2, 2.0], [ZB + 0.03, ZB + 0.07]);
    box('Tool.Head', 'Iron', [x - 0.03, x + 0.1], [1.2, 1.33], [ZB + 0.03, ZB + 0.08], { x: [x - 0.03, x + 0.03] });
  }
  box('Saw.Blade', 'Iron', [0.3, 1.2], [1.6, 1.72], [ZB + 0.03, ZB + 0.05], { x: [0.3, 1.1] });
  box('Saw.Handle', 'WoodLight', [1.2, 1.35], [1.6, 1.8], [ZB + 0.03, ZB + 0.07]);

  // Yard: chopping block with an axe, split firewood, sawhorse with a log.
  box('Block', 'Bark', [0.95, 1.55], [0, 0.5], [1.7, 2.3], { n: 10 });
  box('Block.Top', 'LogEnd', [0.97, 1.53], [0.5, 0.52], [1.72, 2.28], { n: 10 });
  beam('Axe.Handle', 'WoodLight', [1.2, 0.5, 1.95], [1.55, 1.05, 2.3], 0.05);
  box('Axe.Head', 'Iron', [1.1, 1.3], [0.47, 0.6], [1.9, 1.98], { x: [1.14, 1.26] });
  for (let i = 0; i < 7; i++) {
    const x = 1.75 + (i % 3) * 0.18, z = 1.75 + Math.floor(i / 3) * 0.2, y = i === 6 ? 0.14 : 0;
    box('Firewood', i % 2 ? 'LogEnd' : 'Bark', [x - 0.08, x + 0.08], [y, y + 0.14], [z - 0.07, z + 0.07], { n: 3, rot: i });
  }
  for (const x of [-1.25, -0.55]) {
    beam('Sawhorse.Leg', 'Wood', [x, 0, 1.75], [x, 0.8, 2.2], 0.07);
    beam('Sawhorse.Leg', 'Wood', [x, 0, 2.25], [x, 0.8, 1.8], 0.07);
  }
  log(m, [-1.7, -0.05], 0.9, 2.0, 0.14);
  box('Saw.Bow', 'Wood', [-0.9, -0.85], [1.05, 1.5], [1.9, 2.1]);
  lantern(m, 0, YF - 0.6, ZF + 0.02);
  box('Lantern.Chain', 'Iron', [-0.01, 0.01], [YF - 0.4, YF - 0.24], [ZF, ZF + 0.04]);
  write(dir, 'lumber_camp', header('lumber_camp', 'Holzlager', '# Material Paint (das Dach) bekommt die Gebaeudefarbe aus dem Spiel.\n'), m, '0.490 0.360 0.190');
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
  write(dir, 'mining_camp', header('mining_camp', 'Minenlager', '# Material Paint (das Dach) bekommt die Gebaeudefarbe aus dem Spiel.\n'), m, '0.590 0.600 0.640');
}

house();
townCenter();
mill();
lumberCamp();
miningCamp();
