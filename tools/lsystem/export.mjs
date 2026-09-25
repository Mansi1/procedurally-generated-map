// Schreibt die L-System-Beispiele (lsystem.mjs) als lsys_<name>.obj und .mtl.
// Noch nicht im Spiel - zum Ansehen und Vergleichen mit tools/models/trees.mjs.
// Aufruf: node tools/lsystem/export.mjs [Zielordner] (Standard tools/lsystem/out)
import { mkdirSync } from 'node:fs';
import { write, PALETTE } from '../models/lib.mjs';
import { PRESETS, grow } from './lsystem.mjs';

const dir = process.argv[2] ?? new URL('./out', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });

for (const [name, p] of Object.entries(PRESETS)) {
  const r = grow(p);
  const file = `lsys_${name}`;
  write(dir, file, `# ${file}.obj - L-System "${p.label}", ${r.steps} Schritte, Seed ${p.seed ?? 1} (tools/lsystem)\n`, r.m, PALETTE.Leaf);
  console.log(`${file}: ${r.segs} Äste, ${r.leaves} Laub, ${r.height.toFixed(1)} m${r.capped ? ' (gekappt)' : ''}`);
}
