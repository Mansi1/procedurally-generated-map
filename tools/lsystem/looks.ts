// Aussehen der Materialien eines Baumes für die Vorschau (render.ts): Farben
// aus materials.ts, Blätter als Farbe (Form) oder Foto-Textur, die Rinde immer
// als Kachel-Textur (bark/) - im Browser geladen.
import { barkFile } from './bark/data.ts';
import { textureFile, textureTint, type LeafMode } from './foliage.ts';
import type { Tree } from './lsystem.ts';
import { MATERIALS, type Material } from './materials.ts';
import type { Look, Texture } from './render.ts';

const IMAGES = {
  ...import.meta.glob('./leaves/img/*.png', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('./bark/img/*.jpg', { eager: true, query: '?url', import: 'default' }),
} as Record<string, string>;

/** Geladene Bilder je Datei - Galerie und Spielwiese laden jedes nur einmal. */
const images = new Map<string, Promise<HTMLImageElement>>();

async function texture(path: string, tint: readonly [number, number, number], tile: boolean): Promise<Texture> {
  let loading = images.get(path);
  if (!loading) {
    const url = IMAGES[path];
    if (!url) throw new Error(`Bild fehlt: ${path} - npx vite-node tools/lsystem/leaves/fetch.ts bzw. bark/fetch.ts`);
    const image = new Image();
    image.src = url;
    loading = image.decode().then(() => image);
    images.set(path, loading);
  }
  return { image: await loading, tint, tile };
}

const isMaterial = (name: string): name is Material => Object.hasOwn(MATERIALS, name);

/** Aussehen je Materialname im Modell; wartet, bis Blatt- und Rinden-Texturen geladen sind. */
export async function looksFor(tree: Tree, mode: LeafMode): Promise<(material: string) => Look | undefined> {
  const looks = new Map<string, Look>();
  await Promise.all([...tree.leafMaterials].map(async ([name, info]) => {
    looks.set(name, mode === 'shape'
      ? { color: info.color }
      : { texture: await texture(`./leaves/img/${textureFile(info)}`, textureTint(info), false) });
  }));
  // Rinde in beiden Modi als Foto - die Vorschau hat keinen Shader wie das Spiel (treeTexture).
  if (tree.bark) looks.set(tree.bark.material, { texture: await texture(`./bark/img/${barkFile(tree.bark.texture)}`, [1, 1, 1], true) });
  return (name) => {
    // Je Name dasselbe Look-Objekt zurückgeben - sceneFromObj fasst danach zusammen.
    let look = looks.get(name);
    if (!look && isMaterial(name)) looks.set(name, look = { color: MATERIALS[name] });
    return look;
  };
}
