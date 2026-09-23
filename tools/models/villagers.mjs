// Generates src/models/villager_male.obj and villager_female.obj - villagers in
// the style of Age of Empires II. File coords: x = left, y = up, z = front.
// Usage: node tools/models/villagers.mjs [outDir] (default src/models)
import { writeFileSync } from 'node:fs';

const mirror = ([a, b]) => [-b, -a];

function model() {
  const out = [];
  let base = 0;
  /** Outline of rect [x0,x1]x[z0,z1], corners cut by r (0 = box, 0.3 = nearly round octagon). */
  function ring([x0, x1], [z0, z1], y, r) {
    if (r <= 0) return [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];
    const cx = r * (x1 - x0);
    const cz = r * (z1 - z0);
    return [
      [x0 + cx, y, z0], [x0, y, z0 + cz], [x0, y, z1 - cz], [x0 + cx, y, z1],
      [x1 - cx, y, z1], [x1, y, z1 - cz], [x1, y, z0 + cz], [x1 - cx, y, z0],
    ];
  }
  /**
   * Frustum: bottom rect [x0,x1]x[z0,z1] at y0, top rect at y1 (top defaults to
   * bottom). o.r rounds the corners.
   */
  function box(name, mtl, x, [y0, y1], z, o = {}) {
    const r = o.r ?? 0;
    const bottom = ring(x, z, y0, r);
    const top = ring(o.x ?? x, o.z ?? z, y1, r);
    const n = bottom.length;
    out.push(`o ${name}`);
    for (const p of [...bottom, ...top]) out.push(`v ${p.map((v) => +v.toFixed(3)).join(' ')}`);
    out.push(`usemtl ${mtl}`, 's off');
    const b = (i) => base + 1 + (i % n);
    const t = (i) => base + 1 + n + (i % n);
    out.push(`f ${bottom.map((_, i) => b(n - 1 - i)).join(' ')}`);
    out.push(`f ${top.map((_, i) => t(i)).join(' ')}`);
    for (let i = 0; i < n; i++) out.push(`f ${b(i)} ${b(i + 1)} ${t(i + 1)} ${t(i)}`);
    base += 2 * n;
  }
  /** Left part at x > 0, right part mirrored to x < 0. '#' becomes L or R. */
  function pair(name, mtl, x, y, z, o = {}) {
    box(name.replace('#', 'L'), mtl, x, y, z, o);
    box(name.replace('#', 'R'), mtl, mirror(x), y, z, o.x ? { ...o, x: mirror(o.x) } : o);
  }
  return { box, pair, out };
}

