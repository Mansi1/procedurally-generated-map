// Exportiert das Skelett der Tiere mit allen Clips als glTF (.glb) - daraus
// wird assets/blender/quadruped.blend (tools/blender/bootstrap_rig.py). Am
// Reh (REFERENCE) werden die Clips in Blender bearbeitet; das Spiel backt sie
// für jede Art mit deren Gelenken (src/gl/clips.ts, QUADRUPED).
//
// Im Shader (Zweig "beast") schwingen die Beine um ihr oberes Gelenk und der
// Kopf nickt um den Halsansatz. Hier wird daraus ein Skelett mit denselben
// Gelenken, und jede Bewegung wird mit denselben Formeln
// (tools/export/animal-poses.mjs) als Animation hineingerechnet.
//
// Daneben schreibt es <Ausgabe>.clips.json: je Clip Pose, Arten, Phasenbereich
// und ob das Tier liegt - bootstrap_rig.py macht daraus Custom Properties der
// Actions. Dazu Höhe und uGraze des Rehs: das Spiel rechnet damit die
// Verschiebung der Wurzel in Körperhöhen und das Senken des Kopfs je Art um.
//
// Aufruf: node tools/export/animals.mjs [Ausgabedatei]
//   Standard: tools/export/out/quadruped.glb

import { readFileSync, writeFileSync } from 'node:fs';
import { FLOAT, GltfBuilder, parseMtl, parseObj } from './gltf.mjs';
import { ANIMAL_CLIPS, REFERENCE, animalBones, animalPart, animalPose, measureAnimal } from './animal-poses.mjs';

const root = new URL('../../', import.meta.url).pathname;
const outFile = process.argv.slice(2).find((a) => a.endsWith('.glb')) ?? `${root}tools/export/out/quadruped.glb`;
const FPS = 30;
const read = (file) => readFileSync(`${root}src/models/${file}`, 'utf8');

const tris = parseObj(read(`${REFERENCE}.obj`));
const colors = parseMtl(read(`${REFERENCE}.mtl`));
const j = measureAnimal(tris);
const { H, minY } = j;
/** Modell-Koordinaten (x vorn, y links, z oben, Höhe 1) -> Datei (x links, y oben, z vorn, Meter). */
const toFile = ([x, y, z]) => [y * H, z * H + minY, x * H];

// Knochen: Name, Eltern, Drehpunkt (Modell-Koordinaten) - wie QUADRUPED in src/gl/clips.ts.
const BONES = [
  ['root', null, [0, 0, 0]],
  ['leg.FL', 'root', [j.legs[0], 0, j.hip]], ['leg.FR', 'root', [j.legs[0], 0, j.hip]],
  ['leg.BL', 'root', [j.legs[1], 0, j.hip]], ['leg.BR', 'root', [j.legs[1], 0, j.hip]],
  ['neck', 'root', [j.neck[0], 0, j.neck[1]]], ['head', 'neck', [j.neck[0], 0, j.neck[1]]],
].map(([name, parent, pivot]) => [name, parent, toFile(pivot)]);
const boneIndex = new Map(BONES.map(([name], i) => [name, i]));
const sub = (a, b) => a.map((v, i) => v - b[i]);

const gltf = new GltfBuilder();
const boneNodes = BONES.map(([name, parent, pivot]) => {
  const parentPivot = parent ? BONES[boneIndex.get(parent)][2] : [0, 0, 0];
  return gltf.addNode({ name, translation: sub(pivot, parentPivot) });
});
BONES.forEach(([, parent], i) => {
  if (!parent) return;
  const p = gltf.nodes[boneNodes[boneIndex.get(parent)]];
  (p.children ??= []).push(boneNodes[i]);
});

// Das Reh: jeder Eckpunkt an seinem Knochen - Beine, Kopf, sonst die Wurzel.
const mesh = gltf.mesh('Reh', tris, colors, (t) => {
  const part = animalPart(t.object);
  return [[boneIndex.get(part === 'body' ? 'root' : part), 1]];
});
const inverseBind = new Float32Array(BONES.length * 16);
BONES.forEach(([, , pivot], i) => {
  inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -pivot[0], -pivot[1], -pivot[2], 1], i * 16);
});
const skin = { name: 'Skelett', joints: boneNodes, skeleton: boneNodes[0], inverseBindMatrices: gltf.accessor(inverseBind, 'MAT4', FLOAT, BONES.length) };
const meshNode = gltf.addNode({ name: 'Reh', mesh, skin: 0 });
const rigNode = gltf.addNode({
  name: 'quadruped',
  // Höhe des Rehs in Metern und wie weit es den Kopf zum Äsen senkt (uGraze) -
  // Blender übernimmt beides als Custom Properties des Skeletts.
  extras: { height: H, graze: j.graze },
  children: [boneNodes[0], meshNode],
});

// Je Clip: Bild i zeigt die Phase shift + i / (Bilder - 1) * period - die
// Schleife schließt genau (das letzte Bild ist das erste eine Periode später).
const animations = [];
const sidecar = [];
for (const clip of ANIMAL_CLIPS) {
  const frames = Math.round(clip.seconds * FPS) + 1;
  const duration = (frames - 1) / FPS;
  const times = new Float32Array(frames).map((_, i) => i / FPS);
  const input = gltf.accessor(times, 'SCALAR', FLOAT, frames, { min: [0], max: [duration] });
  const samplers = [];
  const channels = [];
  const track = (node, path, values, type) => {
    samplers.push({ input, output: gltf.accessor(values, type, FLOAT, values.length / (type === 'VEC4' ? 4 : 3)), interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node, path } });
  };
  const poses = [...times].map((_, i) => animalBones(
    animalPose(clip.name, clip.shift + (i / (frames - 1)) * clip.period, { graze: j.graze }), H, j.side));
  // Die Wurzel: Ruhelage plus Anheben (bzw. Liegen).
  track(boneNodes[0], 'translation', new Float32Array(poses.flatMap((p) => p.translation.map((v, k) => v + BONES[0][2][k]))), 'VEC3');
  for (const name of Object.keys(poses[0].rotations)) {
    track(boneNodes[boneIndex.get(name)], 'rotation', new Float32Array(poses.flatMap((p) => p.rotations[name])), 'VEC4');
  }
  animations.push({ name: clip.name, samplers, channels });
  sidecar.push({
    name: clip.name, pose: clip.pose, props: '', phase_period: clip.period, phase_shift: clip.shift,
    kneel: false, species: clip.species, lying: Boolean(clip.lying), frames, duration,
  });
}

const sceneRoot = gltf.addNode({ name: 'Tiere.Szene', children: [rigNode] });
const total = gltf.write(outFile, {
  scenes: [{ name: 'Tiere', nodes: [sceneRoot] }],
  skins: [skin],
  animations,
});
writeFileSync(outFile.replace(/\.glb$/, '.clips.json'), JSON.stringify({ height: H, graze: j.graze, clips: sidecar }, null, 2) + '\n');
console.log(`${outFile} - ${(total / 1024).toFixed(0)} KB, Clips: ${sidecar.map((c) => `${c.name} ${c.frames}`).join(', ')}`);
