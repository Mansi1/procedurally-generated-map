// Die IDs, an denen das Spiel Teile erkennt (docs/BLENDER.md): je Modell die
// Namen der Objekte (Entry, Stock.42, Arm.R.Lower ...), je Clip-Bibliothek die
// Knochen, die Clips und welche Pose jeder ersetzt. Gemeinsam für den Test
// (ids.test.mjs) und das Festschreiben (update-ids.mjs).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const root = new URL('../', import.meta.url).pathname;
export const modelsDir = join(root, 'src/models');
export const snapshotFile = join(root, 'tests/ids.snapshot.json');

/** Namen der Objekte eines OBJ - jeder einmal, sortiert. */
export function objectNames(file) {
  const names = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('o ') || line.startsWith('g ')) names.add(line.slice(2).trim());
  }
  return [...names].sort();
}

/** Knoten- und Animationsnamen einer .glb (JSON-Teil). */
function glbNames(file) {
  const bytes = readFileSync(file);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8'));
  return {
    bones: (json.nodes ?? []).map((n) => n.name).filter(Boolean).sort(),
    animations: (json.animations ?? []).map((a) => a.name).sort(),
  };
}

/** Alle IDs, wie sie jetzt in src/models stehen. */
export function collectIds(dir = modelsDir) {
  const models = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.obj')).sort()) models[f.slice(0, -4)] = objectNames(join(dir, f));
  const clips = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('_clips.glb')).sort()) {
    const name = f.slice(0, -'_clips.glb'.length);
    const manifest = JSON.parse(readFileSync(join(dir, `${name}_clips.json`), 'utf8'));
    const { bones, animations } = glbNames(join(dir, f));
    clips[name] = {
      rig: manifest.rig,
      bones,
      animations,
      // Welcher Clip welche Pose ersetzt (und für welche Tierarten) - ohne
      // diese Angaben spielt das Spiel den Clip nicht mehr ab.
      clips: Object.fromEntries(manifest.clips.map((c) => [c.name, {
        ...(c.pose !== undefined ? { pose: c.pose } : {}),
        ...(c.species?.length ? { species: [...c.species].sort() } : {}),
        props: [...(c.props ?? [])].sort(),
      }])),
    };
  }
  return { models, clips };
}

/**
 * Was gegenüber dem festgeschriebenen Stand fehlt: je Eintrag ein Satz.
 * Neues (mehr Namen, neue Modelle) ist kein Verlust.
 */
export function lostIds(before, now) {
  const lost = [];
  for (const [model, names] of Object.entries(before.models)) {
    const have = new Set(now.models[model] ?? []);
    if (!now.models[model]) {
      lost.push(`Modell ${model} fehlt ganz`);
      continue;
    }
    const gone = names.filter((n) => !have.has(n));
    if (gone.length) lost.push(`${model}: ${gone.length} Namen weg - ${gone.slice(0, 10).join(', ')}${gone.length > 10 ? ' ...' : ''}`);
  }
  for (const [lib, was] of Object.entries(before.clips)) {
    const is = now.clips[lib];
    if (!is) {
      lost.push(`Clip-Bibliothek ${lib} fehlt ganz`);
      continue;
    }
    if (is.rig !== was.rig) lost.push(`${lib}: Skelett heißt ${is.rig} statt ${was.rig}`);
    const bones = was.bones.filter((b) => !is.bones.includes(b));
    if (bones.length) lost.push(`${lib}: Knochen weg - ${bones.join(', ')}`);
    for (const [clip, meta] of Object.entries(was.clips)) {
      const now2 = is.clips[clip];
      if (!now2) {
        lost.push(`${lib}: Clip ${clip} weg`);
        continue;
      }
      if (!is.animations.includes(clip)) lost.push(`${lib}: Clip ${clip} steht im Manifest, fehlt aber in der .glb`);
      if (meta.pose !== undefined && now2.pose !== meta.pose) lost.push(`${lib}: Clip ${clip} ersetzt Pose ${now2.pose ?? 'keine'} statt ${meta.pose}`);
      const species = (meta.species ?? []).filter((s) => !(now2.species ?? []).includes(s));
      if (species.length) lost.push(`${lib}: Clip ${clip} gilt nicht mehr für ${species.join(', ')}`);
      const props = meta.props.filter((p) => !now2.props.includes(p));
      if (props.length) lost.push(`${lib}: Clip ${clip} ohne Werkzeug ${props.join(', ')}`);
    }
  }
  return lost;
}

/** Was neu dazugekommen ist - zum Hinweis, dass der Stand festgeschrieben werden kann. */
export function newIds(before, now) {
  const added = [];
  for (const [model, names] of Object.entries(now.models)) {
    const had = new Set(before.models[model] ?? []);
    const plus = names.filter((n) => !had.has(n));
    if (!before.models[model]) added.push(`neues Modell ${model}`);
    else if (plus.length) added.push(`${model}: +${plus.length} Namen`);
  }
  for (const [lib, is] of Object.entries(now.clips)) {
    const was = before.clips[lib];
    if (!was) added.push(`neue Clip-Bibliothek ${lib}`);
    else for (const clip of Object.keys(is.clips)) if (!was.clips[clip]) added.push(`${lib}: neuer Clip ${clip}`);
  }
  return added;
}