/** Head centred on x = z = 0 (it turns around its vertical axis), chin at h. */
function head({ box, pair }, h, male) {
  box('Head', 'Skin', [-0.108, 0.108], [h, h + 0.26], [-0.11, 0.108], { x: [-0.118, 0.118], z: [-0.12, 0.116], r: 0.2 });
  box('Head.Jaw', 'Skin', [-0.085, 0.085], [h - 0.02, h + 0.05], [-0.02, 0.1], { x: [-0.104, 0.104], z: [-0.04, 0.108], r: 0.2 });
  box('Head.Nose', 'Skin', [-0.022, 0.022], [h + 0.095, h + 0.165], [0.105, 0.148], { x: [-0.012, 0.012], z: [0.105, 0.124] });
  pair('Head.Nostril.#', 'SkinShade', [0.006, 0.018], [h + 0.095, h + 0.102], [0.13, 0.142]);
  pair('Head.Cheek.#', 'Skin', [0.05, 0.1], [h + 0.07, h + 0.14], [0.095, 0.116], { z: [0.095, 0.112], r: 0.3 });
  pair('Head.EyeWhite.#', 'EyeWhite', [0.03, 0.08], [h + 0.155, h + 0.188], [0.108, 0.118]);
  pair('Head.Eye.#', 'Eyes', [0.044, 0.068], [h + 0.157, h + 0.186], [0.114, 0.121]);
  pair('Head.Lid.#', 'SkinShade', [0.028, 0.082], [h + 0.186, h + 0.196], [0.108, 0.12]);
  pair('Head.Brow.#', 'Hair', [0.024, 0.088], [h + 0.2, h + 0.216], [0.11, 0.125], { x: [0.03, 0.084] });
  box('Head.Mouth', 'Lips', [-0.034, 0.034], [h + 0.064, h + 0.08], [0.104, 0.116], { x: [-0.03, 0.03] });
  pair('Head.Ear.#', 'Skin', [0.11, 0.134], [h + 0.1, h + 0.18], [-0.035, 0.02], { r: 0.3 });
  pair('Head.Ear.Inner.#', 'SkinShade', [0.132, 0.136], [h + 0.115, h + 0.165], [-0.022, 0.008]);
  box('Head.Hair.Top', 'Hair', [-0.126, 0.126], [h + 0.215, h + 0.305], [-0.13, 0.124], { x: [-0.095, 0.095], z: [-0.1, 0.1], r: 0.3 });
  box('Head.Hair.Back', 'Hair', [-0.122, 0.122], [h + 0.06, h + 0.23], [-0.13, -0.02], { x: [-0.126, 0.126], r: 0.25 });
  pair('Head.Hair.Side.#', 'Hair', [0.112, 0.128], [h + 0.17, h + 0.23], [-0.03, 0.08]);
  if (male) {
    // Tousled fringe, short full beard along the jaw, moustache.
    for (const [x, len] of [[-0.075, 0.05], [-0.025, 0.065], [0.025, 0.055], [0.075, 0.045]]) {
      box('Head.Hair.Fringe', 'Hair', [x - 0.03, x + 0.03], [h + 0.215 - len, h + 0.235], [0.1, 0.13], { x: [x - 0.035, x + 0.035] });
    }
    box('Head.Beard', 'Hair', [-0.08, 0.08], [h - 0.045, h + 0.06], [0.03, 0.118], { x: [-0.108, 0.108], z: [0.0, 0.114], r: 0.25 });
    pair('Head.Beard.Side.#', 'Hair', [0.098, 0.122], [h + 0.0, h + 0.16], [-0.03, 0.105], { z: [-0.03, 0.07] });
    box('Head.Moustache', 'Hair', [-0.05, 0.05], [h + 0.078, h + 0.098], [0.104, 0.124], { x: [-0.042, 0.042] });
    box('Head.Mouth.Gap', 'Lips', [-0.028, 0.028], [h + 0.062, h + 0.078], [0.112, 0.12]);
  } else {
    // Parted fringe, hair gathered in a bun with a tie, a lock over each ear.
    pair('Head.Hair.Fringe.#', 'Hair', [0.005, 0.11], [h + 0.19, h + 0.235], [0.1, 0.13], { x: [0.0, 0.1] });
    box('Head.Hair.Bun', 'Hair', [-0.07, 0.07], [h + 0.15, h + 0.29], [-0.19, -0.09], { x: [-0.055, 0.055], z: [-0.175, -0.09], r: 0.3 });
    box('Head.Hair.Tie', 'Band', [-0.058, 0.058], [h + 0.2, h + 0.225], [-0.12, -0.08], { r: 0.2 });
    pair('Head.Hair.Lock.#', 'Hair', [0.108, 0.13], [h + 0.02, h + 0.18], [0.025, 0.08], { x: [0.11, 0.128] });
    pair('Head.Lash.#', 'Eyes', [0.078, 0.088], [h + 0.18, h + 0.192], [0.11, 0.12]);
  }
}

