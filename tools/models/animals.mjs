// Generates src/models/deer.obj, hare.obj, cow.obj, sheep.obj, goat.obj and
// boar.obj - game to hunt: a roe buck, a brown hare, a spotted cow, a woolly
// sheep, a horned goat and a wild boar, facing +z.
// Metres, real size (the game scales them by height).
// Object names drive the animation (see PARTS in src/gl/entityRenderer.ts):
// "Leg.FL/FR/BL/BR" swing from their top (front/back, left/right), "Head"
// (with the neck) dips to graze, pivoting at its lowest back point.
// Usage: node tools/models/animals.mjs [outDir] (default src/models)
import { model, write, PALETTE } from './lib.mjs';

const dir = process.argv[2] ?? new URL('../../src/models', import.meta.url).pathname;

Object.assign(PALETTE, {
  Fur: '0.560 0.360 0.200', FurDark: '0.400 0.250 0.140', FurLight: '0.820 0.720 0.560',
  Rump: '0.950 0.930 0.880', Hoof: '0.160 0.130 0.110', Nose: '0.080 0.070 0.070',
  Eye: '0.050 0.040 0.040', Antler: '0.820 0.760 0.640',
  HareFur: '0.620 0.500 0.350', HareDark: '0.420 0.330 0.230', HareLight: '0.880 0.820 0.720',
  EarTip: '0.120 0.100 0.090',
  CowWhite: '0.920 0.900 0.860', CowBlack: '0.110 0.100 0.100', Udder: '0.900 0.640 0.620',
  CowMuzzle: '0.860 0.620 0.580', Horn: '0.880 0.840 0.740',
  GoatFur: '0.520 0.380 0.250', GoatLight: '0.860 0.800 0.700', GoatDark: '0.220 0.160 0.110',
  Boar: '0.380 0.300 0.230', BoarDark: '0.220 0.170 0.130', Snout: '0.520 0.400 0.360', Tusk: '0.930 0.900 0.820',
  Wool: '0.900 0.870 0.800', WoolShade: '0.800 0.770 0.700', SheepFace: '0.180 0.150 0.140',
});

// Rund statt eckig: Körper, Köpfe und Mäuler sind Ellipsoide, Beine und Hälse
// achteckige (dünne: sechseckige) Balken. Jedes Tier hat einen Hals, dessen
// Ansatz der tiefste Punkt von "Head" ist - dort dreht sich der Kopf beim Äsen.
const LEG = { n: 6 };
const NECK = { n: 8 };

/** Roe buck: slim body on long legs, white rump patch, short forked antlers. */
function deer() {
  const m = model();
  m.ellipsoid('Body', 'Fur', [0, 0.67, -0.03], [0.15, 0.16, 0.46], { around: 12 });
  m.ellipsoid('Body.Withers', 'Fur', [0, 0.76, 0.24], [0.12, 0.11, 0.18]);
  m.ellipsoid('Body.Belly', 'FurLight', [0, 0.57, -0.03], [0.11, 0.07, 0.34]);
  m.ellipsoid('Body.Rump', 'Rump', [0, 0.69, -0.45], [0.11, 0.11, 0.06]);
  m.ellipsoid('Body.Tail', 'Rump', [0, 0.77, -0.5], [0.03, 0.04, 0.03], { around: 6, rings: 4 });
  // Neck and head in one - it dips to graze.
  m.beam('Head.Neck', 'Fur', [0, 0.7, 0.32], [0, 1.02, 0.52], 0.15, { ...NECK, w1: 0.1 });
  m.ellipsoid('Head.Skull', 'Fur', [0, 1.06, 0.55], [0.07, 0.075, 0.1], { pitch: 0.3 });
  m.ellipsoid('Head.Muzzle', 'FurDark', [0, 1.02, 0.68], [0.045, 0.045, 0.08], { around: 8 });
  m.ellipsoid('Head.Nose', 'Nose', [0, 1.025, 0.755], [0.03, 0.025, 0.02], { around: 6, rings: 4 });
  for (const s of [-1, 1]) {
    m.ellipsoid('Head.Eye', 'Eye', [s * 0.062, 1.085, 0.6], [0.014, 0.014, 0.014], { around: 6, rings: 4 });
    // Ears to the side and up, antlers between them.
    m.beam('Head.Ear', 'Fur', [s * 0.05, 1.11, 0.5], [s * 0.15, 1.23, 0.46], 0.07, { ...LEG, w1: 0.03 });
    m.beam('Head.Antler', 'Antler', [s * 0.03, 1.11, 0.52], [s * 0.05, 1.32, 0.5], 0.03, { ...LEG, w1: 0.018 });
    m.beam('Head.Antler', 'Antler', [s * 0.045, 1.22, 0.51], [s * 0.05, 1.28, 0.58], 0.02, { ...LEG, w1: 0.012 });
  }
  // Legs: thigh thick at the top, thin cannon, dark hoof.
  for (const [name, x, z] of [['FL', 0.085, 0.3], ['FR', -0.085, 0.3], ['BL', 0.09, -0.36], ['BR', -0.09, -0.36]]) {
    const back = name[0] === 'B';
    m.beam(`Leg.${name}`, 'Fur', [x, 0.7, z], [x, 0.36, z + (back ? -0.05 : 0.01)], back ? 0.12 : 0.09, { ...NECK, w1: 0.05 });
    m.beam(`Leg.${name}.Shin`, 'Fur', [x, 0.37, z + (back ? -0.05 : 0.01)], [x, 0.05, z + (back ? -0.02 : 0.02)], 0.045, { ...LEG, w1: 0.035 });
    m.box(`Leg.${name}.Hoof`, 'Hoof', [x - 0.025, x + 0.025], [0, 0.06], [z - 0.04 + (back ? 0.01 : 0.02), z + 0.03 + (back ? 0.01 : 0.02)], { n: 6 });
  }
  return m;
}

