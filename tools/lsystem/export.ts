// Schreibt die Beispiele (presets/) als lsys_<name>.obj und .mtl.
// Noch nicht im Spiel - zum Ansehen und Vergleichen mit tools/models/trees.mjs.
// Aufruf: npx vite-node tools/lsystem/export.ts [--texture] [--einzeln] [Zielordner] (Standard tools/lsystem/out)
//   ohne --texture: Blätter als Form nach dem Umriss, einfarbig; Rinde einfarbig
//   mit --texture:  Blätter als Viereck mit Foto, Rinde als Kachel-Textur;
//                   die Bilder landen in <Zielordner>/textures/
//   mit --einzeln:  jedes Blatt eine eigene Fläche statt Blattebenen (Zweig mit mehreren Blättern)
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { barkFile } from './bark/data.ts';
import { textureFile, type LeafMode } from './foliage.ts';
import { grow } from './lsystem.ts';
import { mtlFile } from './mtl.ts';
import { PRESETS } from './presets/index.ts';

const args = process.argv.slice(2);
const mode: LeafMode = args.includes('--texture') ? 'texture' : 'shape';
const cards = !args.includes('--einzeln');
const dir = args.find((a) => !a.startsWith('--')) ?? fileURLToPath(new URL('./out', import.meta.url));
const LEAF_IMG = fileURLToPath(new URL('./leaves/img', import.meta.url));
const BARK_IMG = fileURLToPath(new URL('./bark/img', import.meta.url));
mkdirSync(dir, { recursive: true });
if (mode === 'texture') mkdirSync(join(dir, 'textures'), { recursive: true });

const copied = new Set<string>();
for (const [name, spec] of Object.entries(PRESETS)) {
  const tree = grow(spec, { leaves: mode, cards });
  const file = `lsys_${name}`;
  const header = `# ${file}.obj - L-System "${spec.label}", ${tree.iterations} Schritte, Seed ${spec.seed} (tools/lsystem)`;
  writeFileSync(join(dir, `${file}.obj`), `${header}\nmtllib ${file}.mtl\n${tree.model.out.join('\n')}\n`);
  writeFileSync(join(dir, `${file}.mtl`), `# ${file}.mtl${mtlFile(tree, mode, 'textures')}`);
  if (mode === 'texture') {
    for (const info of tree.leafMaterials.values()) {
      const png = textureFile(info);
      if (!copied.has(png)) copyFileSync(join(LEAF_IMG, png), join(dir, 'textures', png));
      copied.add(png);
    }
    if (tree.bark) {
      const jpg = barkFile(tree.bark.texture);
      if (!copied.has(jpg)) copyFileSync(join(BARK_IMG, jpg), join(dir, 'textures', jpg));
      copied.add(jpg);
    }
  }
  const faces = tree.model.out.filter((l) => l.startsWith('f ')).length;
  console.log(`${file}: ${tree.segments} Äste, ${tree.leaves} Laub/Organe, ${faces} Flächen, ${tree.height.toFixed(1)} m${tree.capped ? ' (gekappt)' : ''}`);
}
