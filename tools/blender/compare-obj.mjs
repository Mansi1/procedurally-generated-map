// Vergleicht zwei OBJ-Dateien Fläche für Fläche: gleiche Objekte (Namen,
// Reihenfolge), je Fläche gleiches Material und gleiche Eckpunkte (auf 0,1 mm,
// Reihenfolge der Ecken zyklisch gleich). Dazu die Farben der Materialien.
// Für den Umzug nach Blender: Original gegen den Export aus der .blend-Datei.
//
// Aufruf: node tools/blender/compare-obj.mjs <a.obj> <b.obj>   (Exit 1 bei Unterschied)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function read(file) {
  const pos = [];
  const objects = [];
  let cur = null;
  let mat = '';
  let mtllib = null;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const p = raw.trim().split(/\s+/);
    if (p[0] === 'v') pos.push(p.slice(1, 4).map(Number));
    else if (p[0] === 'mtllib') mtllib = p.slice(1).join(' ');
    else if (p[0] === 'o' || p[0] === 'g') objects.push((cur = { name: p.slice(1).join(' '), faces: [] }));
    else if (p[0] === 'usemtl') mat = p.slice(1).join(' ');
    else if (p[0] === 'f') {
      const pts = p.slice(1).map((a) => {
        const i = Number(a.split('/')[0]);
        return pos[i < 0 ? pos.length + i : i - 1].map((v) => Math.round(v * 1e4));
      });
      cur.faces.push({ mat, pts });
    }
  }
  const colors = new Map();
  const mtlPath = mtllib && join(dirname(file), mtllib);
  if (mtlPath && existsSync(mtlPath)) {
    let c = null;
    for (const raw of readFileSync(mtlPath, 'utf8').split('\n')) {
      const p = raw.trim().split(/\s+/);
      if (p[0] === 'newmtl') c = p.slice(1).join(' ');
      if (p[0] === 'Kd' && c) colors.set(c, p.slice(1, 4).map((v) => Math.round(Number(v) * 1000)).join(' '));
    }
  }
  return { objects, colors };
}

/** Fläche als Text, beginnend beim kleinsten Eckpunkt - Drehung der Ecken egal, Umlaufsinn nicht. */
function key({ mat, pts }) {
  const s = pts.map((p) => p.join(','));
  let best = 0;
  for (let i = 1; i < s.length; i++) if (s[i] < s[best]) best = i;
  return `${mat}|${[...s.slice(best), ...s.slice(0, best)].join(' ')}`;
}

const near = (a, b) => {
  // Rundung an der Grenze: ein Zehntel Millimeter Spiel je Koordinate.
  const pa = a.split('|')[1].split(' ').map((p) => p.split(',').map(Number));
  const pb = b.split('|')[1].split(' ').map((p) => p.split(',').map(Number));
  return a.split('|')[0] === b.split('|')[0] && pa.length === pb.length
    && pa.every((p, i) => p.every((v, j) => Math.abs(v - pb[i][j]) <= 1));
};

const [fa, fb] = process.argv.slice(2);
const A = read(fa);
const B = read(fb);
const problems = [];
if (A.objects.length !== B.objects.length) problems.push(`Objekte: ${A.objects.length} gegen ${B.objects.length}`);
A.objects.forEach((oa, i) => {
  const ob = B.objects[i];
  if (!ob) return;
  if (oa.name !== ob.name) problems.push(`Objekt ${i}: "${oa.name}" gegen "${ob.name}"`);
  const ka = oa.faces.map(key).sort();
  const kb = ob.faces.map(key).sort();
  if (ka.length !== kb.length) problems.push(`${oa.name}: ${ka.length} gegen ${kb.length} Flächen`);
  else if (ka.some((k, j) => k !== kb[j] && !near(k, kb[j]))) problems.push(`${oa.name}: Flächen verschieden`);
});
for (const [m, c] of A.colors) {
  if (A.objects.some((o) => o.faces.some((f) => f.mat === m)) && B.colors.get(m) !== c) problems.push(`Material ${m}: ${c} gegen ${B.colors.get(m)}`);
}
const faces = A.objects.reduce((n, o) => n + o.faces.length, 0);
if (problems.length) {
  console.log(`${fb}: ${problems.length} Unterschiede\n  ` + problems.slice(0, 8).join('\n  '));
  process.exit(1);
}
console.log(`gleich: ${A.objects.length} Objekte, ${faces} Flächen`);
