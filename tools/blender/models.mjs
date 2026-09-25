// Die Modelle des Spiels aus Blender (docs/BLENDER.md): jede .blend-Datei unter
// assets/blender/models/ wird ein OBJ + MTL in src/models/.
//
//   npm run gen:models            alle .blend exportieren (tools/blender/blend_to_obj.py)
//   node tools/blender/models.mjs init [name ...]
//                                 einmalig: aus den OBJ in src/models je eine .blend
//                                 anlegen (obj_to_blend.py) und prüfen, dass der
//                                 Export genau das OBJ ergibt; vorhandene .blend
//                                 bleiben, außer mit --force
//
// Blender über die Umgebungsvariable BLENDER, sonst der übliche Ort auf macOS.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname;
const blender = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';
const modelsDir = join(root, 'src/models');
const blendDir = join(root, 'assets/blender/models');

/** Ordner je Modell - nach dem Namen. */
function category(name) {
  if (/^villager_/.test(name)) return 'villagers';
  if (/^(prop_|bow$|marker_arrow$|rally_flag$)/.test(name)) return 'props';
  if (/^(house|lumber_camp|mill|mining_camp|town_center|bowyer|armory)/.test(name)) return 'buildings';
  if (/^tree_/.test(name)) return 'trees';
  if (/^(berry_bush|stone_|gold_)/.test(name)) return 'nature';
  if (/^(boar|cow|deer|goat|hare|sheep)$/.test(name)) return 'animals';
  return 'misc';
}

function blendFiles(dir = blendDir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? blendFiles(p) : f.endsWith('.blend') ? [p] : [];
  });
}

function run(args) {
  const log = execFileSync(blender, ['-b', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (/Traceback|Error:/.test(log)) {
    console.error(log);
    throw new Error('Blender meldet einen Fehler');
  }
  return log;
}

/** Alle .blend in einem Lauf nach `out` exportieren. */
function exportAll(out, files) {
  if (files.length === 0) return;
  const log = run(['--python', join(root, 'tools/blender/blend_to_obj.py'), '--', out, ...files]);
  return log.split('\n').filter((l) => l.startsWith('exportiert:')).length;
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'init') {
  const force = rest.includes('--force');
  const only = rest.filter((a) => !a.startsWith('--'));
  const names = readdirSync(modelsDir).filter((f) => f.endsWith('.obj')).map((f) => f.slice(0, -4))
    .filter((n) => only.length === 0 || only.includes(n));
  const pairs = [];
  for (const n of names) {
    const target = join(blendDir, category(n), `${n}.blend`);
    if (existsSync(target) && !force) continue;
    pairs.push(join(modelsDir, `${n}.obj`), target);
  }
  if (pairs.length) run(['--python', join(root, 'tools/blender/obj_to_blend.py'), '--', ...pairs]);
  // Prüfen: der Export muss genau das OBJ ergeben.
  const check = mkdtempSync(join(tmpdir(), 'blend-check-'));
  const targets = pairs.filter((_, i) => i % 2 === 1);
  exportAll(check, targets);
  let bad = 0;
  for (const t of targets) {
    const n = t.split('/').pop().slice(0, -6);
    try {
      const r = execFileSync('node', [join(root, 'tools/blender/compare-obj.mjs'), join(modelsDir, `${n}.obj`), join(check, `${n}.obj`)], { encoding: 'utf8' });
      console.log(`${relative(root, t)}: ${r.trim()}`);
    } catch (e) {
      bad++;
      console.log(`${relative(root, t)}: ${e.stdout}`);
    }
  }
  console.log(`${targets.length} angelegt, ${bad} mit Unterschieden`);
  if (bad) process.exit(1);
} else {
  const files = blendFiles();
  const n = exportAll(modelsDir, files);
  console.log(`${n ?? 0} Modelle aus Blender nach src/models exportiert`);
}
