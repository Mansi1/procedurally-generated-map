// buildings.ts
// Die Gebäudetypen und der Dorfbewohner: Aussehen, Bauplatz-Regeln, Kosten,
// Arbeitstempo - was Welt-Logik und Oberfläche darüber wissen müssen. Die
// Definition jedes Gebäudes steht in seiner Klasse (building/TownCenter.ts,
// House.ts, ...); BUILDINGS sammelt sie hier für alle, die nach Art fragen.
//
// Gefördert wird wie in AoE2 von Dorfbewohnern: Sie sammeln am Vorkommen und
// tragen die Ladung zum nächsten Lager, das diese Ressource annimmt.

import { Color } from '../functions/Color';
import { SHAPE } from '../gl/entityRenderer';
import { GATHER_TYPES } from './building/common';
import type { ResourceType } from '../map';

export type Stock = Record<Exclude<ResourceType, 'none'>, number>;

/** Was ein Dorfbewohner sammeln kann. */
export type GatherType = keyof Stock;
export { GATHER_TYPES };

/**
 * Größter erlaubter Anstieg unter einem Gebäude, in Tiles Höhe je Tile Breite
 * (0.3 ~ 17°). Steiler würde das Modell mit einer Seite in der Luft hängen.
 */
export const MAX_BUILD_SLOPE = 0.3;

// Gebäude: Arten, Definitionen und Reihenfolge kommen aus den Klassen (building/).
export { BUILDINGS, BUILDING_ORDER, type BuildingType, type BuildingDefinition } from './building';

export type CropType = 'wheat' | 'corn';

export interface CropDef {
  label: string;
  shape: number;
  /** Nahrung je Aussaat. */
  food: number;
  /** Sekunden von der Aussaat, bis geerntet werden kann. */
  growTime: number;
  /** Faktor auf FARM_RATE - Mais erntet sich langsamer. */
  rate: number;
  /** Mit der Sense gemäht statt von Hand geerntet. */
  scythe: boolean;
}

/**
 * Was auf einem Feld wachsen kann - Ertrag je ganzem Feld grob wie ein
 * AoE2-Feld (175 Nahrung), Wuchs ab der Aussaat einer Furche.
 */
export const CROPS: Record<CropType, CropDef> = {
  wheat: { label: 'Weizen', shape: SHAPE.farmWheat, food: 175, growTime: 40, rate: 1, scythe: true },
  // Maiskolben werden von Hand gebrochen - Weizen wird gemäht.
  corn: { label: 'Mais', shape: SHAPE.farmCorn, food: 250, growTime: 70, rate: 0.8, scythe: false },
};

/**
 * Furchen je Feld, bei jeder Frucht gleich (ROWS in tools/models/farms.mjs).
 * Drei je Tile-Reihe; in jeder arbeitet höchstens ein Bauer - ein ganzes Feld
 * beschäftigt bis zu neun.
 */
export const FIELD_ROWS = 9;
/** Sekunden, bis ein Bauer eine Furche über drei Tiles umgepflügt bzw. eingesät hat. */
export const PLOUGH_TIME = 12;
export const SOW_TIME = 8;

export const CROP_ORDER: CropType[] = ['wheat', 'corn'];

/** Nahrung je Sekunde, die ein Bauer erntet (mal CropDef.rate). */
export const FARM_RATE = 0.7;
/**
 * Neu säen kostet - wie in AoE2 - etwa so viel wie das Feld: je abgeernteter
 * Furche eines Tiles 2 Holz (drei Furchen je Tile). Die erste Aussaat ist im
 * Preis des Felds enthalten.
 */
export const RESEED_COST: Partial<Stock> = { wood: 2 };

/**
 * Startvorrat. Reicht für ein Hauptgebäude, eine Handvoll Dorfbewohner und
 * das erste Lager - ohne ihn stünde das Spiel still: Dorfbewohner kosten
 * Nahrung, und Nahrung sammeln nur Dorfbewohner.
 */
export function initialStock(): Stock {
  return { wood: 350, stone: 120, gold: 0, berries: 200 };
}

/** Spielerfarben zur Auswahl in den Einstellungen - wie in AoE2. */
export const PLAYER_COLORS: Record<string, { label: string; color: Color }> = {
  green: { label: 'Grün', color: Color.rgb(64, 160, 72) },
  blue: { label: 'Blau', color: Color.rgb(52, 92, 200) },
  red: { label: 'Rot', color: Color.rgb(200, 48, 48) },
  yellow: { label: 'Gelb', color: Color.rgb(226, 196, 40) },
  cyan: { label: 'Türkis', color: Color.rgb(40, 180, 190) },
  purple: { label: 'Lila', color: Color.rgb(140, 64, 180) },
  grey: { label: 'Grau', color: Color.rgb(140, 140, 140) },
  orange: { label: 'Orange', color: Color.rgb(230, 120, 30) },
};