/** Brown hare: crouched body with strong haunches, long black-tipped ears. */
function hare() {
  const m = model();
  m.ellipsoid('Body', 'HareFur', [0, 0.16, -0.05], [0.085, 0.085, 0.16]);
  m.ellipsoid('Body.Haunch', 'HareFur', [0, 0.14, -0.14], [0.1, 0.085, 0.1]);
  m.ellipsoid('Body.Belly', 'HareLight', [0, 0.1, -0.03], [0.06, 0.04, 0.11], { around: 8 });
  m.ellipsoid('Body.Tail', 'HareLight', [0, 0.17, -0.24], [0.03, 0.03, 0.03], { around: 6, rings: 4 });
  // A short neck, so the head dips from behind.
  m.beam('Head.Neck', 'HareFur', [0, 0.16, 0.04], [0, 0.23, 0.11], 0.08, { ...NECK, w1: 0.07 });
  m.ellipsoid('Head.Skull', 'HareFur', [0, 0.245, 0.15], [0.052, 0.055, 0.075], { pitch: 0.25 });
  m.ellipsoid('Head.Muzzle', 'HareLight', [0, 0.22, 0.21], [0.03, 0.028, 0.035], { around: 8 });
  m.ellipsoid('Head.Nose', 'Nose', [0, 0.232, 0.243], [0.012, 0.009, 0.006], { around: 6, rings: 4 });
  for (const s of [-1, 1]) {
    m.ellipsoid('Head.Eye', 'Eye', [s * 0.048, 0.26, 0.17], [0.011, 0.012, 0.012], { around: 6, rings: 4 });
    m.beam('Head.Ear', 'HareFur', [s * 0.025, 0.28, 0.13], [s * 0.05, 0.43, 0.07], 0.04, { ...LEG, w1: 0.03 });
    m.beam('Head.Ear.Tip', 'EarTip', [s * 0.05, 0.43, 0.07], [s * 0.053, 0.46, 0.06], 0.03, { ...LEG, w1: 0.01 });
  }
  // Short front legs, long hind feet folded under the haunch.
  for (const [name, x, z] of [['FL', 0.04, 0.08], ['FR', -0.04, 0.08]]) {
    m.beam(`Leg.${name}`, 'HareFur', [x, 0.13, z], [x, 0, z + 0.02], 0.028, { ...LEG, w1: 0.02 });
  }
  for (const [name, x] of [['BL', 0.075], ['BR', -0.075]]) {
    m.beam(`Leg.${name}`, 'HareFur', [x, 0.14, -0.14], [x, 0.03, -0.2], 0.05, { ...LEG, w1: 0.035 });
    m.ellipsoid(`Leg.${name}.Foot`, 'HareDark', [x, 0.015, -0.15], [0.02, 0.015, 0.07], { around: 6, rings: 4 });
  }
  return m;
}

