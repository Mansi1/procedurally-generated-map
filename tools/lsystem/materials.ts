// Farben der L-System-Modelle (r, g, b in 0..1) - für die Vorschau und die
// MTL-Datei. Die Werte stammen aus PALETTE in tools/models/lib.mjs (Bäume) und
// tools/models/farmsGen.mjs (Weizen, Mais), damit alles zum Spiel passt; die
// übrigen (Rinden, Herbstlaub, Blüten) sind hier neu.
import type { Tone } from './leaves/sources.ts';

export const MATERIALS = {
  Bark: [0.33, 0.22, 0.12],
  BarkDark: [0.22, 0.16, 0.11],
  BarkGrey: [0.5, 0.49, 0.45],
  BarkWhite: [0.86, 0.84, 0.78],
  BarkRed: [0.5, 0.27, 0.16],
  BarkPale: [0.74, 0.69, 0.58],
  Cactus: [0.3, 0.46, 0.25],
  Leaf: [0.3, 0.52, 0.22],
  LeafLight: [0.45, 0.62, 0.25],
  LeafSilver: [0.52, 0.6, 0.46],
  LeafBlue: [0.36, 0.5, 0.44],
  Ivy: [0.3, 0.52, 0.2],
  IvyDark: [0.19, 0.38, 0.14],
  NeedleLight: [0.5, 0.66, 0.3],
  AutumnYellow: [0.9, 0.74, 0.2],
  AutumnOrange: [0.88, 0.47, 0.14],
  AutumnRed: [0.74, 0.18, 0.12],
  AutumnBrown: [0.58, 0.38, 0.17],
  BlossomPink: [0.95, 0.7, 0.78],
  BlossomWhite: [0.96, 0.94, 0.9],
  FruitRed: [0.8, 0.12, 0.1],
  Wheat: [0.82, 0.7, 0.45],
  WheatStem: [0.76, 0.66, 0.4],
  WheatEar: [0.94, 0.83, 0.56],
  CornStalk: [0.46, 0.59, 0.23],
  CornLeaf: [0.38, 0.56, 0.2],
  CornHusk: [0.62, 0.7, 0.34],
  Tassel: [0.82, 0.7, 0.4],
} as const satisfies Record<string, readonly [number, number, number]>;

export type Material = keyof typeof MATERIALS;

/** Farbton eines Laub-Materials - entscheidet, ob ein Blattfoto direkt passt (foliage.ts). */
export function toneOf(material: Material): Tone {
  if (material.startsWith('Autumn')) return 'autumn';
  if (material.startsWith('Blossom')) return 'blossom';
  return 'green';
}
