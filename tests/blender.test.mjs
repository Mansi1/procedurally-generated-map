// Blender und Spiel sind im Gleichstand: die Clip-Bibliotheken
// (assets/blender/clips/*.blend) exportieren dieselben Knochen und Clips, die
// in src/models eingecheckt sind. Die Modelle selbst sind .glb und brauchen
// keinen Export (tests/glb.test.mjs).
// Braucht Blender (Umgebungsvariable BLENDER oder /Applications/Blender.app) -
// ohne wird der Test übersprungen.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { modelsDir, root } from './ids.mjs';

const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const skip = existsSync(blender) ? false : `Blender nicht gefunden (${blender})`;

function run(args) {
  const log = execFileSync(blender, ['-b', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.ok(!/Traceback|Error:/.test(log), log);
  return log;
}

test('die Clip-Bibliotheken exportieren dieselben Knochen und Clips', { skip }, () => {
  const out = mkdtempSync(join(tmpdir(), 'clips-sync-'));
  const names = (file) => {
    const b = readFileSync(file);
    const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
    return { bones: j.nodes.map((n) => n.name).sort(), clips: (j.animations ?? []).map((a) => a.name).sort() };
  };
  const dir = join(root, 'assets/blender/clips');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.blend'))) {
    const name = f.slice(0, -6);
    run([join(dir, f), '--python', join(root, 'tools/blender/export_clips.py'), '--', join(out, `${name}_clips`)]);
    assert.deepEqual(names(join(out, `${name}_clips.glb`)), names(join(modelsDir, `${name}_clips.glb`)),
      `${name}: Knochen oder Clips anders als in src/models - npm run gen:anim vergessen?`);
  }
});
