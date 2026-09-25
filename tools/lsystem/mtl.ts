// MTL-Datei zu einem Baum: feste Farben aus materials.ts, Blätter als Farbe
// (Form) oder mit Foto-Textur (map_Kd, Alpha über map_d); die Rinde bekommt im
// Foto-Modus ihre Kachel-Textur (map_Kd, die vt am Stamm wickeln sie ab).
import { BARKS, barkFile } from './bark/data.ts';
import { textureFile, textureTint, type LeafMode } from './foliage.ts';
import type { Tree } from './lsystem.ts';
import { MATERIALS, type Material } from './materials.ts';

const isMaterial = (name: string): name is Material => Object.hasOwn(MATERIALS, name);
const rgb = (c: readonly number[]) => c.map((v) => v.toFixed(3)).join(' ');

/** `textureDir`: Pfad der Blattbilder aus Sicht der MTL-Datei. */
export function mtlFile(tree: Tree, mode: LeafMode, textureDir: string): string {
  let out = '';
  for (const name of [...tree.model.used].sort()) {
    out += `\nnewmtl ${name}\n`;
    const info = tree.leafMaterials.get(name);
    if (mode === 'texture' && tree.bark && name === tree.bark.material) {
      out += `Kd ${rgb(BARKS[tree.bark.texture].average)}\nmap_Kd ${textureDir}/${barkFile(tree.bark.texture)}\n`;
    } else if (isMaterial(name)) out += `Kd ${rgb(MATERIALS[name])}\n`;
    else if (!info) throw new Error(`Keine Farbe für ${name}`);
    else if (mode === 'shape') out += `Kd ${rgb(info.color)}\n`;
    else {
      const file = `${textureDir}/${textureFile(info)}`;
      out += `Kd ${rgb(textureTint(info))}\nmap_Kd ${file}\nmap_d ${file}\n`;
    }
    out += 'Ka 0 0 0\nKs 0 0 0\nd 1\nillum 1\n';
  }
  return out;
}
