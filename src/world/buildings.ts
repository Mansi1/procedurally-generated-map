// buildings.ts
// Die Gebäudetypen und der Dorfbewohner an einer Stelle: Aussehen, Bauplatz-
// Regeln, Kosten, Arbeitstempo. Alles, was die Welt-Logik und die Oberfläche
// darüber wissen müssen, steht hier - nicht verteilt über Renderer und UI.
//
// Gefördert wird wie in AoE2 von Dorfbewohnern: Sie sammeln am Vorkommen und
// tragen die Ladung zum nächsten Lager, das diese Ressource annimmt.

import { Color } from '../functions/Color';
import { SHAPE } from '../gl/entityRenderer';
import type { ResourceType } from '../map';
import type { TileType } from '../noise';

export type BuildingType =
  | 'town_center'
  | 'house'
  | 'lumberjack'
  | 'mine'
  | 'forager';

export type Stock = Record<Exclude<ResourceType, 'none'>, number>;

export interface BuildingDef {
  label: string;
  /** Taste, mit der der Typ ausgewählt wird. */
  key: string;
  color: Color;
  shape: number;
  /** Kantenlänge in Welt-Tiles - nur fürs Bild. */
  size: number;
  /** Belegte Felder, als Kantenlänge in Tiles. Ungerade, damit es zentriert liegt. */
  footprint: number;
  /** Erlaubte Untergründe. */
  terrain: readonly TileType[];
  cost: Partial<Stock>;
  /** Bevölkerungsplätze, die das Gebäude schafft. */
  provides: number;
  /** Ressourcen, die Dorfbewohner hier abliefern können. */
  accepts: readonly GatherType[];
  /** Bildet Dorfbewohner aus. */
  trains: boolean;
}

/** Was ein Dorfbewohner sammeln kann. */
export type GatherType = keyof Stock;
export const GATHER_TYPES: readonly GatherType[] = ['wood', 'stone', 'gold', 'berries'];

/** Untergründe, auf denen überhaupt gebaut werden kann. */
const BUILDABLE = ['beach', 'desert', 'grass', 'forest', 'snow'] as const;

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  town_center: {
    label: 'Hauptgebäude',
    key: '1',
    color: Color.rgb(226, 232, 240),
    shape: SHAPE.square,
    size: 3,
    footprint: 3,
    terrain: BUILDABLE,
    cost: { wood: 200, stone: 100 },
    provides: 10,
    // Das Hauptgebäude nimmt alles an - wie in AoE2 reicht es am Anfang allein.
    accepts: GATHER_TYPES,
    trains: true,
  },
  house: {
    label: 'Haus',
    key: '2',
    color: Color.rgb(214, 158, 96),
    shape: SHAPE.square,
    size: 1.6,
    footprint: 1,
    terrain: BUILDABLE,
    cost: { wood: 30 },
    provides: 5,
    accepts: [],
    trains: false,
  },
  lumberjack: {
    label: 'Holzlager',
    key: '3',
    color: Color.rgb(126, 92, 48),
    shape: SHAPE.triangle,
    size: 2,
    footprint: 1,
    terrain: BUILDABLE,
    cost: { wood: 50 },
    provides: 0,
    accepts: ['wood'],
    trains: false,
  },
  mine: {
    label: 'Minenlager',
    key: '4',
    color: Color.rgb(150, 152, 162),
    shape: SHAPE.diamond,
    size: 2,
    footprint: 1,
    // Minenlager stehen am Fuß des Gebirges, nicht darauf - auf Fels selbst
    // lässt sich nicht bauen, Stein und Gold liegen aber gleich daneben.
    terrain: BUILDABLE,
    cost: { wood: 60, stone: 20 },
    provides: 0,
    accepts: ['stone', 'gold'],
    trains: false,
  },
  forager: {
    label: 'Mühle',
    key: '5',
    color: Color.rgb(198, 74, 84),
    shape: SHAPE.circle,
    size: 1.6,
    footprint: 1,
    terrain: BUILDABLE,
    cost: { wood: 40 },
    provides: 0,
    accepts: ['berries'],
    trains: false,
  },
};

export const BUILDING_ORDER: BuildingType[] = [
  'town_center',
  'house',
  'lumberjack',
  'mine',
  'forager',
];

/**
 * Startvorrat. Reicht für ein Hauptgebäude, eine Handvoll Dorfbewohner und
 * das erste Lager - ohne ihn stünde das Spiel still: Dorfbewohner kosten
 * Nahrung, und Nahrung sammeln nur Dorfbewohner.
 */
export function initialStock(): Stock {
  return { wood: 350, stone: 120, gold: 0, berries: 200 };
}

/** Der Dorfbewohner: wird im Hauptgebäude ausgebildet und sammelt Rohstoffe. */
export const VILLAGER = {
  label: 'Dorfbewohner',
  key: 'v',
  cost: { berries: 50 } as Partial<Stock>,
  /** Ausbildungszeit in Sekunden. */
  trainTime: 6,
  /** Tiles je Sekunde. */
  speed: 1.6,
  /** So viel trägt er, bevor er zum Lager geht. */
  capacity: 10,
  color: Color.rgb(70, 110, 190),
  /** Kantenlänge in Tiles - nur fürs Bild. */
  size: 0.55,
  /** Sammeltempo je Sekunde, solange er am Vorkommen steht. */
  gatherRate: { wood: 0.8, stone: 0.6, gold: 0.5, berries: 0.9 } as Record<GatherType, number>,
  /** Wie weit er nach einem leeren Feld nach dem nächsten derselben Art sucht. */
  searchRadius: 8,
} as const;

/** Höchstens so viele Dorfbewohner stehen gleichzeitig in der Warteschlange eines Hauptgebäudes. */
export const MAX_TRAINING_QUEUE = 5;
