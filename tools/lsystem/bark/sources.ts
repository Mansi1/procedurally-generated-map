// Rinden-Texturen: nahtlos kachelbare Fotos, CC0 von Poly Haven - nur die
// Birke kommt von Wikimedia Commons (dort gibt es keine weiße Birkenrinde)
// und wird beim Verarbeiten 2x2 gespiegelt gekachelt, damit sie nahtlos wird.
// bark/fetch.ts lädt sie, verkleinert auf 512 px und schreibt img/<name>.jpg,
// textures.json und CREDITS.md.
import type { Material } from '../materials.ts';

export interface BarkSource {
  readonly source: 'polyhaven' | 'wikimedia';
  /** Poly Haven: Asset-Id; Wikimedia: Dateiname ohne "File:". */
  readonly file: string;
  readonly license: string;
  /** Kantenlänge einer Kachel in Metern - die Texturen sind quadratisch. */
  readonly meters: number;
  /** 2x2 gespiegelt kacheln, weil das Foto nicht nahtlos ist. */
  readonly mirror?: boolean;
}

export const BARK_SOURCES = {
  braun: { source: 'polyhaven', file: 'bark_brown_01', license: 'CC0', meters: 1.4 },
  eiche: { source: 'polyhaven', file: 'bark_willow', license: 'CC0', meters: 1.2 },
  glatt: { source: 'polyhaven', file: 'chinese_hackberry_bark', license: 'CC0', meters: 1.1 },
  kiefer: { source: 'polyhaven', file: 'pine_bark', license: 'CC0', meters: 1.4 },
  platane: { source: 'polyhaven', file: 'bark_platanus', license: 'CC0', meters: 1.2 },
  palme: { source: 'polyhaven', file: 'palm_bark', license: 'CC0', meters: 0.9 },
  eukalyptus: { source: 'polyhaven', file: 'eucalyptus_bark', license: 'CC0', meters: 1.4 },
  kirsche: { source: 'polyhaven', file: 'sakura_bark', license: 'CC0', meters: 0.9 },
  zeder: { source: 'polyhaven', file: 'japanese_cedar_bark', license: 'CC0', meters: 1.6 },
  birke: { source: 'wikimedia', file: 'Jacques Cartier NP 45.jpg', license: 'CC BY-SA 4.0', meters: 0.9, mirror: true },
} as const satisfies Record<string, BarkSource>;

export type BarkName = keyof typeof BARK_SOURCES;

/** Standard-Textur je Stamm-Material; Rezepte können mit barkTexture abweichen. */
export const MATERIAL_BARK: Partial<Record<Material, BarkName>> = {
  Bark: 'braun',
  BarkDark: 'eiche',
  BarkGrey: 'glatt',
  BarkWhite: 'birke',
  BarkRed: 'kiefer',
  BarkPale: 'platane',
};
