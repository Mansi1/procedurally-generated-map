// Blender und Spiel sind im Gleichstand - keine ID steht nur auf einer Seite:
// - jede .blend unter assets/blender/models exportiert genau das OBJ, das in
//   src/models eingecheckt ist (Fläche für Fläche, mit allen Namen);
// - die Clip-Bibliotheken exportieren dieselben Knochen und Clips;
// - Umbenennen, Kopieren und neue Objekte bekommen die richtigen Namen.
// Braucht Blender (Umgebungsvariable BLENDER oder /Applications/Blender.app) -
// ohne wird der Test übersprungen.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { modelsDir, objectNames, root } from './ids.mjs';

const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const skip = existsSync(blender) ? false : `Blender nicht gefunden (${blender})`;

function blendFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? blendFiles(p) : f.endsWith('.blend') ? [p] : [];
  });
}

function run(args) {
  const log = execFileSync(blender, ['-b', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.ok(!/Traceback|Error:/.test(log), log);
  return log;
}

test('jede .blend exportiert genau das eingecheckte OBJ', { skip }, () => {
  const out = mkdtempSync(join(tmpdir(), 'blend-sync-'));
  const files = blendFiles(join(root, 'assets/blender/models'));
  run(['--python', join(root, 'tools/blender/blend_to_obj.py'), '--', out, ...files]);
  const differ = [];
  for (const f of readdirSync(out).filter((f) => f.endsWith('.obj'))) {
    try {
      execFileSync('node', [join(root, 'tools/blender/compare-obj.mjs'), join(modelsDir, f), join(out, f)], { encoding: 'utf8' });
    } catch (e) {
      differ.push(`${f}: ${e.stdout.trim()}`);
    }
  }
  const exported = readdirSync(out).filter((f) => f.endsWith('.obj')).length;
  assert.equal(exported, files.length, 'nicht jede .blend hat ein OBJ ergeben');
  assert.deepEqual(differ, [], `Blender und src/models weichen ab - npm run gen:models vergessen?\n  ${differ.join('\n  ')}`);
});

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

test('Umbenennen, Kopieren, neue Objekte und Blenders Nummern ergeben die richtigen Namen', { skip }, () => {
  const out = mkdtempSync(join(tmpdir(), 'blend-names-'));
  const house = join(out, 'house.blend');
  copyFileSync(join(root, 'assets/blender/models/buildings/house.blend'), house);
  const script = join(out, 'edit.py');
  writeFileSync(script, `import bpy
sc = bpy.context.scene
entry = next(o for o in sc.objects if o.get('obj_name') == 'Entry')
entry.name = 'Eingang'
bar = next(o for o in sc.objects if o.get('obj_name') == 'Window.Bar')
copy = bar.copy(); copy.data = bar.data.copy(); sc.collection.objects.link(copy)
new = bpy.data.objects.new('Laterne.Neu', bar.data.copy()); sc.collection.objects.link(new)
`);
  run([house, '--python', script, '--python', join(root, 'tools/blender/blend_to_obj.py'), '--', out]);
  const count = (name) => readFileSync(join(out, 'house.obj'), 'utf8').split('\n').filter((l) => l === `o ${name}`).length;
  const bars = readFileSync(join(modelsDir, 'house.obj'), 'utf8').split('\n').filter((l) => l === 'o Window.Bar').length;
  assert.equal(count('Eingang'), 1, 'umbenannt: der neue Name gilt');
  assert.equal(count('Entry'), 0, 'umbenannt: der alte Name ist weg');
  assert.equal(count('Window.Bar'), bars + 1, 'kopiert (Shift+D): heißt wie das Original');
  assert.equal(count('Laterne.Neu'), 1, 'neu: heißt wie in Blender');
  // Blender nummeriert doppelte "Berry.93" zu "Berry.94" ... um - die Namen im
  // Spiel bleiben trotzdem die alten (im Gleichstand-Test oben mitgeprüft).
  assert.ok(objectNames(join(modelsDir, 'berry_bush_2.obj')).includes('Berry.93'));
});