/** Hand at the end of the forearm: palm, curled fingers and thumb (x = outer edge side range). */
function hand({ pair }, [x0, x1], top) {
  const w = x1 - x0;
  pair('Arm.#.Lower.Hand', 'Skin', [x0, x1], [top - 0.07, top], [-0.042, 0.042], { z: [-0.036, 0.036], r: 0.2 });
  pair('Arm.#.Lower.Fingers', 'Skin', [x0 + w * 0.08, x1 - w * 0.05], [top - 0.12, top - 0.07], [-0.03, 0.045], { z: [-0.038, 0.042], r: 0.25 });
  pair('Arm.#.Lower.Knuckles', 'SkinShade', [x0 + w * 0.1, x1 - w * 0.08], [top - 0.085, top - 0.075], [0.042, 0.047]);
  pair('Arm.#.Lower.Thumb', 'Skin', [x0 - 0.012, x0 + w * 0.25], [top - 0.1, top - 0.03], [0.015, 0.05], { x: [x0 - 0.004, x0 + w * 0.3], r: 0.2 });
}

/** Hatchet in the right hand, held forward - it swings along with the chop. */
function hatchet({ box }, [x0, x1], gy) {
  const hc = -(x0 + x1) / 2;
  box('Arm.R.Lower.Tool.Handle', 'Wood', [hc - 0.015, hc + 0.015], [gy - 0.017, gy + 0.017], [-0.08, 0.35], { r: 0.25 });
  box('Arm.R.Lower.Tool.Grip', 'Leather', [hc - 0.02, hc + 0.02], [gy - 0.022, gy + 0.022], [-0.08, 0.05], { r: 0.25 });
  box('Arm.R.Lower.Tool.Wedge', 'Iron', [hc - 0.02, hc + 0.02], [gy - 0.03, gy + 0.03], [0.28, 0.33]);
  box('Arm.R.Lower.Tool.Head', 'Iron', [hc - 0.012, hc + 0.012], [gy - 0.09, gy + 0.03], [0.27, 0.34], { z: [0.29, 0.34] });
  box('Arm.R.Lower.Tool.Edge', 'Steel', [hc - 0.007, hc + 0.007], [gy - 0.115, gy + 0.02], [0.24, 0.272], { z: [0.265, 0.292] });
}

/** Sack on the back - grows out of the back with the load, tinted by resource. */
function load({ box, pair }, back) {
  box('Load', 'Load', [-0.16, 0.16], [0.86, 1.26], [back - 0.21, back], { x: [-0.14, 0.14], z: [back - 0.19, back], r: 0.2 });
  box('Load.Top', 'Load', [-0.075, 0.075], [1.26, 1.32], [back - 0.15, back - 0.06], { x: [-0.05, 0.05], r: 0.3 });
  box('Load.Rope', 'Rope', [-0.166, 0.166], [1.02, 1.055], [back - 0.216, back], { r: 0.2 });
  box('Load.Knot', 'Rope', [-0.03, 0.03], [1.25, 1.29], [back - 0.16, back - 0.05], { r: 0.3 });
  pair('Load.Patch.#', 'LoadShade', [0.06, 0.12], [1.1, 1.18], [back - 0.212, back - 0.2]);
}

