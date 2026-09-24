// Field models - 3x3 tiles (15 m square) like the AoE2 farm: the staked-out
// outline and the crop in rows. Built by the game at
// start-up (src/gl/entityRenderer.ts) rather than stored as OBJ files: a
// wheat field is thousands of single stalks, megabytes as text.
//
// Every plant is one object "Crop.<row>.<c>.<cols>": the game shows per
// furrow what is sown and not yet harvested, and lets the plants grow out of
// the ground. The ploughed soil is painted by the terrain shader.
// No Node APIs here - tools/models/farms.mjs writes the OBJ files for a look.
import { model } from './primitives.mjs';

const PALETTE = {
  Wood: '0.420 0.290 0.170', Rope: '0.900 0.860 0.740', Paint: '0.251 0.627 0.282',
  Wheat: '0.820 0.700 0.450', WheatDark: '0.700 0.560 0.330', WheatStem: '0.760 0.660 0.400',
  WheatEar: '0.940 0.830 0.560',
  CornStalk: '0.460 0.590 0.230', CornLeaf: '0.380 0.560 0.200', CornCob: '1.000 0.840 0.220',
  CornHusk: '0.620 0.700 0.340', Tassel: '0.820 0.700 0.400',
  Vine: '0.360 0.480 0.180',
};

/** Half the field edge and half the planted area, metres. */
const HALF = 7.5;
// Planted right up to the edge, half a furrow's spacing from it: two fields
// side by side then continue each other's rows without a gap.
const INNER = HALF;

/** Deterministic random numbers, one stream per field. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/** Where the plants start, metres - they grow from here (FIELD_SOIL_METERS in the shader). */
const SOIL = 0.02;
/**
 * Furrows per field - the same for every crop (FIELD_ROWS in buildings.ts),
 * three per tile: a field may cover only some of its nine tiles, and the game
 * hides what lies on the missing ones. Plants per furrow are multiples of 3.
 */
const ROWS = 9;

/**
 * Round the plants: the staked-out outline. The ploughed soil itself is no
 * geometry - the terrain shader paints it (World.fieldSoil), so it lies
 * exactly on the ground.
 */
function ground(m) {
  // Staked out: pegs with a cord along every edge of every tile,
  // "Edge.<tile>.<side>" - the game shows only the edges on the outline of
  // the tiles the field has, so it is visible before anything is ploughed.
  const inset = 0.15;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const z0 = -HALF + 5 * i + inset, z1 = -HALF + 5 * (i + 1) - inset;
      const x0 = -HALF + 5 * j + inset, x1 = -HALF + 5 * (j + 1) - inset;
      // Sides: 0 = -z, 1 = +z, 2 = -x, 3 = +x (tile i along z, j along x).
      const sides = [[[x0, z0], [x1, z0]], [[x0, z1], [x1, z1]], [[x0, z0], [x0, z1]], [[x1, z0], [x1, z1]]];
      sides.forEach(([[ax, az], [bx, bz]], side) => {
        const name = `Edge.${i * 3 + j}.${side}`;
        for (const t of [0, 0.5, 1]) {
          const [px, pz] = [ax + (bx - ax) * t, az + (bz - az) * t];
          m.box(name, 'Wood', [px - 0.05, px + 0.05], [0, 0.5], [pz - 0.05, pz + 0.05], { x: [px - 0.03, px + 0.03], z: [pz - 0.03, pz + 0.03] });
          // Painted top in the player colour.
          m.box(name, 'Paint', [px - 0.045, px + 0.045], [0.42, 0.56], [pz - 0.045, pz + 0.045]);
        }
        // In pieces - the game lays the field on the terrain vertex by vertex,
        // a single 5 m cord would cut into a hill.
        for (let k = 0; k < 6; k++) {
          const [t0, t1] = [k / 6, (k + 1) / 6];
          m.beam(name, 'Rope', [ax + (bx - ax) * t0, 0.4, az + (bz - az) * t0], [ax + (bx - ax) * t1, 0.4, az + (bz - az) * t1], 0.03, { n: 3 });
        }
      });
    }
  }
  // Tiny markers at both edges give the model its width (15 m).
  m.box('Peg', 'Wood', [-HALF, -HALF + 0.001], [0, 0.001], [0, 0.001]);
  m.box('Peg', 'Wood', [HALF - 0.001, HALF], [0, 0.001], [0, 0.001]);
}

/**
 * Calls plant(name, x, z) for every plant: rows (furrows) along x, row r at
 * z. The name "Crop.<r>.<c>.<cols>" tells the game the furrow and the place
 * in it - each furrow has its own farmer, who sows from c = 0 on and
 * harvests from the far end back.
 */
function planted(rows, cols, plant) {
  const gapZ = (2 * INNER) / rows;
  const gapX = (2 * INNER) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      plant(`Crop.${r}.${c}.${cols}`, -INNER + (c + 0.5) * gapX, -INNER + (r + 0.5) * gapZ);
    }
  }
}

/**
 * Wheat like a real field: many single stalks, each with its ear, standing
 * close together and leaning a little this way and that.
 */
