// Exportiert die Clips aller Blender-Dateien in assets/blender/ nach
// src/models/<name>_clips.glb und .json (tools/blender/export_clips.py).
// Blender über die Umgebungsvariable BLENDER, sonst der übliche Ort auf macOS.
//
// Aufruf: npm run gen:anim

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';

for (const file of readdirSync(`${root}assets/blender`).filter((f) => f.endsWith('.blend'))) {
  const name = file.replace(/\.blend$/, '');
  const out = `${root}src/models/${name}_clips`;
  const log = execFileSync(blender, [
    '-b', `${root}assets/blender/${file}`,
    '--python', `${root}tools/blender/export_clips.py`, '--', out,
  ], { encoding: 'utf8' });
  const line = log.split('\n').find((l) => l.startsWith('exportiert:'));
  if (!line) {
    console.error(log);
    throw new Error(`Export von ${file} fehlgeschlagen`);
  }
  console.log(line);
}