/** Spotted cow: long barrel body on short legs, black patches, udder, small horns. */
function cow() {
  const m = model();
  m.ellipsoid('Body', 'CowWhite', [0, 1.02, -0.08], [0.29, 0.3, 0.8], { around: 14, rings: 8 });
  m.ellipsoid('Body.Hips', 'CowWhite', [0, 1.2, -0.62], [0.26, 0.16, 0.22]);
  m.ellipsoid('Body.Withers', 'CowWhite', [0, 1.2, 0.45], [0.22, 0.15, 0.22]);
  // Black patches, flat ellipsoids just breaking through the white hide.
  for (const s of [-1, 1]) {
    m.ellipsoid('Body.Patch', 'CowBlack', [s * 0.25, 1.04, 0.12], [0.06, 0.17, 0.24]);
    m.ellipsoid('Body.Patch', 'CowBlack', [s * 0.21, 1.1, s > 0 ? -0.55 : -0.4], [0.06, 0.15, 0.16]);
  }
  m.ellipsoid('Body.Patch', 'CowBlack', [-0.02, 1.32, -0.58], [0.14, 0.05, 0.13]);
  m.ellipsoid('Body.Udder', 'Udder', [0, 0.72, -0.45], [0.12, 0.09, 0.14]);
  m.beam('Body.Tail', 'CowWhite', [0, 1.28, -0.86], [0, 0.72, -0.93], 0.04, { ...LEG, w1: 0.03 });
  m.ellipsoid('Body.Tail.Tuft', 'CowBlack', [0, 0.67, -0.94], [0.035, 0.07, 0.035], { around: 6, rings: 4 });
  // Neck and head in one - it dips to graze.
  m.beam('Head.Neck', 'CowWhite', [0, 1.0, 0.5], [0, 1.25, 0.82], 0.34, { ...NECK, w1: 0.24 });
  m.ellipsoid('Head.Skull', 'CowBlack', [0, 1.25, 0.93], [0.13, 0.16, 0.17], { pitch: 0.35 });
  m.ellipsoid('Head.Blaze', 'CowWhite', [0, 1.27, 1.05], [0.05, 0.12, 0.05], { pitch: 0.35 });
  m.ellipsoid('Head.Muzzle', 'CowMuzzle', [0, 1.09, 1.1], [0.11, 0.08, 0.1]);
  m.ellipsoid('Head.Nose', 'Nose', [0, 1.1, 1.195], [0.07, 0.025, 0.012], { around: 8, rings: 4 });
  for (const s of [-1, 1]) {
    m.ellipsoid('Head.Eye', 'Eye', [s * 0.12, 1.3, 0.97], [0.018, 0.018, 0.018], { around: 6, rings: 4 });
    m.beam('Head.Ear', 'CowBlack', [s * 0.12, 1.33, 0.86], [s * 0.27, 1.3, 0.84], 0.09, { ...LEG, w1: 0.05 });
    m.beam('Head.Horn', 'Horn', [s * 0.08, 1.38, 0.88], [s * 0.2, 1.5, 0.93], 0.05, { ...LEG, w1: 0.02 });
  }
  // Legs: sturdy, short shin, dark hoof.
  for (const [name, x, z] of [['FL', 0.17, 0.48], ['FR', -0.17, 0.48], ['BL', 0.17, -0.66], ['BR', -0.17, -0.66]]) {
    const back = name[0] === 'B';
    m.beam(`Leg.${name}`, 'CowWhite', [x, 0.9, z], [x, 0.42, z + (back ? -0.04 : 0.01)], back ? 0.2 : 0.15, { ...NECK, w1: 0.09 });
    m.beam(`Leg.${name}.Shin`, 'CowWhite', [x, 0.43, z + (back ? -0.04 : 0.01)], [x, 0.06, z], 0.08, { ...NECK, w1: 0.07 });
    m.box(`Leg.${name}.Hoof`, 'Hoof', [x - 0.05, x + 0.05], [0, 0.07], [z - 0.05, z + 0.06], { n: 8 });
  }
  return m;
}

