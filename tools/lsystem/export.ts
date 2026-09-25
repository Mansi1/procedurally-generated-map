// Schreibt die Beispiele (presets.ts) als lsys_<name>.obj und .mtl.
// Noch nicht im Spiel - zum Ansehen und Vergleichen mit tools/models/trees.mjs.
// Aufruf: npx vite-node tools/lsystem/export.ts [Zielordner] (Standard tools/lsystem/out)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grow } from './lsystem.ts';
import { mtl } from './materials.ts';
import { PRESETS } from './presets/index.ts';

const dir = process.argv[2] ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(dir, { recursive: true });

for (const [name, spec] of Object.entries(PRESETS)) {
  const tree = grow(spec);
  const file = `lsys_${name}`;
  const header = `# ${file}.obj - L-System "${spec.label}", ${tree.iterations} Schritte, Seed ${spec.seed} (tools/lsystem)`;
  writeFileSync(join(dir, `${file}.obj`), `${header}\nmtllib ${file}.mtl\n${tree.model.out.join('\n')}\n`);
  writeFileSync(join(dir, `${file}.mtl`), `# ${file}.mtl\n${mtl(tree.model.used)}`);
  console.log(`${file}: ${tree.segments} Äste, ${tree.leaves} Laub/Organe, ${tree.height.toFixed(1)} m${tree.capped ? ' (gekappt)' : ''}`);
}