/**
 * Farbe des Spielers: Kittel und Kleid der Dorfbewohner, Band, Wappen und
 * Fahnen der Gebäude, gestreifte Mühlenflügel, die Sammelpunkt-Fahne. Wird
 * bei jedem Bild gelesen - die Einstellungen können sie ändern.
 */
export const player = { color: PLAYER_COLORS.green.color };

/** Der Dorfbewohner: wird im Hauptgebäude ausgebildet und sammelt Rohstoffe. */
export const VILLAGER = {
  label: 'Dorfbewohner',
  key: 'v',
  cost: { berries: 50 } as Partial<Stock>,
  /** Ausbildungszeit in Sekunden. */
  trainTime: 6,
  /** Trefferpunkte, wenn er unverletzt ist - wie in AoE2. */
  hp: 25,
  /** Tiles je Sekunde. */
  speed: 3.2,
  /** So viel trägt er, bevor er zum Lager geht. */
  capacity: 10,
  /**
   * Figurgröße in Tiles - nur fürs Bild; die Figur ist 1.7-mal so hoch. Die
   * Modelle rechnen mit 1 Tile = 5 m: 0.2 * 1.7 * 5 m = 1.7 m, so passt ein
   * Dorfbewohner durch die 2.1 m hohen Türen der Gebäude.
   */
  size: 0.2,
  /** Sammeltempo je Sekunde, solange er am Vorkommen steht. */
  gatherRate: { wood: 0.8, stone: 0.6, gold: 0.5, berries: 0.9 } as Record<GatherType, number>,
  /** Wie weit er nach einem leeren Feld nach dem nächsten derselben Art sucht. */
  searchRadius: 16,
} as const;

/**
 * Höchstens so viele Dorfbewohner arbeiten an einem Vorkommen. Wer
 * darüber hinaus hingeschickt wird, nimmt das nächste freie derselben Art.
 */
export const MAX_GATHERERS = 6;

export type AnimalKind = 'deer' | 'hare';

export interface AnimalDef {
  label: string;
  shape: number;
  /** Höhe in Tiles (1 Tile = 5 m) - der Hase etwas größer als echt, sonst sähe man ihn kaum. */
  height: number;
  /** So viele Speerwürfe hält es aus. */
  hp: number;
  /** Nahrung, die der Kadaver hergibt. */
  food: number;
  /** Tiles je Sekunde beim Umherziehen und auf der Flucht. */
  walk: number;
  flee: number;
  /**
   * Hasen sprinten nur kurz (Sekunden) und müssen dann verschnaufen - so holt
   * ein Jäger sie ein. Rehe laufen gleichmäßig, etwas langsamer als er.
   */
  sprint?: { time: number; rest: number; slow: number };
  /** Ab dieser Nähe (Tiles) eines Dorfbewohners flieht es. */
  fear: number;
  /** So viele leben zusammen (von, bis). */
  herd: [number, number];
  /** Tiles zwischen zwei Schritten - die Beine schwingen danach. */
  stride: number;
}

/** Wild zum Jagen - Fleisch zählt als Nahrung, abgeliefert wie Beeren. */
export const ANIMALS: Record<AnimalKind, AnimalDef> = {
  deer: {
    label: 'Reh', shape: SHAPE.deer, height: 0.27, hp: 3, food: 140, walk: 0.7, flee: 2.7,
    fear: 4, herd: [2, 4], stride: 0.5,
  },
  hare: {
    label: 'Hase', shape: SHAPE.hare, height: 0.13, hp: 1, food: 40, walk: 0.5, flee: 4.2,
    sprint: { time: 1.4, rest: 2.2, slow: 1.1 }, fear: 3, herd: [1, 2], stride: 0.35,
  },
};

/** Jagen: Wurfweite des Speers (Tiles), Sekunden zwischen zwei Würfen, Zerlegen (Nahrung je Sekunde). */
export const HUNT = { range: 2.2, reload: 1.4, butcherRate: 1.0 };

/** Höchstens so viele Dorfbewohner stehen gleichzeitig in der Warteschlange eines Hauptgebäudes. */
export const MAX_TRAINING_QUEUE = 25;
