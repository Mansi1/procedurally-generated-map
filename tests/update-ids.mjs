// Schreibt die IDs, wie sie jetzt in src/models stehen, als gültigen Stand
// fest (tests/ids.snapshot.json). Nur nach einer gewollten Änderung - z. B.
// wenn in Blender ein Teil absichtlich entfernt wurde. Zeigt vorher, was
// dabei verloren geht.
//
// Aufruf: npm run test:update-ids

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { collectIds, lostIds, newIds, snapshotFile } from './ids.mjs';

const now = collectIds();
if (existsSync(snapshotFile)) {
  const before = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  const lost = lostIds(before, now);
  const added = newIds(before, now);
  if (lost.length) console.log(`Wird als gewollt festgeschrieben (weg):\n  ${lost.join('\n  ')}`);
  if (added.length) console.log(`Neu:\n  ${added.join('\n  ')}`);
  if (!lost.length && !added.length) console.log('Keine Änderung.');
}
writeFileSync(snapshotFile, `${JSON.stringify(now, null, 1)}\n`);
const names = Object.values(now.models).reduce((n, m) => n + m.length, 0);
console.log(`Festgeschrieben: ${Object.keys(now.models).length} Modelle mit ${names} Namen, ${Object.keys(now.clips).length} Clip-Bibliotheken.`);