function wheat(detail = 1) {
  const m = model();
  const rnd = rng(11);
  const rows = ROWS, cols = 15;
  ground(m);
  const gapZ = (2 * INNER) / rows, gapX = (2 * INNER) / cols;
  planted(rows, cols, (name, x, z) => {
    // Unten dicht an dicht Blätter, die schräg aus dem Boden stehen - so
    // sieht man zwischen den Halmen nicht bis auf die Erde.
    for (let i = 0; i < Math.round(24 * detail); i++) {
      const px = x + (rnd() - 0.5) * gapX;
      const pz = z + (rnd() - 0.5) * gapZ * 0.95;
      const a = rnd() * Math.PI * 2;
      const len = 0.35 + rnd() * 0.25;
      const tip = [px + Math.cos(a) * len * 0.45, SOIL + len, pz + Math.sin(a) * len * 0.45];
      m.beam(name, 'WheatStem', [px, SOIL * 0.5, pz], tip, 0.09, { n: 3, w1: 0.01 });
    }
    for (let i = 0; i < Math.max(4, Math.round(60 * detail)); i++) {
      const px = x + (rnd() - 0.5) * gapX;
      const pz = z + (rnd() - 0.5) * gapZ * 0.95;
      const h = 0.8 + rnd() * 0.25;
      const lean = [(rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.14];
      const top = [px + lean[0], h, pz + lean[1]];
      m.beam(name, 'WheatStem', [px, SOIL * 0.5, pz], top, 0.03, { n: 3 });
      // The ear nods a little further in the direction the stalk leans.
      const len = 0.11 + rnd() * 0.05;
      const ear = [top[0] + lean[0] * 0.5, h + len, top[2] + lean[1] * 0.5];
      const tone = rnd();
      m.beam(name, tone < 0.55 ? 'WheatEar' : tone < 0.85 ? 'Wheat' : 'WheatDark', top, ear, 0.07, { n: 3, w1: 0.03 });
    }
  });
  return m;
}

/**
 * Maize: dense stands of tall stalks - two rows of plants per furrow - with
 * long hanging leaves, a tassel on top and yellow cobs that stick out of
 * their husks, which are peeled back at the tip.
 */
function corn(detail = 1) {
  const m = model();
  const rnd = rng(23);
  const rows = ROWS, cols = 9;
  ground(m);
  const gapZ = (2 * INNER) / rows, gapX = (2 * INNER) / cols;
  planted(rows, cols, (name, x, z) => {
    // Fewer plants in the simpler versions (every second or fourth).
    const stride = detail >= 1 ? 1 : detail >= 0.3 ? 2 : 4;
    for (let k = 0; k < 8; k += stride) {
      const px = x + ((k % 4) + 0.5 - 2) * (gapX / 4) + (rnd() - 0.5) * 0.12;
      const pz = z + (k < 4 ? -0.22 : 0.22) * gapZ + (rnd() - 0.5) * 0.1;
      const h = 2.0 + rnd() * 0.45;
      m.beam(name, 'CornStalk', [px, SOIL * 0.5, pz], [px, h, pz], 0.07, { w1: 0.04 });
      // Leaves: out from the stalk and drooping at the tip.
      const turn = rnd() * Math.PI;
      for (let i = 0; i < 5; i++) {
        const a = turn + i * 2.4;
        const y = 0.4 + i * 0.32;
        const len = 0.65 - i * 0.06;
        const mid = [px + Math.cos(a) * len * 0.6, y + 0.28, pz + Math.sin(a) * len * 0.6];
        const tip = [px + Math.cos(a) * len, y + 0.02, pz + Math.sin(a) * len];
        m.beam(name, 'CornLeaf', [px, y, pz], mid, 0.09, { w1: 0.07, n: 3 });
        m.beam(name, 'CornLeaf', mid, tip, 0.07, { w1: 0.015, n: 3 });
      }
      // One or two cobs, leaning out from the stalk: the husk at the base,
      // the yellow cob well out of it.
      for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) {
        const a = turn + 1.2 + i * 3;
        const y = 0.95 + i * 0.3 + rnd() * 0.1;
        const [dx, dz] = [Math.cos(a), Math.sin(a)];
        const base = [px + dx * 0.04, y, pz + dz * 0.04];
        const mid = [px + dx * 0.12, y + 0.14, pz + dz * 0.12];
        const tip = [px + dx * 0.24, y + 0.38, pz + dz * 0.24];
        m.beam(name, 'CornHusk', base, mid, 0.13, { w1: 0.12, n: 6 });
        m.beam(name, 'CornCob', mid, tip, 0.11, { w1: 0.07, n: 6 });
        // Husk leaves peeled back from the cob.
        for (const s of [-1, 1]) {
          m.beam(name, 'CornHusk', mid, [mid[0] + dx * 0.02 - dz * 0.1 * s, mid[1] + 0.12, mid[2] + dz * 0.02 + dx * 0.1 * s], 0.07, { w1: 0.01, n: 3 });
        }
      }
      // Tassel.
      for (let i = 0; i < 3; i++) {
        const a = turn + i * 2.1;
        m.beam(name, 'Tassel', [px, h - 0.05, pz], [px + Math.cos(a) * 0.16, h + 0.28, pz + Math.sin(a) * 0.16], 0.035, { w1: 0.012, n: 3 });
      }
    }
  });
  return m;
}

/** The fields, in the order of the SHAPE numbers (farmWheat, farmCorn). */
export const FARM_KINDS = ['wheat', 'corn'];
const MAKE = { wheat, corn };

/**
 * OBJ and MTL text of one field. `detail` < 1 gives the simpler versions for
 * zooming out: fewer stalks of wheat, fewer maize plants (0.3 and 0.1).
 */
export function farmModel(kind, detail = 1) {
  const m = MAKE[kind](detail);
  const obj = `# farm_${kind}.obj (tools/models/farmsGen.mjs)\nmtllib farm_${kind}.mtl\n${m.out.join('\n')}\n`;
  let mtl = `# farm_${kind}.mtl\n`;
  for (const n of [...m.used].sort()) {
    mtl += `\nnewmtl ${n}\nKd ${PALETTE[n]}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`;
  }
  return { obj, mtl };
}
