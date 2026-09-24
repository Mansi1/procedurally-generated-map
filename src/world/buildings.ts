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
  | 'forager'
  | 'farm';

export type Stock = Record<Exclude<ResourceType, 'none'>, number>;

export interface BuildingDef {
  label: string;
  /** Taste, mit der der Typ ausgewählt wird. */
  key: string;
  color: Color;
  shape: number;
  /**
   * Breite des Modells in Welt-Tiles - nur fürs Bild. Höchstens so groß wie
   * `footprint`, sonst ragt es in Nachbarfelder, auf denen gebaut werden darf.
   */
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
  /** Trefferpunkte, wenn es unbeschädigt ist - Werte wie in AoE2. */
  hp: number;
}

/** Was ein Dorfbewohner sammeln kann. */
export type GatherType = keyof Stock;
export const GATHER_TYPES: readonly GatherType[] = ['wood', 'stone', 'gold', 'berries'];

/**
 * Größter erlaubter Anstieg unter einem Gebäude, in Tiles Höhe je Tile Breite
 * (0.3 ~ 17°). Steiler würde das Modell mit einer Seite in der Luft hängen.
 */
export const MAX_BUILD_SLOPE = 0.3;

/** Untergründe, auf denen überhaupt gebaut werden kann. */
const BUILDABLE = ['beach', 'desert', 'grass', 'forest', 'snow'] as const;

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  town_center: {
    label: 'Hauptgebäude',
    key: '1',
    // Spielerfarbe - wie der Kittel der Dorfbewohner. Sie steht auf Fahne und
    // Bannern des Modells (Material Paint).
    color: Color.rgb(70, 110, 190),
    shape: SHAPE.townCenter,
    size: 2,
    footprint: 3,
    terrain: BUILDABLE,
    cost: { wood: 200, stone: 100 },
    provides: 10,
    // Das Hauptgebäude nimmt alles an - wie in AoE2 reicht es am Anfang allein.
    accepts: GATHER_TYPES,
    hp: 2400,
    trains: true,
  },
  house: {
    label: 'Haus',
    key: '2',
    color: Color.rgb(214, 158, 96),
    shape: SHAPE.house,
    size: 0.8,
    footprint: 1,
    terrain: BUILDABLE,
    cost: { wood: 30 },
    provides: 5,
    accepts: [],
    hp: 550,
    trains: false,
  },
  lumberjack: {
    label: 'Holzlager',
    key: '3',
    color: Color.rgb(126, 92, 48),
    shape: SHAPE.lumberCamp,
    size: 1,
    footprint: 1,
    terrain: BUILDABLE,
    cost: { wood: 50 },
    provides: 0,
    accepts: ['wood'],
    hp: 600,
    trains: false,
  },
  mine: {
    label: 'Minenlager',
    key: '4',
    color: Color.rgb(150, 152, 162),
    shape: SHAPE.miningCamp,
    size: 1,
    footprint: 1,
    // Minenlager stehen am Fuß des Gebirges, nicht darauf - auf Fels selbst
    // lässt sich nicht bauen, Stein und Gold liegen aber gleich daneben.
    terrain: BUILDABLE,
    cost: { wood: 60, stone: 20 },
    provides: 0,
    accepts: ['stone', 'gold'],
    hp: 600,
    trains: false,
  },
  forager: {
    label: 'Mühle',
    key: '5',
    color: Color.rgb(198, 74, 84),
    shape: SHAPE.mill,
    size: 0.86,
    footprint: 1,
    terrain: BUILDABLE,
    cost: { wood: 40 },
    provides: 0,
    accepts: ['berries'],
    hp: 600,
    trains: false,
  },
  farm: {
    label: 'Feld',
    key: '6',
    color: Color.rgb(196, 168, 82),
    shape: SHAPE.farmWheat,
    // Felder werden Tile für Tile angelegt; nebeneinander wachsen sie zu einem
    // großen Feld zusammen. Das Modell deckt 3x3 Tiles ab und zeigt nur die
    // eigenen (siehe FarmState.tiles).
    size: 3,
    footprint: 1,
    // Auf Sand und Schnee wächst nichts.
    terrain: ['grass', 'forest'],
    // Ein Neuntel eines AoE2-Felds (60 Holz für 3x3).
    cost: { wood: 7 },
    provides: 0,
    accepts: [],
    hp: 60,
    trains: false,
  },
};

export const BUILDING_ORDER: BuildingType[] = [
  'town_center',
  'house',
  'lumberjack',
  'mine',
  'forager',
  'farm',
];

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

/** Höchstens so viele Dorfbewohner stehen gleichzeitig in der Warteschlange eines Hauptgebäudes. */
export const MAX_TRAINING_QUEUE = 25;