function male() {
  const m = model();
  const { box, pair } = m;
  const hip = 0.82;
  const knee = 0.5;
  const sh = 1.4;
  const elbow = sh - 0.34;

  // Lower legs bend at the knee: cuffed laced boots, trousers to the knee.
  pair('Leg.#.Lower.Sole', 'BootsDark', [0.048, 0.17], [0, 0.03], [-0.085, 0.168], { r: 0.2 });
  pair('Leg.#.Lower.Boot', 'Boots', [0.052, 0.166], [0.03, 0.12], [-0.08, 0.162], { z: [-0.075, 0.07], r: 0.2 });
  pair('Leg.#.Lower.Toe', 'Boots', [0.058, 0.16], [0.03, 0.085], [0.1, 0.17], { z: [0.1, 0.15], r: 0.3 });
  pair('Leg.#.Lower.Shaft', 'Boots', [0.056, 0.162], [0.12, 0.33], [-0.072, 0.072], { r: 0.25 });
  for (const y of [0.15, 0.2, 0.25]) pair('Leg.#.Lower.Lace', 'Leather', [0.085, 0.135], [y, y + 0.012], [0.07, 0.078]);
  pair('Leg.#.Lower.Cuff', 'BootsLight', [0.045, 0.173], [0.3, 0.37], [-0.082, 0.082], { x: [0.042, 0.176], z: [-0.086, 0.086], r: 0.25 });
  pair('Leg.#.Lower.Shin', 'Tunic', [0.052, 0.166], [0.34, knee], [-0.074, 0.074], { x: [0.047, 0.17], z: [-0.08, 0.08], r: 0.25 });
  box('Leg.L.Lower.Patch', 'Patch', [0.075, 0.145], [knee - 0.09, knee - 0.02], [0.074, 0.084]);
  // Thighs swing at the hip; they reach below the knee so it never gaps.
  pair('Leg.#', 'Tunic', [0.048, 0.17], [knee - 0.05, hip], [-0.082, 0.082], { x: [0.012, 0.2], z: [-0.105, 0.105], r: 0.25 });
  pair('Leg.#.Fold', 'Tunic', [0.07, 0.15], [knee + 0.1, knee + 0.14], [0.08, 0.095], { z: [0.085, 0.1] });

  // Trousers up to the belt, bare muscular upper body.
  box('Hips', 'Tunic', [-0.195, 0.195], [hip - 0.1, hip + 0.1], [-0.11, 0.11], { x: [-0.2, 0.2], z: [-0.112, 0.112], r: 0.2 });
  box('Belt', 'Leather', [-0.206, 0.206], [hip + 0.06, hip + 0.125], [-0.119, 0.119], { r: 0.2 });
  box('Belt.Buckle', 'Brass', [-0.035, 0.035], [hip + 0.064, hip + 0.121], [0.114, 0.13]);
  box('Belt.Tongue', 'Leather', [-0.012, 0.012], [hip + 0.08, hip + 0.105], [0.128, 0.134]);
  box('Belt.Pouch', 'LeatherLight', [-0.2, -0.11], [hip - 0.05, hip + 0.09], [0.07, 0.152], { z: [0.08, 0.14], r: 0.2 });
  box('Belt.Pouch.Flap', 'Leather', [-0.203, -0.107], [hip + 0.035, hip + 0.09], [0.068, 0.155], { r: 0.15 });
  box('Belt.Knife', 'Leather', [0.17, 0.2], [hip - 0.1, hip + 0.1], [-0.02, 0.05], { x: [0.17, 0.205] });
  box('Belt.Knife.Hilt', 'Wood', [0.176, 0.196], [hip + 0.1, hip + 0.16], [-0.004, 0.034], { r: 0.25 });
  box('Belly', 'Skin', [-0.185, 0.185], [hip + 0.1, 1.12], [-0.105, 0.105], { x: [-0.2, 0.2], z: [-0.11, 0.11], r: 0.25 });
  box('Abs', 'Skin', [-0.075, 0.075], [hip + 0.13, 1.12], [0.095, 0.113], { x: [-0.085, 0.085], r: 0.2 });
  box('Abs.Line', 'SkinShade', [-0.005, 0.005], [hip + 0.13, 1.12], [0.112, 0.115]);
  for (const y of [0.99, 1.05]) box('Abs.Row', 'SkinShade', [-0.07, 0.07], [y, y + 0.008], [0.111, 0.114]);
  box('Navel', 'SkinShade', [-0.01, 0.01], [0.955, 0.97], [0.111, 0.115]);
  box('Chest', 'Skin', [-0.2, 0.2], [1.12, sh], [-0.11, 0.11], { x: [-0.25, 0.25], z: [-0.12, 0.12], r: 0.2 });
  pair('Chest.Pec.#', 'Skin', [0.008, 0.175], [1.19, 1.33], [0.1, 0.142], { z: [0.1, 0.13], r: 0.2 });
  pair('Chest.Nipple.#', 'SkinShade', [0.085, 0.105], [1.22, 1.238], [0.138, 0.144]);
  pair('Chest.Collarbone.#', 'Skin', [0.04, 0.2], [sh - 0.04, sh - 0.015], [0.1, 0.125], { x: [0.05, 0.21] });
  box('Traps', 'Skin', [-0.15, 0.15], [sh - 0.03, sh + 0.035], [-0.08, 0.06], { x: [-0.075, 0.075], z: [-0.06, 0.04], r: 0.2 });
  box('Neck', 'Skin', [-0.058, 0.058], [sh - 0.03, sh + 0.06], [-0.058, 0.058], { r: 0.25 });
  box('Back.Blades', 'Skin', [-0.18, 0.18], [1.16, 1.34], [-0.132, -0.11], { x: [-0.2, 0.2], r: 0.2 });
  box('Back.Spine', 'SkinShade', [-0.006, 0.006], [0.95, 1.3], [-0.134, -0.12]);

  head(m, sh + 0.04, true);

  // Upper arms swing at the shoulder: round deltoid and biceps, reaching
  // below the elbow. The forearm with a leather wrap bends at the elbow.
  pair('Arm.#', 'Skin', [0.252, 0.334], [elbow - 0.04, sh], [-0.06, 0.06], { x: [0.232, 0.372], z: [-0.086, 0.086], r: 0.3 });
  pair('Arm.#.Bicep', 'Skin', [0.264, 0.326], [sh - 0.28, sh - 0.12], [0.03, 0.078], { z: [0.03, 0.068], r: 0.3 });
  pair('Arm.#.Lower', 'Skin', [0.26, 0.32], [sh - 0.56, elbow], [-0.044, 0.044], { x: [0.252, 0.332], z: [-0.058, 0.058], r: 0.3 });
  pair('Arm.#.Lower.Wrap', 'Leather', [0.254, 0.326], [sh - 0.565, sh - 0.47], [-0.05, 0.05], { x: [0.252, 0.33], z: [-0.053, 0.053], r: 0.25 });
  pair('Arm.#.Lower.Wrap.Band', 'LeatherLight', [0.252, 0.328], [sh - 0.52, sh - 0.505], [-0.054, 0.054], { r: 0.25 });
  hand(m, [0.26, 0.322], sh - 0.56);

  hatchet(m, [0.26, 0.322], sh - 0.64);
  load(m, -0.13);
  return m.out.join('\n');
}