/** Sheep: round woolly body in tufts, black face and legs, drooping ears. */
function sheep() {
  const m = model();
  m.ellipsoid('Body', 'Wool', [0, 0.63, -0.04], [0.23, 0.23, 0.47], { around: 12 });
  // Tufts of wool on the back and flanks - a lumpy fleece.
  for (const [x, y, z, w] of [[0, 0.8, 0.2, 0.15], [0, 0.83, -0.1, 0.16], [0, 0.8, -0.38, 0.14],
    [0.16, 0.7, 0.18, 0.12], [-0.16, 0.7, 0.18, 0.12], [0.17, 0.68, -0.22, 0.13], [-0.17, 0.68, -0.22, 0.13]]) {
    m.ellipsoid('Body.Tuft', y > 0.75 ? 'Wool' : 'WoolShade', [x, y, z], [w, w * 0.8, w], { around: 8, rings: 5 });
  }
  m.ellipsoid('Body.Tail', 'Wool', [0, 0.68, -0.52], [0.05, 0.07, 0.05], { around: 6, rings: 4 });
  // Neck and head in one - it dips to graze. A cap of wool on the forehead.
  m.beam('Head.Neck', 'Wool', [0, 0.6, 0.3], [0, 0.8, 0.48], 0.17, { ...NECK, w1: 0.13 });
  m.ellipsoid('Head.Skull', 'SheepFace', [0, 0.8, 0.57], [0.075, 0.1, 0.11], { pitch: 0.4 });
  m.ellipsoid('Head.Muzzle', 'SheepFace', [0, 0.73, 0.66], [0.05, 0.05, 0.06], { around: 8 });
  m.ellipsoid('Head.Wool', 'Wool', [0, 0.9, 0.52], [0.09, 0.06, 0.08], { around: 8 });
  for (const s of [-1, 1]) {
    m.ellipsoid('Head.Eye', 'Eye', [s * 0.066, 0.84, 0.59], [0.013, 0.013, 0.013], { around: 6, rings: 4 });
    m.beam('Head.Ear', 'SheepFace', [s * 0.07, 0.86, 0.52], [s * 0.18, 0.8, 0.5], 0.06, { ...LEG, w1: 0.035 });
  }
  // Thin black legs below the fleece.
  for (const [name, x, z] of [['FL', 0.11, 0.28], ['FR', -0.11, 0.28], ['BL', 0.11, -0.36], ['BR', -0.11, -0.36]]) {
    m.beam(`Leg.${name}`, 'SheepFace', [x, 0.5, z], [x, 0.03, z], 0.055, { ...LEG, w1: 0.04 });
    m.box(`Leg.${name}.Hoof`, 'Hoof', [x - 0.03, x + 0.03], [0, 0.04], [z - 0.03, z + 0.04], { n: 6 });
  }
  return m;
}

/** Goat: lean body, light belly and legs, beard, horns sweeping back, tail up. */
function goat() {
  const m = model();
  m.ellipsoid('Body', 'GoatFur', [0, 0.57, -0.04], [0.13, 0.15, 0.38], { around: 12 });
  m.ellipsoid('Body.Belly', 'GoatLight', [0, 0.47, -0.03], [0.1, 0.06, 0.28], { around: 8 });
  // Aalstrich: schmale Scheibe eines etwas größeren Körpers - folgt dem Rücken.
  m.ellipsoid('Body.Stripe', 'GoatDark', [0, 0.57, -0.04], [0.03, 0.155, 0.37], { around: 8 });
  m.beam('Body.Tail', 'GoatDark', [0, 0.66, -0.4], [0, 0.8, -0.47], 0.05, { ...LEG, w1: 0.02 });
  // Neck and head in one - it dips to graze.
  m.beam('Head.Neck', 'GoatFur', [0, 0.58, 0.24], [0, 0.84, 0.4], 0.12, { ...NECK, w1: 0.09 });
  m.ellipsoid('Head.Skull', 'GoatFur', [0, 0.87, 0.45], [0.06, 0.07, 0.09], { pitch: 0.35 });
  m.ellipsoid('Head.Muzzle', 'GoatLight', [0, 0.8, 0.56], [0.04, 0.04, 0.07], { around: 8 });
  m.ellipsoid('Head.Nose', 'Nose', [0, 0.81, 0.625], [0.025, 0.02, 0.01], { around: 6, rings: 4 });
  m.beam('Head.Beard', 'GoatDark', [0, 0.77, 0.54], [0, 0.66, 0.52], 0.035, { ...LEG, w1: 0.012 });
  for (const s of [-1, 1]) {
    m.ellipsoid('Head.Eye', 'Eye', [s * 0.052, 0.89, 0.49], [0.012, 0.012, 0.012], { around: 6, rings: 4 });
    m.beam('Head.Ear', 'GoatFur', [s * 0.05, 0.9, 0.4], [s * 0.16, 0.86, 0.38], 0.05, { ...LEG, w1: 0.025 });
    // Horns: up, then back.
    m.beam('Head.Horn', 'Horn', [s * 0.03, 0.92, 0.44], [s * 0.05, 1.04, 0.38], 0.03, { ...LEG, w1: 0.022 });
    m.beam('Head.Horn', 'Horn', [s * 0.05, 1.04, 0.38], [s * 0.07, 1.06, 0.27], 0.022, { ...LEG, w1: 0.01 });
  }
  for (const [name, x, z] of [['FL', 0.075, 0.24], ['FR', -0.075, 0.24], ['BL', 0.08, -0.32], ['BR', -0.08, -0.32]]) {
    const back = name[0] === 'B';
    m.beam(`Leg.${name}`, 'GoatFur', [x, 0.56, z], [x, 0.28, z + (back ? -0.04 : 0.01)], back ? 0.09 : 0.07, { ...NECK, w1: 0.04 });
    m.beam(`Leg.${name}.Shin`, 'GoatLight', [x, 0.29, z + (back ? -0.04 : 0.01)], [x, 0.04, z], 0.035, { ...LEG, w1: 0.03 });
    m.box(`Leg.${name}.Hoof`, 'Hoof', [x - 0.022, x + 0.022], [0, 0.045], [z - 0.03, z + 0.035], { n: 6 });
  }
  return m;
}

