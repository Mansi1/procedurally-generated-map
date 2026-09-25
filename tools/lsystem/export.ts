// Schreibt die Beispiel-Bäume (presets.ts) als lsys_<name>.obj und .mtl.
// Noch nicht im Spiel - zum Ansehen und Vergleichen mit tools/models/trees.mjs.
// Aufruf: npx vite-node tools/lsystem/export.ts [Zielordner] (Standard tools/lsystem/out)
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PALETTE, write } from '../models/lib.mjs';
import { grow } from './lsystem.ts';
import { PRESETS } from './presets.ts';

const dir = process.argv[2] ?? fileURLToPath(new URL('./out', import.meta.url));
mkdirSync(dir, { recursive: true });

for (const [name, spec] of Object.entries(PRESETS)) {
  const tree = grow(spec);
  const file = `lsys_${name}`;
  const header = `# ${file}.obj - L-System "${spec.label}", ${tree.iterations} Schritte, Seed ${spec.seed} (tools/lsystem)\n`;
  write(dir, file, header, tree.model, PALETTE['Leaf']);
  console.log(`${file}: ${tree.segments} Äste, ${tree.leaves} Laub, ${tree.height.toFixed(1)} m${tree.capped ? ' (gekappt)' : ''}`);
}
