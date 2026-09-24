// Writes the field models (farmsGen.mjs) as OBJ files for a look - the game
// builds them itself at start-up.
// Usage: node tools/models/farms.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { FARM_KINDS, farmModel } from './farmsGen.mjs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node tools/models/farms.mjs <outDir>');
for (const kind of FARM_KINDS) {
  const { obj, mtl } = farmModel(kind);
  writeFileSync(`${dir}/farm_${kind}.obj`, obj);
  writeFileSync(`${dir}/farm_${kind}.mtl`, mtl);
  console.log(`wrote farm_${kind} (${(obj.length / 1024).toFixed(0)} KB)`);
}