function female() {
  const m = model();
  const { box, pair } = m;
  const hip = 0.8;
  const knee = 0.46;
  const sh = 1.36;
  const elbow = sh - 0.33;

  // Legs - mostly under the skirt, shoes and stockings show when she walks.
  pair('Leg.#.Lower.Shoe', 'Boots', [0.055, 0.15], [0, 0.08], [-0.07, 0.145], { z: [-0.065, 0.07], r: 0.25 });
  pair('Leg.#.Lower.Strap', 'BootsDark', [0.053, 0.152], [0.055, 0.07], [0.02, 0.1]);
  pair('Leg.#.Lower.Shin', 'Wool', [0.062, 0.145], [0.08, knee], [-0.05, 0.05], { x: [0.05, 0.155], z: [-0.065, 0.065], r: 0.3 });
  pair('Leg.#', 'Wool', [0.05, 0.155], [knee - 0.05, hip], [-0.065, 0.065], { x: [0.02, 0.19], z: [-0.09, 0.09], r: 0.3 });

  // Long skirt with folds and laced bodice in the player's colour, white
  // petticoat edge, apron with pocket and a bow at the back, white blouse.
  const waist = 0.97;
  box('Skirt', 'Tunic', [-0.29, 0.29], [0.1, waist], [-0.25, 0.27], { x: [-0.17, 0.17], z: [-0.11, 0.11], r: 0.22 });
  for (const x of [-0.24, 0.24]) {
    box('Skirt.Fold', 'Tunic', [x - 0.03, x + 0.03], [0.1, waist - 0.1], [0.19, 0.225], { x: [x * 0.62 - 0.015, x * 0.62 + 0.015], z: [0.1, 0.12] });
  }
  for (const x of [-0.18, 0, 0.18]) {
    box('Skirt.Fold', 'Tunic', [x - 0.035, x + 0.035], [0.1, waist - 0.1], [-0.265, -0.235], { x: [x * 0.6 - 0.015, x * 0.6 + 0.015], z: [-0.13, -0.11] });
  }
  box('Skirt.Petticoat', 'Wool', [-0.296, 0.296], [0.065, 0.12], [-0.256, 0.276], { r: 0.22 });
  box('Apron', 'Apron', [-0.19, 0.19], [0.18, waist - 0.02], [0.257, 0.27], { x: [-0.13, 0.13], z: [0.112, 0.124] });
  box('Apron.Hem', 'ApronShade', [-0.19, 0.19], [0.18, 0.22], [0.262, 0.276]);
  box('Apron.Pocket', 'ApronShade', [-0.13, -0.02], [0.52, 0.64], [0.2, 0.216], { z: [0.18, 0.196] });
  box('Apron.Band', 'Apron', [-0.176, 0.176], [waist - 0.03, waist + 0.02], [-0.118, 0.118], { r: 0.2 });
  pair('Apron.Bow.#', 'Apron', [0.005, 0.065], [waist - 0.035, waist + 0.035], [-0.132, -0.114], { x: [0.01, 0.08] });
  pair('Apron.Tie.#', 'Apron', [0.01, 0.035], [waist - 0.22, waist - 0.02], [-0.14, -0.12], { x: [0.015, 0.04] });
  box('Bodice', 'Tunic', [-0.165, 0.165], [waist, sh - 0.06], [-0.105, 0.105], { x: [-0.19, 0.19], z: [-0.11, 0.11], r: 0.2 });
  pair('Bodice.Bust.#', 'Tunic', [0.02, 0.15], [1.1, 1.24], [0.085, 0.145], { z: [0.095, 0.125], r: 0.25 });
  box('Bodice.Lace', 'Leather', [-0.008, 0.008], [waist + 0.02, 1.23], [0.104, 0.114]);
  for (const y of [1.0, 1.05, 1.1, 1.15, 1.2]) box('Bodice.Lace.Cross', 'Leather', [-0.026, 0.026], [y, y + 0.009], [0.106, 0.116]);
  box('Blouse', 'Wool', [-0.19, 0.19], [sh - 0.08, sh + 0.01], [-0.112, 0.112], { x: [-0.15, 0.15], z: [-0.09, 0.09], r: 0.2 });
  box('Blouse.Frill', 'WoolShade', [-0.14, 0.14], [sh - 0.005, sh + 0.02], [-0.088, 0.092], { r: 0.25 });
  box('Neck', 'Skin', [-0.05, 0.05], [sh - 0.02, sh + 0.06], [-0.05, 0.05], { r: 0.25 });
  box('Necklace', 'Leather', [-0.056, 0.056], [sh + 0.005, sh + 0.018], [-0.056, 0.056], { r: 0.3 });
  box('Necklace.Pendant', 'Brass', [-0.014, 0.014], [sh - 0.04, sh - 0.005], [0.085, 0.098]);

  head(m, sh + 0.04, false);

  // Arms: puffed white sleeves rolled up at the elbow; bare forearm bends there.
  pair('Arm.#', 'Wool', [0.2, 0.285], [elbow - 0.03, sh], [-0.068, 0.068], { x: [0.188, 0.302], z: [-0.08, 0.08], r: 0.3 });
  pair('Arm.#.Puff', 'Wool', [0.192, 0.3], [sh - 0.16, sh - 0.02], [-0.082, 0.082], { x: [0.19, 0.3], r: 0.35 });
  pair('Arm.#.Cuff', 'WoolShade', [0.196, 0.29], [elbow - 0.01, elbow + 0.05], [-0.074, 0.074], { r: 0.3 });
  pair('Arm.#.Lower', 'Skin', [0.213, 0.267], [sh - 0.54, elbow], [-0.04, 0.04], { x: [0.207, 0.277], z: [-0.052, 0.052], r: 0.3 });
  pair('Arm.#.Lower.Bracelet', 'Band', [0.21, 0.27], [sh - 0.53, sh - 0.51], [-0.043, 0.043], { r: 0.3 });
  hand(m, [0.212, 0.268], sh - 0.54);

  hatchet(m, [0.212, 0.268], sh - 0.62);
  load(m, -0.125);
  return m.out.join('\n');
}

