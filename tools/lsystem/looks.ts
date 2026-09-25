// Aussehen der Materialien eines Baumes für die Vorschau (render.ts): Farben
// aus materials.ts, Blätter als Farbe (Form) oder Foto-Textur - im Browser geladen.
import { textureFile, textureTint, type LeafMode } from './foliage.ts';
import type { Tree } from './lsystem.ts';
import { MATERIALS, type Material } from './materials.ts';
import { makeTexture, type Look, type Texture } from './render.ts';

const IMAGES = import.meta.glob('./leaves/img/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Geladene Texturen je Datei und Einfärbung - Galerie und Spielwiese laden jede nur einmal. */
const textures = new Map<string, Promise<Texture>>();

function texture(file: string, tint: readonly [number, number, number]): Promise<Texture> {
  const key = `${file}|${tint.join(',')}`;
  let t = textures.get(key);
  if (!t) {
    const url = IMAGES[`./leaves/img/${file}`];
    if (!url) throw new Error(`Blattbild fehlt: ${file} - npx vite-node tools/lsystem/leaves/fetch.ts`);
    const image = new Image();
    image.src = url;
    t = image.decode().then(() => makeTexture(image, tint));
    textures.set(key, t);
  }
  return t;
}

const isMaterial = (name: string): name is Material => Object.hasOwn(MATERIALS, name);

/** Aussehen je Materialname im Modell; wartet, bis die Blatt-Texturen geladen sind. */
export async function looksFor(tree: Tree, mode: LeafMode): Promise<(material: string) => Look | undefined> {
  const leaves = new Map<string, Look>();
  await Promise.all([...tree.leafMaterials].map(async ([name, info]) => {
    leaves.set(name, mode === 'shape' ? { color: info.color } : { texture: await texture(textureFile(info), textureTint(info)) });
  }));
  return (name) => (isMaterial(name) ? { color: MATERIALS[name] } : leaves.get(name));
}
