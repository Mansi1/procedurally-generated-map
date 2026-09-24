// Generates src/models/deer.obj and hare.obj - game to hunt: a roe buck and a
// brown hare, facing +z. Metres, real size (the game scales them by height).
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
});

/** Roe buck: slim body on long legs, white rump patch, short forked antlers. */
function deer() {
  const m = model();
  // Body: rounded, a little higher at the shoulder than at the hip.
  m.box('Body', 'Fur', [-0.15, 0.15], [0.5, 0.82], [-0.48, 0.42], { r: 0.35, z: [-0.44, 0.38] });
  m.box('Body.Belly', 'FurLight', [-0.12, 0.12], [0.47, 0.56], [-0.36, 0.3], { r: 0.35 });
  m.box('Body.Withers', 'Fur', [-0.12, 0.12], [0.78, 0.88], [0.1, 0.38], { r: 0.35, x: [-0.08, 0.08] });
  m.box('Body.Rump', 'Rump', [-0.11, 0.11], [0.58, 0.8], [-0.52, -0.46], { r: 0.35 });
  m.box('Body.Tail', 'Rump', [-0.03, 0.03], [0.72, 0.8], [-0.55, -0.5], { r: 0.3 });
  // Neck and head in one - it dips to graze.
  m.beam('Head.Neck', 'Fur', [0, 0.72, 0.33], [0, 1.02, 0.52], 0.15, { w1: 0.1, n: 6 });
  m.box('Head.Skull', 'Fur', [-0.07, 0.07], [0.98, 1.13], [0.45, 0.64], { r: 0.3, x: [-0.06, 0.06] });
  m.box('Head.Muzzle', 'FurDark', [-0.045, 0.045], [0.98, 1.06], [0.62, 0.76], { r: 0.3, x: [-0.035, 0.035] });
  m.box('Head.Nose', 'Nose', [-0.035, 0.035], [1.0, 1.05], [0.755, 0.775]);
  for (const s of [-1, 1]) {
    m.box('Head.Eye', 'Eye', [s * 0.066 - 0.012, s * 0.066 + 0.012], [1.07, 1.095], [0.58, 0.61]);
    // Ears to the side and up, antlers between them.
    m.beam('Head.Ear', 'Fur', [s * 0.05, 1.12, 0.5], [s * 0.15, 1.24, 0.46], 0.07, { w1: 0.03 });
    m.beam('Head.Antler', 'Antler', [s * 0.03, 1.12, 0.52], [s * 0.05, 1.32, 0.5], 0.03, { w1: 0.018 });
    m.beam('Head.Antler', 'Antler', [s * 0.045, 1.22, 0.51], [s * 0.05, 1.28, 0.58], 0.02, { w1: 0.012 });
  }
  // Legs: thigh thick at the top, thin cannon, dark hoof.
  for (const [name, x, z] of [['FL', 0.085, 0.3], ['FR', -0.085, 0.3], ['BL', 0.09, -0.36], ['BR', -0.09, -0.36]]) {
    const back = name[0] === 'B';
    m.beam(`Leg.${name}`, 'Fur', [x, 0.7, z], [x, 0.36, z + (back ? -0.05 : 0.01)], back ? 0.12 : 0.09, { w1: 0.05 });
    m.beam(`Leg.${name}.Shin`, 'Fur', [x, 0.37, z + (back ? -0.05 : 0.01)], [x, 0.05, z + (back ? -0.02 : 0.02)], 0.045, { w1: 0.035 });
    m.box(`Leg.${name}.Hoof`, 'Hoof', [x - 0.025, x + 0.025], [0, 0.06], [z - 0.04 + (back ? 0.01 : 0.02), z + 0.03 + (back ? 0.01 : 0.02)]);
  }
  return m;
}

/** Brown hare: crouched body with strong haunches, long black-tipped ears. */
function hare() {
  const m = model();
  m.box('Body', 'HareFur', [-0.09, 0.09], [0.07, 0.25], [-0.22, 0.12], { r: 0.4, z: [-0.18, 0.1] });
  m.box('Body.Haunch', 'HareFur', [-0.1, 0.1], [0.05, 0.22], [-0.25, -0.05], { r: 0.4 });
  m.box('Body.Belly', 'HareLight', [-0.06, 0.06], [0.06, 0.1], [-0.15, 0.08], { r: 0.35 });
  m.box('Body.Tail', 'HareLight', [-0.03, 0.03], [0.14, 0.2], [-0.27, -0.23], { r: 0.35 });
  m.box('Head.Skull', 'HareFur', [-0.055, 0.055], [0.19, 0.3], [0.08, 0.22], { r: 0.35, x: [-0.045, 0.045] });
  m.box('Head.Muzzle', 'HareLight', [-0.03, 0.03], [0.19, 0.24], [0.2, 0.25], { r: 0.3 });
  m.box('Head.Nose', 'Nose', [-0.012, 0.012], [0.225, 0.24], [0.248, 0.256]);
  for (const s of [-1, 1]) {
    m.box('Head.Eye', 'Eye', [s * 0.052 - 0.01, s * 0.052 + 0.01], [0.25, 0.27], [0.16, 0.185]);
    m.beam('Head.Ear', 'HareFur', [s * 0.025, 0.29, 0.13], [s * 0.05, 0.43, 0.07], 0.04, { w1: 0.03 });
    m.beam('Head.Ear.Tip', 'EarTip', [s * 0.05, 0.43, 0.07], [s * 0.053, 0.46, 0.06], 0.03, { w1: 0.01 });
  }
  // Short front legs, long hind feet folded under the haunch.
  for (const [name, x, z] of [['FL', 0.04, 0.08], ['FR', -0.04, 0.08]]) {
    m.beam(`Leg.${name}`, 'HareFur', [x, 0.13, z], [x, 0, z + 0.02], 0.028, { w1: 0.02 });
  }
  for (const [name, x] of [['BL', 0.075], ['BR', -0.075]]) {
    m.beam(`Leg.${name}`, 'HareFur', [x, 0.14, -0.14], [x, 0.03, -0.2], 0.05, { w1: 0.035 });
    m.box(`Leg.${name}.Foot`, 'HareDark', [x - 0.02, x + 0.02], [0, 0.03], [-0.22, -0.08]);
  }
  return m;
}

const PAINT = '0.251 0.627 0.282';
write(dir, 'deer', '# deer.obj - Rehbock, Blickrichtung +z (tools/models/animals.mjs)\n', deer(), PAINT);
write(dir, 'hare', '# hare.obj - Feldhase, Blickrichtung +z (tools/models/animals.mjs)\n', hare(), PAINT);
console.log('wrote deer, hare');