/** Wild boar: heavy forequarters, bristly mane, long snout, tusks, short legs. */
function boar() {
  const m = model();
  // Hoch an der Schulter, zum Hinterteil hin schmaler und niedriger.
  m.ellipsoid('Body', 'Boar', [0, 0.55, -0.14], [0.19, 0.23, 0.5], { around: 12 });
  m.ellipsoid('Body.Shoulder', 'Boar', [0, 0.6, 0.16], [0.2, 0.26, 0.28]);
  // Borstenkamm: schmale Scheibe, die über dem Rücken herausragt.
  m.ellipsoid('Body.Mane', 'BoarDark', [0, 0.56, -0.02], [0.05, 0.3, 0.42], { around: 8 });
  m.beam('Body.Tail', 'BoarDark', [0, 0.6, -0.63], [0, 0.42, -0.7], 0.03, { ...LEG, w1: 0.02 });
  // Short, thick neck, then the head tapering to the snout - both dip
  // together to root in the ground.
  m.beam('Head.Neck', 'Boar', [0, 0.44, 0.2], [0, 0.56, 0.5], 0.3, { ...NECK, w1: 0.24 });
  m.ellipsoid('Head.Skull', 'Boar', [0, 0.56, 0.56], [0.14, 0.16, 0.15]);
  m.beam('Head.Face', 'BoarDark', [0, 0.52, 0.6], [0, 0.43, 0.87], 0.2, { ...NECK, w1: 0.12 });
  m.box('Head.Snout', 'Snout', [-0.06, 0.06], [0.37, 0.49], [0.87, 0.9], { axis: 'z', n: 10 });
  for (const s of [-1, 1]) {
    m.ellipsoid('Head.Eye', 'Eye', [s * 0.1, 0.6, 0.66], [0.014, 0.014, 0.014], { around: 6, rings: 4 });
    m.beam('Head.Ear', 'BoarDark', [s * 0.09, 0.68, 0.52], [s * 0.15, 0.8, 0.48], 0.07, { ...LEG, w1: 0.02 });
    m.beam('Head.Tusk', 'Tusk', [s * 0.06, 0.42, 0.8], [s * 0.1, 0.52, 0.84], 0.025, { ...LEG, w1: 0.008 });
  }
  for (const [name, x, z] of [['FL', 0.11, 0.26], ['FR', -0.11, 0.26], ['BL', 0.11, -0.5], ['BR', -0.11, -0.5]]) {
    m.beam(`Leg.${name}`, 'Boar', [x, 0.48, z], [x, 0.18, z], 0.1, { ...NECK, w1: 0.06 });
    m.beam(`Leg.${name}.Shin`, 'BoarDark', [x, 0.19, z], [x, 0.04, z + 0.01], 0.05, { ...LEG, w1: 0.04 });
    m.box(`Leg.${name}.Hoof`, 'Hoof', [x - 0.03, x + 0.03], [0, 0.045], [z - 0.03, z + 0.045], { n: 6 });
  }
  return m;
}

const PAINT = '0.251 0.627 0.282';
write(dir, 'deer', '# deer.obj - Rehbock, Blickrichtung +z (tools/models/animals.mjs)\n', deer(), PAINT);
write(dir, 'hare', '# hare.obj - Feldhase, Blickrichtung +z (tools/models/animals.mjs)\n', hare(), PAINT);
write(dir, 'cow', '# cow.obj - Kuh, Blickrichtung +z (tools/models/animals.mjs)\n', cow(), PAINT);
write(dir, 'sheep', '# sheep.obj - Schaf, Blickrichtung +z (tools/models/animals.mjs)\n', sheep(), PAINT);
write(dir, 'goat', '# goat.obj - Ziege, Blickrichtung +z (tools/models/animals.mjs)\n', goat(), PAINT);
write(dir, 'boar', '# boar.obj - Wildschwein, Blickrichtung +z (tools/models/animals.mjs)\n', boar(), PAINT);
console.log('wrote deer, hare, cow, sheep, goat, boar');