const header = (what) => `# villager_${what}.obj - ${what === 'female' ? 'Dorfbewohnerin' : 'Dorfbewohner'} fuer procedurally-generated-map
# Erzeugt aus Quadern und Pyramidenstuempfen. Einheiten: Meter, Y oben, Blick
# nach +Z - so wie Blender eine Figur exportiert (Standard-Achsen beim OBJ-Export).
# Die Objektnamen steuern die Animation: Leg.L/Leg.R schwingen an der Huefte,
# Leg.*.Lower (Unterschenkel) knickt zusaetzlich am Knie; Arm.L/Arm.R schwingen
# an der Schulter, Arm.*.Lower (Unterarm, Hand, Beil) am Ellbogen. Head (samt
# Haaren) dreht sich, Load waechst mit der Ladung. Material Tunic
# (${what === 'female' ? 'Kleid' : 'Hose'}) bekommt die Spielerfarbe, Load die Farbe der Ressource.
mtllib villager.mtl
`;
// Farben beider Figuren - Tunic bekommt im Spiel die Spielerfarbe, Load die der Ressource.
const MATERIALS = {
  Tunic: '0.275 0.431 0.745',
  Skin: '0.900 0.700 0.540',
  SkinShade: '0.720 0.520 0.390',
  Load: '0.470 0.340 0.200',
  Hair: '0.420 0.240 0.120',
  Eyes: '0.100 0.070 0.050',
  EyeWhite: '0.950 0.940 0.900',
  Lips: '0.740 0.420 0.370',
  Boots: '0.420 0.270 0.150',
  BootsDark: '0.220 0.140 0.080',
  BootsLight: '0.540 0.370 0.220',
  Leather: '0.300 0.180 0.100',
  LeatherLight: '0.500 0.340 0.190',
  Brass: '0.850 0.680 0.300',
  Wool: '0.920 0.900 0.840',
  WoolShade: '0.800 0.780 0.720',
  Apron: '0.960 0.950 0.920',
  ApronShade: '0.840 0.820 0.780',
  Wood: '0.550 0.380 0.220',
  Iron: '0.450 0.460 0.490',
  Steel: '0.780 0.800 0.830',
  Rope: '0.720 0.620 0.420',
  Patch: '0.560 0.450 0.300',
  Band: '0.700 0.200 0.180',
  LoadShade: '0.360 0.260 0.150',
};

const dir = process.argv[2] ?? new URL('../../src/models', import.meta.url).pathname;
writeFileSync(`${dir}/villager_male.obj`, header('male') + male() + '\n');
writeFileSync(`${dir}/villager_female.obj`, header('female') + female() + '\n');
writeFileSync(`${dir}/villager.mtl`, '# villager.mtl - gemeinsam fuer villager_male.obj und villager_female.obj\n' +
  Object.entries(MATERIALS).map(([n, kd]) => `\nnewmtl ${n}\nKd ${kd}\nKa 0 0 0\nKs 0 0 0\nd 1\nillum 1\n`).join(''));
