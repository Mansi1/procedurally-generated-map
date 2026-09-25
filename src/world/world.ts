// world.ts
// Der veränderliche Teil der Welt. Das Gelände ist eine reine Funktion aus
// Seed und Koordinate - alles hier drin ist es nicht: Gebäude, Dorfbewohner,
// bereits abgebaute Vorkommen, Vorrat. Genau deshalb muss es gespeichert
// werden, während das Gelände jederzeit neu berechnet werden kann.

import { findPath, lineOfSight } from './pathfinding';
import { uniqueName } from './names';
import { BUILDING_HEADING, FALL_LYING, POSE, modelEntry } from '../gl/entityRenderer';
import { RESOURCE_TYPE_LABEL, type Terrain } from '../map';
import { reliefZ } from '../noise';
import {
  BUILDINGS,
  CROPS,
  FARM_RATE,
  FIELD_ROWS,
  PLOUGH_TIME,
  SOW_TIME,
  RESOURCE_KINDS,
  YIELD,
  HUNT,
  MAX_BUILD_SLOPE,
  MAX_GATHERERS,
  VILLAGER,
  RESEED_COST,
  initialResources,
} from './catalog';
import type { AnimalKind, BuildingType, CropType, DepositType, ResourceKind, Resources } from './catalog';
import {
  buildingFromSave, createBuilding, furrowFood, furrowPosition, maskCovers, CENTER_TILE,
  type Building, type Farm, type UnitProducer,
} from './building';
import { readSave, writeSave, type LoadedSave, type SaveData } from './save';
import { isAnimalKind, type Animal, type AnimalSurroundings } from './unit';
import { Wildlife } from './wildlife';
import { Farming, farmSpot, furrowKey, furrowNeeds, FIELD_INNER, METERS_PER_TILE, type FarmPhase } from './farming';
import { RUIN_DURATION, type Ruin } from './ruin';

// Gebäude sind Klassen (building/) - hier weiter unter diesen Namen erreichbar.
export type { Building, FarmPhase };

/**
 * Was ein Dorfbewohner gerade tun soll. Der Zustand (hingehen, sammeln,
 * abliefern) ergibt sich daraus und aus dem, was er trägt.
 */
export type Task =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; y: number }
  /** Sammelt am Feld (x, y), bringt volle Ladungen zum nächsten Lager. */
  | { kind: 'gather'; type: DepositType; x: number; y: number; delivering: boolean }
  /** Bringt die Ladung zu genau diesem Gebäude, danach untätig. */
  | { kind: 'deliver'; building: string }
  /**
   * Jagt dieses Tier (Speerwurf aus der Nähe), zerlegt den Kadaver und bringt
   * das Fleisch zum nächsten Lager für Nahrung. `cooldown`: Sekunden bis zum
   * nächsten Wurf.
   */
  | { kind: 'hunt'; animal: number; delivering: boolean; cooldown: number }
  /** Bestellt und erntet das Feld, bringt die Ernte zum nächsten Lager für Nahrung. */
  | { kind: 'farm'; building: string; row: number; delivering: boolean };

export interface Villager {
  id: number;
  /** Vorname - solange er lebt, trägt ihn kein anderer (siehe names.ts). */
  name: string;
  /** Dorfbewohnerin (Kleid, Schürze) oder Dorfbewohner. */
  female: boolean;
  /** Position in Welt-Tiles (Mitte der Figur). */
  x: number;
  y: number;
  /** Position vor dem letzten Tick - zum Überblenden zwischen den Ticks. */
  prevX: number;
  prevY: number;
  carrying: number;
  carryType: ResourceKind | null;
  task: Task;
  /** Warum er untätig ist, falls es einen Grund gibt - für die Anzeige. */
  problem: string | null;
  /** Verbleibende Trefferpunkte - höchstens VILLAGER.hp. */
  hp: number;
  /** Blickrichtung in Radiant (Weltkoordinaten). */
  heading: number;
  /** Was er im letzten Tick getan hat - steuert die Animation (POSE). */
  pose: number;
  /** Zurückgelegte Strecke in Tiles - die Beine schwingen danach, nicht nach der Uhr. */
  stride: number;
  prevStride: number;
  /** Sekunden bei der Arbeit - Takt der Arm-Animation. */
  workTime: number;
  prevWorkTime: number;
  /**
   * Weg zum aktuellen Ziel: die noch offenen Wegpunkte und für welches Ziel
   * er berechnet ist. Nicht gespeichert - nach dem Laden neu gesucht.
   */
  path: { x: number; y: number }[] | null;
  /** Sekunden, die er noch im Gebäude ist (abladen) - solange unsichtbar. */
  inside: number;
  pathTarget: { x: number; y: number } | null;
}

/**
 * Eine Schrittfolge (links + rechts) in Tiles. Sie wächst mit der Figur, sonst
 * rutschen die Füße - aber nicht unter 0.3 Tiles: so kleine Figuren laufen
 * sonst so schnell, dass die Beine nur noch flimmern.
 */
export const STRIDE_LENGTH = Math.max(VILLAGER.size * 1.1, 0.6);
/** Arbeitsschläge je Sekunde, in Radiant. */
export const WORK_TEMPO = 6;

/**
 * Was in der Welt passiert und man hören (oder sonst mitbekommen) soll. Die
 * Welt kennt keinen Ton - main.ts hängt sich an `onEvent` und entscheidet,
 * was davon zu hören ist.
 */
export type WorldEvent =
  /** Ein Arbeitsschlag - zeitgleich mit dem Arm in der Animation. */
  | { kind: 'strike'; resource: DepositType; x: number; y: number }
  | { kind: 'treeFall'; x: number; y: number }
  | { kind: 'deliver'; x: number; y: number }
  | { kind: 'collapse'; x: number; y: number }
  | { kind: 'trained'; x: number; y: number };

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const key = (x: number, y: number) => `${x},${y}`;


/**
 * Beerensträucher: nach dem letzten Pflücken BERRY_REST Sekunden Pause, dann
 * wachsen sie in BERRY_REGROW_TIME Sekunden von leer auf voll nach.
 */
const BERRY_REST = 90 * 60;
const BERRY_REGROW_TIME = 5 * 60;

/** Neue Figur an (x, y) - alle Laufzeit-Felder auf Anfang. */
function newVillager(id: number, x: number, y: number, name: string, female: boolean): Villager {
  return {
    id, name, female, x, y, prevX: x, prevY: y,
    carrying: 0,
    carryType: null,
    task: { kind: 'idle' },
    problem: null,
    hp: VILLAGER.hp,
    // Zur Kamera gewandt: die schaut entlang -(1, 1).
    heading: Math.PI * 0.25,
    pose: POSE.stand,
    stride: 0,
    prevStride: 0,
    workTime: 0,
    prevWorkTime: 0,
    path: null,
    pathTarget: null,
    inside: 0,
  };
}

/** Abstand der Sammelplätze von der Feldmitte, in Tiles. */
const GATHER_SPREAD = 0.4;
/** Abstand zur Gebäudekante, ab dem er abliefern kann. */
const DELIVER_REACH = 0.6;
/** So lange (Sekunden) bleibt ein Dorfbewohner beim Abladen im Gebäude. */
const INSIDE_TIME = 1.2;

export class World {
  private buildings = new Map<string, Building>();
  /** Jedes belegte Feld zeigt auf den Ankerpunkt seines Gebäudes. */
  private occupied = new Map<string, string>();
  private harvested = new Map<string, number>();
  private exhausted = new Set<string>();
  /**
   * Angepflückte Beerensträucher: volle Menge und wann zuletzt gepflückt
   * wurde (Weltzeit). Sie wachsen nach einer Pause nach (siehe regrowBerries).
   */
  private berryTiles = new Map<string, { total: number; picked: number }>();
  /**
   * Gefällte Bäume: wann (Weltzeit) und in welche Richtung (Radiant) sie
   * umgefallen sind. Ein Baum fällt beim ersten Axthieb und wird danach als
   * liegender Stamm abgebaut - wie in AoE2.
   */
  private felled = new Map<string, { at: number; dir: number }>();
  /**
   * Was ein Tile vom Gelände her versperrt, gemerkt: 0 frei, 1 Wasser,
   * 2 Baum/Fels (frei, sobald abgebaut oder gefällt). Gebäude kommen dazu
   * (siehe blockedAt).
   */
  private terrainBlock = new Map<string, number>();
  /** Für sowable(): 0 nein, 1 ja, 2 erst wenn das Vorkommen abgebaut ist. */
  private sowableTiles = new Map<string, number>();
  /** Zusammenhängende Felder je Feldstück (farmGroup) - leer, sobald sich Gebäude ändern. */
  /** Felder: Gruppen, Phase, freie Furchen, Wachsen (farming.ts). */
  private readonly farming: Farming;
  /** Umriss und Geländehöhen je Feldstück fürs Zeichnen (fieldLook) - ebenso. */
  private fieldLooks = new Map<string, { outline: { mask: number; others: number }; ground: Float32Array | null }>();
  /** Abgerissene Gebäude, die noch einstürzen (ruin.ts) - nur fürs Bild. */
  ruins: Ruin[] = [];
  /** Weltzeit in Sekunden, läuft mit den Ticks. */
  private time = 0;
  private lastDt = 0;
  private dirty = false;
  private nextId = 1;

  stock: Resources = initialResources();
  villagers: Villager[] = [];
  /** Wild - lebend und erlegt. */
  /** Das Wild: Tiere und wo schon welche entstanden sind (wildlife.ts). */
  readonly wildlife: Wildlife;
  /** Stücke (ANIMAL_CHUNK), in denen schon Tiere entstanden sind - erlegte kommen nicht wieder. */
  /** Was auf neu angelegten Feldern gesät wird - die zuletzt gewählte Frucht. */
  nextFarmCrop: CropType = 'wheat';
  onEvent: ((event: WorldEvent) => void) | null = null;
  /**
   * Länge des Baums auf Tile (x, y) in Tiles - kennt nur die Darstellung der
   * Vorkommen (main.ts setzt es). Damit arbeiten Holzfäller am liegenden Stamm.
   */
  treeLength: ((x: number, y: number) => number | undefined) | null = null;
  /**
   * Bodenhöhe (Tiles, ohne Relief-Skalierung) an einem Punkt - main.ts setzt
   * es. Dorfbewohner bekommen sie mit, wie die Bäume: auf der Grafikkarte
   * gerechnet standen sie an manchen Hängen deutlich unter dem Gelände.
   */
  groundAt: ((x: number, y: number) => number) | null = null;

  constructor(readonly terrain: Terrain, private seed: string) {
    this.farming = new Farming(this);
    this.wildlife = new Wildlife({
      terrain,
      isOccupied: (x, y) => this.occupied.has(key(x, y)),
      nextId: () => this.nextId++,
      seedHash: this.seedHash,
    });
    const saved = readSave(seed);
    if (saved) this.applySave(saved);
  }

  /** Seed als Zahl - damit die Tiere in jeder Welt woanders stehen. */
  private get seedHash(): number {
    let h = 0;
    for (let i = 0; i < this.seed.length; i++) h = Math.imul(h ^ this.seed.charCodeAt(i), 2654435761);
    return (h >>> 0) % 100000;
  }


  // --- Abfragen ------------------------------------------------------------

  at(x: number, y: number): Building | undefined {
    const anchor = this.occupied.get(key(x, y));
    return anchor ? this.buildings.get(anchor) : undefined;
  }

  building(anchor: string): Building | undefined {
    return this.buildings.get(anchor);
  }

  /** Alle Gebäude - für das Auswählen mehrerer gleichartiger. */
  allBuildings(): IterableIterator<Building> {
    return this.buildings.values();
  }

  anchorOf(building: Building): string {
    return building.anchor;
  }

  /** Alle Hauptgebäude, in der Reihenfolge, in der sie gebaut wurden. */
  townCenters(): Building[] {
    return [...this.buildings.values()].filter((b) => b.type === 'town_center');
  }

  hasTownCenter(): boolean {
    for (const b of this.buildings.values()) if (b.type === 'town_center') return true;
    return false;
  }

  /** Das Hauptgebäude, das einem Welt-Punkt am nächsten liegt. */
  nearestTownCenter(x: number, y: number): UnitProducer | undefined {
    let best: UnitProducer | undefined;
    let bestDistance = Infinity;
    for (const b of this.buildings.values()) {
      if (b.type !== 'town_center' || !b.isUnitProducer()) continue;
      const d = Math.hypot(b.x + 0.5 - x, b.y + 0.5 - y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    return best;
  }

  /** Lebende Dorfbewohner und Bevölkerungsgrenze aus Hauptgebäuden und Häusern. */
  population(): { used: number; cap: number; training: number } {
    let cap = 0;
    let training = 0;
    for (const b of this.buildings.values()) {
      cap += b.definition.housing;
      if (b.isUnitProducer()) training += b.queuedUnits;
    }
    return { used: this.villagers.length, cap, training };
  }

  /**
   * Dorfbewohner je Ressource - alle mit dem Auftrag, sie zu sammeln, auch
   * wenn sie gerade eine Ladung zum Lager tragen.
   */
  gatherers(): { counts: Record<ResourceKind, number>; idle: number } {
    const counts = Object.fromEntries(RESOURCE_KINDS.map((r) => [r, 0])) as Record<ResourceKind, number>;
    let idle = 0;
    for (const v of this.villagers) {
      if (v.task.kind === 'gather') counts[YIELD[v.task.type]]++;
      else if (v.task.kind === 'farm' || v.task.kind === 'hunt') counts.food++;
      else if (v.task.kind === 'idle') idle++;
    }
    return { counts, idle };
  }

  /**
   * Wie weit ein Baum umgefallen ist: Winkel (Radiant, 0 = steht) und
   * Richtung, oder null, wenn er noch steht. Der Fall beschleunigt wie unter
   * Schwerkraft, federt beim Aufschlag einmal nach und bleibt dann liegen.
   * @param blend Anteil des laufenden Ticks, damit die Bewegung flüssig ist
   */
  fall(x: number, y: number, blend: number): { angle: number; dir: number } | null {
    const f = this.felled.get(key(x, y));
    if (!f) return null;
    const t = this.timeAt(blend) - f.at;
    const DURATION = 1.1;
    const BOUNCE = 0.35;
    const LYING = FALL_LYING;
    let angle: number;
    if (t < DURATION) angle = LYING * (t / DURATION) ** 2;
    else if (t < DURATION + BOUNCE) angle = LYING - 0.14 * Math.sin((Math.PI * (t - DURATION)) / BOUNCE);
    else angle = LYING;
    return { angle, dir: f.dir };
  }

  /**
   * Alles über ein Vorkommen für die Anzeige: Art, Rest, Anfangsmenge und wie
   * viele Dorfbewohner gerade daran sammeln. null, wenn dort nichts (mehr) ist.
   */
  resourceInfo(x: number, y: number):
      { type: DepositType; remaining: number; total: number; gatherers: number; regrowIn?: number } | null {
    const k = key(x, y);
    const bush = this.berryTiles.get(k);
    const bushTotal = bush?.total;
    const found = this.remainingAt(x, y);
    // Leere Beerensträucher bleiben auswählbar - sie wachsen nach.
    if (bushTotal === undefined && (!found.type || found.amount <= 0)) return null;
    let gatherers = 0;
    for (const v of this.villagers) {
      if (v.task.kind === 'gather' && v.task.x === x && v.task.y === y) gatherers++;
    }
    const total = bushTotal ?? this.terrain.getTile(x, y).resourceAmount;
    const remaining = bushTotal !== undefined ? Math.max(0, total - (this.harvested.get(k) ?? 0)) : found.amount;
    return {
      type: bushTotal !== undefined ? 'berries' : found.type!,
      remaining,
      total,
      gatherers,
      // Sekunden, bis der Strauch wieder voll ist: Rest der Pause plus Wachsen.
      regrowIn: bush
        ? Math.max(0, BERRY_REST - (this.time - bush.picked)) + (total - remaining) / (total / BERRY_REGROW_TIME)
        : undefined,
    };
  }

  /**
   * Anteil, der an einem Feld noch übrig ist (0..1), ohne das Gelände neu zu
   * berechnen - `total` kennt der Aufrufer schon.
   */
  remainingShare(x: number, y: number, total: number): number {
    const k = key(x, y);
    if (this.exhausted.has(k)) return 0;
    const taken = this.harvested.get(k);
    return taken === undefined ? 1 : Math.max(0, 1 - taken / total);
  }

  /** Was an einem Feld noch im Boden liegt. */
  remainingAt(x: number, y: number): { type: DepositType | null; amount: number } {
    const k = key(x, y);
    if (this.exhausted.has(k)) return { type: null, amount: 0 };
    const tile = this.terrain.getTile(x, y);
    if (tile.resource === 'none' || tile.resourceAmount <= 0) return { type: null, amount: 0 };
    return {
      type: tile.resource as DepositType,
      amount: tile.resourceAmount - (this.harvested.get(k) ?? 0),
    };
  }

  private canPay(cost: Partial<Resources>): boolean {
    return (Object.keys(cost) as ResourceKind[]).every(
        (r) => this.stock[r] >= (cost[r] ?? 0));
  }

  private pay(cost: Partial<Resources>, factor = 1) {
    for (const [r, amount] of Object.entries(cost) as [ResourceKind, number][]) {
      this.stock[r] -= Math.floor(amount * factor);
    }
  }

  affordable(type: BuildingType): boolean {
    return this.canPay(BUILDINGS[type].cost);
  }

  canAffordVillager(): boolean {
    return this.canPay(VILLAGER.cost);
  }

  /** Die Felder, die ein Gebäude an (x, y) belegen würde - ein Feld nur seine Tiles. */
  private footprintTiles(x: number, y: number, type: BuildingType, farmTiles = CENTER_TILE): [number, number][] {
    // Felder: die Tiles ihrer Maske in den 3x3 (ältere Spielstände haben
    // noch ganze 3x3-Felder).
    const r = type === 'farm' ? 1 : (BUILDINGS[type].footprint - 1) / 2;
    const tiles: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (type === 'farm' && !maskCovers(farmTiles, dx, dy)) continue;
        tiles.push([x + dx, y + dy]);
      }
    }
    return tiles;
  }

  /**
   * Tiles eines Felds für den Shader: die eigenen (Bit 0..8) und ringsum die,
   * auf denen ein anderes Feld liegt (Bit 9 + Seite * 3 + Lage, Seite 0/1 vor
   * bzw. hinter dem Feld entlang x, 2/3 entlang y), dazu die Tiles der 3x3,
   * die zu einem anderen Feld gehören (`others`, Bit je Tile). Dort fällt die Schnur
   * weg - aneinanderliegende Felder gehen ineinander über.
   */
  fieldOutline(x: number, y: number, tiles: number, self?: Building): { mask: number; others: number } {
    let mask = tiles;
    let others = 0;
    const other = (tx: number, ty: number) => {
      const b = this.at(tx, ty);
      return b !== undefined && b.isFarm() && b !== self;
    };
    // Tiles der 3x3, die nicht zu diesem Feld gehören, aber zu einem anderen.
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (!((tiles >> (i * 3 + j)) & 1) && other(x - 1 + i, y - 1 + j)) others |= 1 << (i * 3 + j);
      }
    }
    for (let k = 0; k < 3; k++) {
      if (other(x - 2, y - 1 + k)) mask |= 1 << (9 + k);
      if (other(x + 2, y - 1 + k)) mask |= 1 << (12 + k);
      if (other(x - 1 + k, y - 2)) mask |= 1 << (15 + k);
      if (other(x - 1 + k, y + 2)) mask |= 1 << (18 + k);
    }
    return { mask, others };
  }

  /**
   * Umgepflügte Äcker für den Gelände-Shader: je Tile im Quadrat ab (x0, y0)
   * mit Kantenlänge `size` vier Bytes - wie weit die drei Furchen des Tiles
   * entlang y gepflügt sind (0..255) und 255, wenn dort ein Feld liegt.
   * Gibt null zurück, wenn im Ausschnitt kein Feld liegt.
   */
  fieldSoil(x0: number, y0: number, size: number, out: Uint8Array): Uint8Array | null {
    out.fill(0);
    let any = false;
    for (const b of this.buildings.values()) {
      if (!b.isFarm() || b.x < x0 - 1 || b.y < y0 - 1 || b.x > x0 + size || b.y > y0 + size) continue;
      const farm = b;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if (!((farm.tiles >> (i * 3 + j)) & 1)) continue;
          const [tx, ty] = [b.x - 1 + i - x0, b.y - 1 + j - y0];
          if (tx < 0 || ty < 0 || tx >= size || ty >= size) continue;
          const o = (ty * size + tx) * 4;
          for (let k = 0; k < 3; k++) {
            const row = i * 3 + k;
            const f = farm.furrows[row];
            const q = f.plough >= 1 ? 1 : furrowPosition(farm.tiles, row, f.plough);
            out[o + k] = Math.round(Math.max(0, Math.min(1, q * 3 - j)) * 255);
          }
          out[o + 3] = 255;
          any = true;
        }
      }
    }
    return any ? out : null;
  }

  /**
   * Was ein Feldstück zum Zeichnen braucht und sich nur ändert, wenn Gebäude
   * dazukommen oder wegfallen: der Umriss (fieldOutline) und je Furche an
   * Anfang, Mitte und Ende die Geländehöhe (Tiles, ohne Relief-Skalierung;
   * ab Index 0) und das Gefälle quer zur Furche (ab Index 27).
   */
  fieldLook(building: Farm) {
    const anchor = building.anchor;
    let look = this.fieldLooks.get(anchor);
    if (!look) {
      let ground: Float32Array | null = null;
      if (this.groundAt) {
        ground = new Float32Array(FIELD_ROWS * 6);
        const gap = (2 * FIELD_INNER) / FIELD_ROWS;
        const half = gap / 2 / METERS_PER_TILE;
        for (let row = 0; row < FIELD_ROWS; row++) {
          const x = building.x + 0.5 + (-FIELD_INNER + (row + 0.5) * gap) / METERS_PER_TILE;
          for (let i = 0; i < 3; i++) {
            const y = building.y + 0.5 - 1.5 + i * 1.5;
            ground[row * 3 + i] = this.groundAt(x, y);
            ground[27 + row * 3 + i] = (this.groundAt(x + half, y) - this.groundAt(x - half, y)) / (2 * half);
          }
        }
      }
      look = { outline: this.fieldOutline(building.x, building.y, building.tiles, building), ground };
      this.fieldLooks.set(anchor, look);
    }
    return look;
  }

  /**
   * Die Tiles, die ein Feld an (x, y) bekäme (siehe Farm.tiles): das
   * Tile selbst, wenn dort gesät werden kann, sonst keins.
   */
  farmTiles(x: number, y: number): number {
    return this.sowable(x, y) ? CENTER_TILE : 0;
  }

  /**
   * Prüft den Bauplatz. Gibt den Grund zurück, warum es nicht geht, oder null.
   * Die Meldung geht so in die Oberfläche - deshalb sind es ganze Sätze.
   */
  canPlace(x: number, y: number, type: BuildingType): string | null {
    const def = BUILDINGS[type];

    // Wie in AoE2 fängt alles beim Hauptgebäude an: dort entstehen die
    // Dorfbewohner, und die erste Ernte wird dort abgeliefert.
    if (type !== 'town_center' && !this.hasTownCenter()) {
      return 'Baue zuerst ein Hauptgebäude';
    }

    // Felder: ein Tile, auf dem gesät werden kann.
    if (type === 'farm') {
      // Der Mittelpunkt ist der Schlüssel des Felds - zwei dürfen ihn nicht teilen.
      if (this.buildings.has(key(x, y))) return 'Hier steht schon etwas';
      if (this.farmTiles(x, y) === 0) return 'Hier kann nichts gesät werden - Felder brauchen freie Wiese oder Waldboden';
      return this.affordable(type) ? null : 'Zu wenig Rohstoffe';
    }

    for (const [tx, ty] of this.footprintTiles(x, y, type)) {
      if (this.occupied.has(key(tx, ty))) return 'Hier steht schon etwas';
      const tile = this.terrain.getTile(tx, ty);
      if (!def.terrain.includes(tile.tileType)) return `${def.label} braucht festen Boden`;
    }

    // Felder (oben) folgen dem Gelände - nur Gebäude brauchen ebenen Boden.
    if (this.slopeUnder(x, y, type) > MAX_BUILD_SLOPE * def.footprint) {
      return 'Der Boden ist hier zu steil';
    }

    if (!this.affordable(type)) return 'Zu wenig Rohstoffe';
    return null;
  }

  /**
   * Kann auf Tile (x, y) ein Feld liegen? Wiese oder Waldboden, frei, und
   * nichts darauf, was erst weg müsste - für die Anzeige beim Bauen.
   */
  sowable(x: number, y: number): boolean {
    const k = key(x, y);
    if (this.occupied.has(k)) return false;
    let soil = this.sowableTiles.get(k);
    if (soil === undefined) {
      const tile = this.terrain.getTile(x, y);
      soil = !BUILDINGS.farm.terrain.includes(tile.tileType) ? 0 : tile.resource === 'none' ? 1 : tile.resource === 'berries' ? 0 : 2;
      if (this.sowableTiles.size > 50_000) this.sowableTiles.clear();
      this.sowableTiles.set(k, soil);
    }
    // 2: Baum oder Fels - frei, sobald abgebaut.
    return soil === 1 || (soil === 2 && this.exhausted.has(k));
  }

  /**
   * Höhenunterschied in Tiles zwischen höchster und tiefster Ecke der Felder,
   * die ein Gebäude belegen würde - gemessen am Relief, das man sieht.
   */
  private slopeUnder(x: number, y: number, type: BuildingType): number {
    const r = (BUILDINGS[type].footprint - 1) / 2;
    let lo = Infinity;
    let hi = -Infinity;
    for (let cy = y - r; cy <= y + r + 1; cy++) {
      for (let cx = x - r; cx <= x + r + 1; cx++) {
        const z = reliefZ(this.terrain.getTile(cx, cy).height);
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
    }
    return hi - lo;
  }

  // --- Verändern -----------------------------------------------------------

  place(x: number, y: number, type: BuildingType): string | null {
    const reason = this.canPlace(x, y, type);
    if (reason) return reason;

    this.pay(BUILDINGS[type].cost);
    // Ein Feld bekommt die Frucht fürs nächste Feld und die Tiles, die hier frei sind.
    const building = createBuilding(type, x, y, type === 'farm' ? { crop: this.nextFarmCrop, tiles: this.farmTiles(x, y) } : {});
    this.buildings.set(building.anchor, building);
    for (const [tx, ty] of building.footprintTiles()) this.occupied.set(key(tx, ty), building.anchor);
    this.farming.invalidate();
    this.fieldLooks.clear();
    this.dirty = true;
    return null;
  }

  /** Abriss. Die Hälfte der Kosten kommt zurück - sonst bestraft ein Fehlklick zu hart. */
  remove(building: Building) {
    const def = building.definition;
    this.pay(def.cost, -0.5);
    // Wer noch in Ausbildung war, wird voll erstattet - er hat ja nie gearbeitet.
    if (building.isUnitProducer()) this.pay(VILLAGER.cost, -building.queuedUnits);
    for (const [tx, ty] of building.footprintTiles()) this.occupied.delete(key(tx, ty));
    const anchor = building.anchor;
    this.buildings.delete(anchor);
    this.farming.invalidate();
    this.fieldLooks.clear();
    this.addRuin(building);
    // Wer gerade genau hierhin liefern wollte, sucht sich beim nächsten Tick
    // ein anderes Lager oder bleibt mit seiner Ladung stehen.
    for (const v of this.villagers) {
      if ((v.task.kind === 'deliver' || v.task.kind === 'farm') && v.task.building === anchor) v.task = { kind: 'idle' };
    }
    this.dirty = true;
  }

  /** Legt den Einsturz an: Schutt fliegt in alle Richtungen, landet auf dem Gelände. */
  private addRuin(building: Building) {
    const def = building.definition;
    const cx = building.x + 0.5;
    const cy = building.y + 0.5;
    const debris: Ruin['debris'] = [];
    const count = 7 + Math.round(def.size * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const reach = def.size * (0.45 + Math.random() * 0.7);
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach;
      debris.push({
        dx,
        dy,
        vz: def.size * (1.2 + Math.random() * 1.6),
        size: def.size * (0.12 + Math.random() * 0.14),
        heading: Math.random() * Math.PI * 2,
        ground: reliefZ(this.terrain.getTile(Math.floor(cx + dx), Math.floor(cy + dy)).height),
      });
    }
    this.ruins.push({
      type: building.type, shape: building.model, x: building.x, y: building.y, at: this.time,
      clock: performance.now() / 1000, debris,
    });
    this.onEvent?.({ kind: 'collapse', x: cx, y: cy });
  }

  /**
   * Sammelpunkt setzen: wer hier fertig ausgebildet wird, bekommt denselben
   * Befehl, als hätte man ihn mit Rechtsklick auf dieses Feld geschickt -
   * auf ein Vorkommen sammelt er, sonst geht er hin. Ein Klick auf das
   * Gebäude selbst hebt den Sammelpunkt auf.
   */
  setRally(building: Building, x: number, y: number): string | null {
    if (!building.isUnitProducer()) return 'Nur ausbildende Gebäude haben einen Sammelpunkt';
    if (this.at(x, y) === building) {
      building.setRallyPoint(null);
      this.dirty = true;
      return null;
    }
    const tile = this.terrain.getTile(x, y);
    if (tile.tileType === 'water' || tile.tileType === 'deep_water') return 'Dorfbewohner können nicht schwimmen';
    building.setRallyPoint({ x, y });
    this.dirty = true;
    return null;
  }

  /** Stellt einen Dorfbewohner in die Warteschlange. Kosten werden sofort fällig. */
  train(building: Building): string | null {
    if (!building.isUnitProducer()) return 'Nur das Hauptgebäude bildet Dorfbewohner aus';
    if (building.isQueueFull) return 'Die Warteschlange ist voll';
    if (!this.canAffordVillager()) return 'Zu wenig Nahrung';
    this.pay(building.unit.cost);
    building.enqueueUnit();
    this.dirty = true;
    return null;
  }

  /**
   * Befehl an ausgewählte Dorfbewohner für das Feld (x, y), wie ein Rechtsklick
   * in AoE2: Lager -> abliefern, Vorkommen -> sammeln, sonst hingehen.
   */
  command(ids: ReadonlySet<number>, x: number, y: number): string | null {
    const selected = this.villagers.filter((v) => ids.has(v.id));
    if (selected.length === 0) return null;
    // Wer gerade im Gebäude ablädt, kommt für den neuen Befehl sofort heraus.
    for (const v of selected) v.inside = 0;

    const target = this.at(x, y);
    if (target?.isFarm()) {
      // Je Furche ein Bauer - sind alle besetzt, geht es aufs nächste Feld
      // mit einer freien Furche.
      for (const v of selected) v.task = { kind: 'idle' };
      const busy = new Set(this.villagers.flatMap((v) => (v.task.kind === 'farm' ? [`${v.task.building}#${v.task.row}`] : [])));
      for (const v of selected) {
        const spot = this.farming.freeFurrow(target, busy);
        if (!spot) {
          v.problem = 'Auf allen Feldern in der Nähe arbeitet schon jemand in jeder Furche';
          continue;
        }
        busy.add(`${spot.building}#${spot.row}`);
        v.task = { kind: 'farm', building: spot.building, row: spot.row, delivering: false };
        v.problem = null;
      }
      return null;
    }
    if (target) {
      const def = target.definition;
      if (def.storedResources.length === 0) return `${def.label} ist kein Lager`;
      const anchor = key(target.x, target.y);
      for (const v of selected) {
        v.task = { kind: 'deliver', building: anchor };
        v.problem = null;
      }
      return null;
    }

    const found = this.remainingAt(x, y);
    if (found.type && found.amount > 0) {
      // Die Ausgewählten zählen nicht mit - sie werden gerade neu verteilt.
      for (const v of selected) v.task = { kind: 'idle' };
      const occupancy = this.occupancy();
      const full = (k: string) => (occupancy.get(k) ?? 0) >= MAX_GATHERERS;
      for (const v of selected) {
        // Ist das Ziel voll, das nächste Vorkommen derselben Art mit Platz.
        const spot = !full(key(x, y)) ? { x, y } : this.nextDeposit(found.type, x, y, occupancy);
        if (!spot) {
          v.problem = 'Alle Vorkommen in der Nähe sind voll besetzt';
          continue;
        }
        v.task = { kind: 'gather', type: found.type, x: spot.x, y: spot.y, delivering: false };
        v.problem = null;
        const k = key(spot.x, spot.y);
        occupancy.set(k, (occupancy.get(k) ?? 0) + 1);
      }
      return null;
    }

    const tile = this.terrain.getTile(x, y);
    if (tile.tileType === 'water' || tile.tileType === 'deep_water') return 'Dorfbewohner können nicht schwimmen';

    // Mehrere Dorfbewohner stellen sich im Kreis um das Ziel, statt alle auf
    // denselben Punkt zu laufen.
    selected.forEach((v, i) => {
      const angle = (i / selected.length) * Math.PI * 2;
      const r = selected.length > 1 ? 0.35 + 0.1 * Math.sqrt(selected.length) : 0;
      v.task = { kind: 'move', x: x + 0.5 + Math.cos(angle) * r, y: y + 0.5 + Math.sin(angle) * r };
      v.problem = null;
    });
    return null;
  }

  // --- Simulation ----------------------------------------------------------

  /**
   * Ein fester Zeitschritt aus main.ts, damit die Ausbeute nicht von der
   * Bildrate abhängt.
   */
  tick(dt: number) {
    this.time += dt;
    this.lastDt = dt;
    if (this.ruins.length > 0) this.ruins = this.ruins.filter((r) => this.time - r.at < RUIN_DURATION);
    for (const b of this.buildings.values()) if (b.isUnitProducer()) this.tickTraining(b, dt);
    this.regrowBerries(dt);
    if (this.farming.grow(dt)) this.dirty = true;
    if (this.wildlife.tick(dt, this.animalSurroundings)) this.dirty = true;
    // Leer zerlegte Kadaver verschwinden.
    for (const v of this.villagers) {
      v.prevX = v.x;
      v.prevY = v.y;
      v.prevStride = v.stride;
      v.prevWorkTime = v.workTime;
      v.pose = POSE.stand;
      this.tickVillager(v, dt);
    }
  }

  private tickTraining(building: UnitProducer, dt: number) {
    if (building.queuedUnits === 0) return;
    const pop = this.population();
    // Bevölkerungsgrenze erreicht: die Ausbildung wartet, bis ein Haus steht.
    if (pop.used >= pop.cap) return;
    if (!building.train(dt)) return;

    // Er tritt an der Vorderkante des Gebäudes heraus - zur Kamera hin.
    const r = building.definition.footprint / 2 + 0.4;
    const spread = (this.nextId % 5) * 0.4 - 0.8;
    const x = building.x + 0.5 + r + spread * 0.5;
    const y = building.y + 0.5 + r - spread * 0.5;
    // Etwa jeder zweite ist eine Frau.
    const female = Math.random() < 0.5;
    const villager = newVillager(this.nextId++, x, y, this.freeName(female), female);
    this.villagers.push(villager);
    this.onEvent?.({ kind: 'trained', x: villager.x, y: villager.y });
    if (building.rallyPoint) this.command(new Set([villager.id]), building.rallyPoint.x, building.rallyPoint.y);
    this.dirty = true;
  }

  /** Schritt Richtung Ziel. true, sobald er bis auf `reach` heran ist. */
  /** Kann man Tile (x, y) nicht betreten? Wasser, Gebäude, stehende Bäume, Felsen. */
  private blockedAt(x: number, y: number): boolean {
    const k = key(x, y);
    const anchor = this.occupied.get(k);
    // Über Felder geht man hinweg - Bauern arbeiten ja darauf.
    if (anchor !== undefined) return !this.buildings.get(anchor)?.isFarm();
    let t = this.terrainBlock.get(k);
    if (t === undefined) {
      const found = this.terrain.resourceAt(x, y);
      t = found.tileType === 'water' || found.tileType === 'deep_water' ? 1
        : found.type === 'wood' || found.type === 'stone' || found.type === 'gold' ? 2 : 0;
      if (this.terrainBlock.size > 200_000) this.terrainBlock.clear();
      this.terrainBlock.set(k, t);
    }
    if (t === 2) return !this.exhausted.has(k) && !this.felled.has(k);
    return t === 1;
  }

  /**
   * Nächster Punkt, den er ansteuert: der erste offene Wegpunkt zum Ziel -
   * gesucht, wenn das Ziel neu ist oder der Weg inzwischen versperrt ist.
   * Gibt es keinen Weg, geht er geradeaus (wie früher), statt stehen zu bleiben.
   */
  private waypoint(v: Villager, tx: number, ty: number, reach: number): { x: number; y: number } {
    const blocked = (x: number, y: number) => this.blockedAt(x, y);
    // Neu suchen: neues Ziel, oder die Strecke zum nächsten Wegpunkt ist
    // inzwischen versperrt (z. B. ein neues Gebäude).
    const stale = !v.pathTarget || Math.hypot(v.pathTarget.x - tx, v.pathTarget.y - ty) > 0.3
      || (v.path?.[0] && !lineOfSight(v.x, v.y, v.path[0].x, v.path[0].y,
          (x, y) => blocked(x, y) && !(x === Math.floor(v.x) && y === Math.floor(v.y))));
    if (stale) {
      v.pathTarget = { x: tx, y: ty };
      v.path = lineOfSight(v.x, v.y, tx, ty, (x, y) => blocked(x, y) && !(x === Math.floor(tx) && y === Math.floor(ty)))
        ? []
        : findPath(v.x, v.y, tx, ty, reach, blocked) ?? [];
    }
    while (v.path && v.path.length > 0 && Math.hypot(v.path[0].x - v.x, v.path[0].y - v.y) < 0.12) v.path.shift();
    return v.path && v.path.length > 0 ? v.path[0] : { x: tx, y: ty };
  }

  private walk(v: Villager, tx: number, ty: number, reach: number, dt: number): boolean {
    const d = Math.hypot(tx - v.x, ty - v.y);
    // Mit etwas Spielraum - sonst bliebe nach dem letzten Schritt ein
    // Rundungsrest, und er käme nie an.
    if (d <= reach + 1e-4) {
      v.path = null;
      v.pathTarget = null;
      return true;
    }
    // Um Hindernisse herum: zum nächsten Wegpunkt, zuletzt aufs Ziel zu.
    const next = this.waypoint(v, tx, ty, reach);
    const final = next.x === tx && next.y === ty;
    const dx = next.x - v.x;
    const dy = next.y - v.y;
    const dn = Math.hypot(dx, dy) || 1e-6;
    const step = Math.min(VILLAGER.speed * dt, final ? d - reach : dn);
    v.x += (dx / dn) * step;
    v.y += (dy / dn) * step;
    v.heading = Math.atan2(dy, dx);
    v.stride += step;
    v.pose = POSE.walk;
    this.dirty = true;
    // Angekommen ist er erst im nächsten Tick: sonst ginge ein kurzer Weg im
    // selben Tick in die Arbeitspose über, und er rutschte statt zu gehen.
    return false;
  }

  /** Nächstes Lager, das `type` annimmt. */
  private nearestDropSite(v: Villager, type: ResourceKind): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    for (const b of this.buildings.values()) {
      if (!b.definition.storedResources.includes(type)) continue;
      const d = Math.hypot(b.x + 0.5 - v.x, b.y + 0.5 - v.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = b;
      }
    }
    return best;
  }

  /** Läuft zum Lager; true, sobald die Ladung abgegeben ist. */
  private deliverTo(v: Villager, building: Building, dt: number): boolean {
    // Im Gebäude: kurz warten, dann kommt er ohne Last wieder heraus.
    if (v.inside > 0) {
      v.inside -= dt;
      if (v.inside > 0) return false;
      v.inside = 0;
      return true;
    }
    // Zur Tür (im Modell markiert), sonst bis an die Kante des Modells bzw.
    // der belegten Felder - was größer ist.
    const def = building.definition;
    const entry = modelEntry(building.model,
        building.x, building.y, def.size, BUILDING_HEADING);
    const reach = entry ? 0.08 : Math.max(def.footprint, def.size) / 2 + DELIVER_REACH;
    const [tx, ty] = entry ? [entry.x, entry.y] : [building.x + 0.5, building.y + 0.5];
    if (!this.walk(v, tx, ty, reach, dt)) return false;
    if (v.carryType && v.carrying > 0) {
      this.stock[v.carryType] += v.carrying;
      this.onEvent?.({ kind: 'deliver', x: v.x, y: v.y });
    }
    v.carrying = 0;
    v.carryType = null;
    this.dirty = true;
    // Durch die Tür hinein - einen Moment lang ist er weg.
    if (entry) {
      v.inside = INSIDE_TIME;
      v.heading = Math.atan2(building.y + 0.5 - v.y, building.x + 0.5 - v.x);
      return false;
    }
    return true;
  }

  /** Nächstes nicht leeres Feld derselben Art um (x, y) - wenn eins leer ist, macht er dort weiter. */
  /** Wie viele Dorfbewohner je Feld sammeln - Schlüssel "x,y". */
  private occupancy(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const v of this.villagers) {
      if (v.task.kind !== 'gather') continue;
      const k = key(v.task.x, v.task.y);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }

  /**
   * Nächstes nicht leeres Feld derselben Art um (x, y), auf dem noch Platz
   * ist (höchstens MAX_GATHERERS).
   */
  private nextDeposit(
      type: DepositType, x: number, y: number,
      occupancy: Map<string, number> = this.occupancy(),
  ): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;
    const r = VILLAGER.searchRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bestDistance || d > r * r) continue;
        if ((occupancy.get(key(x + dx, y + dy)) ?? 0) >= MAX_GATHERERS) continue;
        const found = this.remainingAt(x + dx, y + dy);
        if (found.type === type && found.amount > 0) {
          best = { x: x + dx, y: y + dy };
          bestDistance = d;
        }
      }
    }
    return best;
  }

  /**
   * Die Feldstücke, die mit `building` ein zusammenhängendes Feld bilden
   * (über Tile-Kanten benachbart), es selbst eingeschlossen. Gemerkt, bis
   * sich an den Gebäuden etwas ändert.
   */
  /** Das zusammenhängende Feld, zu dem `building` gehört (farming.ts). */
  farmGroup(building: Building): Farm[] {
    return this.farming.group(building);
  }

  /** Was auf dem Feld, zu dem `building` gehört, gerade dran ist. */
  farmPhase(building: Building): FarmPhase {
    return this.farming.phase(building);
  }

  /**
   * Die nächste Furche auf dem Feld, in der es in dieser Phase Arbeit gibt
   * und kein anderer Bauer arbeitet - die dem Bauern nächste.
   */
  private nextFurrow(v: Villager, group: Farm[], phase: FarmPhase): { building: Farm; row: number; distance: number } | undefined {
    const busy = new Set(this.villagers.flatMap((u) => (u !== v && u.task.kind === 'farm' ? [`${u.task.building}#${u.task.row}`] : [])));
    let best: { building: Farm; row: number; distance: number } | undefined;
    for (const { building, row, f } of this.farming.furrows(group)) {
      if (!furrowNeeds(f, phase) || busy.has(furrowKey(building, row))) continue;
      const spot = this.farmSpot(building, row, v);
      const distance = Math.hypot(spot.x - v.x, spot.y - v.y);
      if (!best || distance < best.distance) best = { building, row, distance };
    }
    return best;
  }

  /** Wer auf diesem Feld arbeitet, nach Furche. */
  farmers(building: Building): Villager[] {
    const anchor = building.anchor;
    return this.villagers.filter((v) => v.task.kind === 'farm' && v.task.building === anchor);
  }

  /**
   * Frucht wählen: gilt für jede Aussaat von jetzt an - Furchen, die noch
   * nicht eingesät sind, bekommen sie gleich. Neue Felder bekommen sie auch.
   */
  setCrop(building: Building, crop: CropType) {
    if (!building.isFarm()) return;
    building.setPlan(crop);
    this.nextFarmCrop = crop;
    this.dirty = true;
  }

  /** Wo der Bauer in seiner Furche steht (farming.ts) - beim Jäten je Bauer versetzt. */
  private farmSpot(building: Farm, row: number, v: Villager, wander = false) {
    return farmSpot(building, row, Math.abs(((this.time / 40 + v.id * 0.37) % 2) - 1), wander);
  }

  /**
   * Arbeitstakt am Platz: Zeit weiterzählen und bei jedem Schlag bzw. Griff
   * ein Ereignis melden - im Takt der Animation (siehe Shader).
   */
  private swing(v: Villager, dt: number, resource: DepositType, picking: boolean) {
    // Der Arm schlägt zu, wenn sin(Phase) sein Minimum durchläuft - genau
    // dann soll man den Hieb hören. Pflücken ist im Shader langsamer
    // (Phase * 0.6), das Rascheln folgt dem Griff.
    const tempo = picking ? WORK_TEMPO * 0.6 : WORK_TEMPO;
    const strikes = (time: number) => Math.floor((time * tempo - Math.PI * 1.5) / (Math.PI * 2));
    const before = strikes(v.workTime);
    v.workTime += dt;
    if (strikes(v.workTime) > before) {
      this.onEvent?.({ kind: 'strike', resource, x: v.x, y: v.y });
    }
  }

  /**
   * Bauer: arbeitet mit den anderen auf seinem Feld Phase für Phase - erst
   * alles pflügen, dann alles säen, jäten, bis alles reif ist, dann ernten
   * und abliefern; abgeerntet wird alles neu gesät. Er nimmt sich jeweils die
   * nächste freie Furche, in der es noch etwas zu tun gibt.
   */
  private tickFarmer(v: Villager, task: Extract<Task, { kind: 'farm' }>, dt: number) {
    const found = this.buildings.get(task.building);
    if (!found?.isFarm() || !found.furrows[task.row]) {
      v.task = { kind: 'idle' };
      return;
    }
    let building: Farm = found;
    if (task.delivering) {
      const site = this.nearestDropSite(v, 'food');
      if (!site) {
        v.problem = 'Kein Lager für Nahrung - baue eine Mühle';
        return;
      }
      v.problem = null;
      if (this.deliverTo(v, site, dt)) task.delivering = false;
      return;
    }

    const group = this.farmGroup(building);
    let phase = this.farmPhase(building);
    // Die Ernte ist vorbei: wer noch etwas trägt, bringt es erst zum Lager.
    if (phase !== 'harvest' && v.carrying > 0 && v.carryType === 'food') {
      task.delivering = true;
      return;
    }
    if (phase === 'done') {
      // Alles abgeerntet: alles wird neu gesät.
      for (const { building: b, row, f } of this.farming.furrows(group)) {
        Object.assign(f, { crop: b.plan, sown: 0, growth: 0, food: furrowFood(b.plan, b.tiles, row), paid: false });
      }
      this.dirty = true;
      phase = 'sow';
    }
    // In der eigenen Furche nichts mehr zu tun: die nächste mit Arbeit. Beim
    // Ernten geht er immer zum nächsten reifen Getreide, auch in einer fremden
    // Furche - seine eigene behält er nur, solange sie kaum weiter weg ist.
    const ownNeeds = furrowNeeds(building.furrows[task.row], phase);
    if (!ownNeeds || phase === 'harvest') {
      const next = this.nextFurrow(v, group, phase);
      const own = this.farmSpot(building, task.row, v);
      const keep = ownNeeds && (!next || Math.hypot(own.x - v.x, own.y - v.y) <= next.distance + 0.3);
      if (keep) {
        // Er bleibt, wo er ist.
      } else if (next) {
        building = next.building;
        task.building = next.building.anchor;
        task.row = next.row;
      } else if (phase === 'harvest' && v.carrying > 0) {
        // Die Ernte ist verteilt - mit dem, was er hat, zum Lager.
        task.delivering = true;
        return;
      }
    }
    const f = building.furrows[task.row];
    const working = furrowNeeds(f, phase);
    if (working && phase === 'sow' && !f.paid) {
      if (!this.canPay(RESEED_COST)) {
        v.problem = 'Zu wenig Holz, um neu zu säen';
        return;
      }
      this.pay(RESEED_COST);
      f.paid = true;
    }
    v.problem = null;
    const crop = CROPS[f.crop];
    // Ohne eigene Arbeit (es wächst, oder die übrigen Furchen haben andere)
    // geht er seine Furche ab und jätet.
    const spot = this.farmSpot(building, task.row, v, !working);
    if (!this.walk(v, spot.x, spot.y, 0.05, dt)) return;
    v.heading = Math.atan2(spot.aimY - v.y, spot.aimX - v.x);
    this.dirty = true;

    // Eine kürzere Furche (über weniger Tiles) ist schneller gepflügt und gesät.
    const length = building.furrowCells(task.row).length / 3;
    if (working && phase === 'plough') {
      // Pflügen: mit der Hacke, stehend.
      v.pose = POSE.work;
      this.swing(v, dt, 'wood', false);
      f.plough = Math.min(1, f.plough + dt / (PLOUGH_TIME * length));
      return;
    }
    if (!working || phase === 'sow') {
      // Säen und jäten: kniend.
      v.pose = POSE.pick;
      this.swing(v, dt, 'berries', true);
      if (working) f.sown = Math.min(1, f.sown + dt / (SOW_TIME * length));
      return;
    }
    // Ernten: Weizen mit der Sense, andere Früchte von Hand.
    v.pose = crop.scythe ? POSE.scythe : POSE.pick;
    this.swing(v, dt, 'berries', true);
    if (v.carryType !== 'food') {
      v.carrying = 0;
      v.carryType = 'food';
    }
    const take = Math.min(FARM_RATE * crop.rate * dt, f.food, VILLAGER.capacity - v.carrying);
    f.food -= take;
    v.carrying += take;
    if (v.carrying >= VILLAGER.capacity - 1e-6) task.delivering = true;
  }

  // --- Wild ------------------------------------------------------------------

  /** Darf ein Tier dieses Tile betreten? Nicht ins Wasser, nicht in Gebäude - zwischen Bäumen hindurch schon. */
  private animalBlocked(x: number, y: number): boolean {
    const k = key(x, y);
    const anchor = this.occupied.get(k);
    if (anchor !== undefined && !this.buildings.get(anchor)?.isFarm()) return true;
    const tile = this.terrain.getTile(x, y);
    return tile.tileType === 'water' || tile.tileType === 'deep_water' || tile.tileType === 'mountain' || tile.tileType === 'snow';
  }

  /** Tiere in den Stücken nahe der Kamera entstehen lassen, die noch keine hatten (wildlife.ts). */
  ensureAnimals(centerX: number, centerY: number) {
    if (this.wildlife.spawnAround(centerX, centerY)) this.dirty = true;
  }

  /** Das Tier, das einem Welt-Punkt am nächsten liegt - höchstens `radius` Tiles entfernt. */
  animalNear(x: number, y: number, radius: number): Animal | undefined {
    return this.wildlife.near(x, y, radius);
  }

  /** Rechtsklick auf ein Tier: die Ausgewählten jagen es bzw. zerlegen den Kadaver. */
  hunt(ids: ReadonlySet<number>, animal: Animal) {
    for (const v of this.villagers) {
      if (!ids.has(v.id)) continue;
      v.inside = 0;
      v.task = { kind: 'hunt', animal: animal.id, delivering: false, cooldown: 0 };
      v.problem = null;
    }
  }

  /** Was Tiere von der Welt wissen: wohin sie dürfen, wo der nächste Dorfbewohner ist. */
  private readonly animalSurroundings: AnimalSurroundings = {
    isBlocked: (x, y) => this.animalBlocked(x, y),
    nearestThreat: (x, y) => {
      let nearest: { x: number; y: number; distance: number } | undefined;
      for (const v of this.villagers) {
        if (v.inside > 0) continue;
        const distance = Math.hypot(v.x - x, v.y - y);
        if (!nearest || distance < nearest.distance) nearest = { x: v.x, y: v.y, distance };
      }
      return nearest;
    },
  };

  /** Nächstes Tier bzw. Kadaver mit Fleisch in Reichweite der Suche - lieber erlegte. */
  private nearestPrey(v: Villager, kind: AnimalKind | null): Animal | undefined {
    let best: Animal | undefined;
    let bestScore: number = VILLAGER.searchRadius;
    for (const a of this.wildlife.animals) {
      if (a.state === 'dead' && a.food <= 1e-6) continue;
      if (kind && a.kind !== kind) continue;
      const score = Math.hypot(a.x - v.x, a.y - v.y) - (a.state === 'dead' ? 4 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /**
   * Jäger: hinterher, bis er in Wurfweite ist, dann Speer um Speer, bis das
   * Tier fällt; am Kadaver zerlegt er das Fleisch und bringt es zum Lager.
   * Ist es leer, macht er beim nächsten Tier derselben Art weiter.
   */
  private tickHunter(v: Villager, task: Extract<Task, { kind: 'hunt' }>, dt: number) {
    if (task.delivering) {
      const site = this.nearestDropSite(v, 'food');
      if (!site) {
        v.problem = 'Kein Lager für Nahrung - baue eine Mühle';
        return;
      }
      v.problem = null;
      if (this.deliverTo(v, site, dt)) task.delivering = false;
      return;
    }
    let a = this.wildlife.byId(task.animal);
    if (!a || (a.state === 'dead' && a.food <= 1e-6)) {
      const next = this.nearestPrey(v, a?.kind ?? null);
      if (next) {
        task.animal = next.id;
        a = next;
      } else if (v.carrying > 0 && v.carryType === 'food') {
        task.delivering = true;
        return;
      } else {
        v.task = { kind: 'idle' };
        v.problem = 'Hier gibt es nichts mehr zu jagen';
        return;
      }
    }
    v.problem = null;
    if (a.state !== 'dead') {
      // In Wurfweite heran - und dann werfen, auch wenn es wegläuft.
      const d = Math.hypot(a.x - v.x, a.y - v.y);
      task.cooldown = Math.max(0, task.cooldown - dt);
      if (d > HUNT.range) {
        this.walk(v, a.x, a.y, HUNT.range * 0.8, dt);
        return;
      }
      v.heading = Math.atan2(a.y - v.y, a.x - v.x);
      v.pose = POSE.work;
      v.workTime += dt;
      if (task.cooldown > 0) return;
      task.cooldown = HUNT.reload;
      a.hp -= 1;
      this.onEvent?.({ kind: 'strike', resource: 'wood', x: v.x, y: v.y });
      if (a.hp <= 0) {
        a.state = 'dead';
        a.target = null;
      }
      this.dirty = true;
      return;
    }
    // Am Kadaver: kniend zerlegen.
    if (!this.walk(v, a.x, a.y, 0.35, dt)) return;
    v.heading = Math.atan2(a.y - v.y, a.x - v.x);
    v.pose = POSE.pick;
    this.swing(v, dt, 'berries', true);
    if (v.carryType !== 'food') {
      v.carrying = 0;
      v.carryType = 'food';
    }
    const take = Math.min(HUNT.butcherRate * dt, a.food, VILLAGER.capacity - v.carrying);
    a.food -= take;
    v.carrying += take;
    this.dirty = true;
    if (v.carrying >= VILLAGER.capacity - 1e-6 || a.food <= 1e-6) task.delivering = true;
  }

  private tickVillager(v: Villager, dt: number) {
    const task = v.task;
    switch (task.kind) {
      case 'idle':
        return;

      case 'move':
        if (this.walk(v, task.x, task.y, 0.05, dt)) v.task = { kind: 'idle' };
        return;

      case 'farm':
        this.tickFarmer(v, task, dt);
        return;

      case 'hunt':
        this.tickHunter(v, task, dt);
        return;

      case 'deliver': {
        const building = this.buildings.get(task.building);
        if (!building) {
          v.task = { kind: 'idle' };
          return;
        }
        if (this.deliverTo(v, building, dt)) v.task = { kind: 'idle' };
        return;
      }

      case 'gather': {
        if (task.delivering) {
          const site = this.nearestDropSite(v, YIELD[task.type]);
          if (!site) {
            v.problem = 'Kein Lager für diese Ressource';
            return;
          }
          v.problem = null;
          if (this.deliverTo(v, site, dt)) task.delivering = false;
          return;
        }

        const found = this.remainingAt(task.x, task.y);
        if (found.type !== task.type || found.amount <= 0) {
          // Feld leer: im Umkreis weitermachen, sonst Rest abliefern und aufhören.
          // Er selbst zählt am leeren Feld nicht mehr mit.
          const occupancy = this.occupancy();
          const own = key(task.x, task.y);
          occupancy.set(own, (occupancy.get(own) ?? 1) - 1);
          const next = this.nextDeposit(task.type, task.x, task.y, occupancy);
          if (next) {
            task.x = next.x;
            task.y = next.y;
          } else if (v.carrying > 0) {
            const site = this.nearestDropSite(v, YIELD[task.type]);
            v.task = site ? { kind: 'deliver', building: key(site.x, site.y) } : { kind: 'idle' };
            v.problem = site ? null : 'Kein Lager für diese Ressource';
          } else {
            v.task = { kind: 'idle' };
            v.problem = 'Hier gibt es nichts mehr';
          }
          return;
        }

        // Jeder hat seinen eigenen Platz am Feld - sonst stehen alle
        // Sammler auf demselben Punkt und sehen aus wie einer. Der goldene
        // Winkel verteilt mehrere Sammler gleichmäßig; der Anteil je Feld
        // sorgt dafür, dass derselbe Dorfbewohner nicht an jedem Baum von
        // derselben Seite kommt - sonst fielen alle seine Bäume gleich.
        const angle = v.id * 2.39996 + tileAngle(task.x, task.y);
        let spotX = task.x + 0.5 + Math.cos(angle) * GATHER_SPREAD;
        let spotY = task.y + 0.5 + Math.sin(angle) * GATHER_SPREAD;
        // Wohin er schlägt: die Mitte des Felds - oder beim gefällten Baum der
        // liegende Stamm, dort, wo gerade abgesägt wird (die Spitze, die mit
        // dem Holz näher zum Stumpf wandert). Er steht seitlich daneben.
        let aimX = task.x + 0.5;
        let aimY = task.y + 0.5;
        const felled = task.type === 'wood' ? this.felled.get(key(task.x, task.y)) : undefined;
        const length = felled ? this.treeLength?.(task.x, task.y) : undefined;
        if (felled && length) {
          const total = this.terrain.getTile(task.x, task.y).resourceAmount;
          const share = Math.max(0, Math.min(1, found.amount / total));
          // In Sprüngen von STEP Tiles: so geht er ab und zu ein paar Schritte
          // weiter, statt dem kürzer werdenden Stamm hinterherzurutschen.
          const STEP = 0.8;
          const along = Math.max(0.35, Math.floor((length * share * 0.8) / STEP) * STEP);
          const [dx, dy] = [Math.cos(felled.dir), Math.sin(felled.dir)];
          aimX += dx * along;
          aimY += dy * along;
          // Links oder rechts vom Stamm, mehrere Holzfäller verteilt.
          const side = (v.id % 2 ? 1 : -1) * (0.3 + (v.id % 3) * 0.08);
          spotX = aimX - dy * side - dx * (v.id % 3) * 0.15;
          spotY = aimY + dx * side - dy * (v.id % 3) * 0.15;
        }
        if (!this.walk(v, spotX, spotY, 0.05, dt)) return;
        // Am Platz: zum Vorkommen drehen und arbeiten - Beeren kniend pflücken.
        v.heading = Math.atan2(aimY - v.y, aimX - v.x);
        v.pose = task.type === 'berries' ? POSE.pick : POSE.work;
        this.swing(v, dt, task.type, task.type === 'berries');

        // Wechselt er die Ressource, lässt er die alte Ladung fallen - wie in AoE2.
        if (v.carryType !== YIELD[task.type]) {
          v.carrying = 0;
          v.carryType = YIELD[task.type];
        }
        const take = Math.min(
            VILLAGER.gatherRate[task.type] * dt,
            found.amount,
            VILLAGER.capacity - v.carrying);
        const k = key(task.x, task.y);
        // Der erste Hieb fällt den Baum - weg vom Holzfäller.
        if (task.type === 'wood' && !this.felled.has(k)) {
          // Grob weg vom Holzfäller, aber nie ganz genau - bis zu 35° daneben.
          const away = Math.atan2(task.y + 0.5 - v.y, task.x + 0.5 - v.x);
          const jitter = (tileAngle(task.x + 17, task.y - 31) / Math.PI - 1) * 0.6;
          this.felled.set(k, { at: this.time, dir: away + jitter });
          this.onEvent?.({ kind: 'treeFall', x: task.x + 0.5, y: task.y + 0.5 });
        }
        const taken = (this.harvested.get(k) ?? 0) + take;
        this.harvested.set(k, taken);
        if (task.type === 'berries') {
          const total = this.berryTiles.get(k)?.total ?? found.amount + taken - take;
          this.berryTiles.set(k, { total, picked: this.time });
        }
        if (found.amount - take <= 1e-6) this.exhausted.add(k);
        v.carrying += take;
        this.dirty = true;

        if (v.carrying >= VILLAGER.capacity - 1e-6) task.delivering = true;
        return;
      }
    }
  }

  /** Kurzbeschreibung für die Anzeige. */
  describe(v: Villager): string {
    if (v.problem) return v.problem;
    const load = v.carrying > 0 && v.carryType ? ` (${Math.floor(v.carrying)})` : '';
    switch (v.task.kind) {
      case 'idle': return 'untätig' + load;
      case 'move': return 'unterwegs' + load;
      case 'deliver': return 'liefert ab' + load;
      case 'gather':
        return (v.task.delivering ? 'bringt ' : 'sammelt ') + RESOURCE_TYPE_LABEL[v.task.type] + load;
      case 'hunt': {
        if (v.task.delivering) return 'bringt Fleisch' + load;
        const hunt = v.task;
        const a = this.wildlife.byId(hunt.animal);
        if (!a) return 'jagt' + load;
        return (a.isDead ? `zerlegt ${a.label}` : `jagt ${a.label}`) + load;
      }
      case 'farm': {
        const building = this.buildings.get(v.task.building);
        const f = building?.isFarm() ? building.furrows[v.task.row] : undefined;
        if (!building || !f) return 'untätig' + load;
        const crop = CROPS[f.crop].label;
        if (v.task.delivering) return `bringt ${crop}${load}`;
        switch (this.farmPhase(building)) {
          case 'plough': return 'pflügt' + load;
          case 'sow': return `sät ${crop}` + load;
          case 'grow': return `jätet (${crop} wächst)` + load;
          case 'harvest': return `erntet ${crop}` + load;
          case 'done': return 'sät neu' + load;
        }
      }
    }
  }

  /** Weltzeit (Sekunden) im laufenden Tick - `blend` 0..1 zwischen letztem und nächstem. */
  timeAt(blend: number): number {
    return this.time + blend * this.lastDt;
  }

  /** Überblendete Position zwischen zwei Ticks. */
  villagerPosition(v: Villager, blend: number): { x: number; y: number } {
    return { x: v.prevX + (v.x - v.prevX) * blend, y: v.prevY + (v.y - v.prevY) * blend };
  }

  // --- Speichern -----------------------------------------------------------

  /** Schreibt nur, wenn sich etwas geändert hat. */
  /** Speichert den Stand dieser Welt - nur, wenn sich seit dem letzten Mal etwas geändert hat. */
  save() {
    if (!this.dirty) return;
    // Ohne Speicher (privater Modus, voll) läuft das Spiel weiter, nur ohne Spielstand.
    if (writeSave(this.seed, this.toSave())) this.dirty = false;
  }

  /** Der Stand als Speicherstand (siehe save.ts). */
  private toSave(): SaveData {
    return {
      version: 3,
      savedAt: Date.now(),
      stock: this.stock,
      buildings: [...this.buildings.values()].map((b) => b.toSave()),
      villagers: this.villagers.map((v) => ({
        x: v.x, y: v.y, c: v.carrying, ct: v.carryType, task: v.task, hp: v.hp, n: v.name, f: v.female,
      })),
      harvested: Object.fromEntries(this.harvested),
      animals: this.wildlife.animals.map((a) => ({
        k: a.kind, x: +a.x.toFixed(2), y: +a.y.toFixed(2), hp: a.hp, f: +a.food.toFixed(1),
        ...(a.state === 'dead' ? { d: true } : {}),
      })),
      spawned: [...this.wildlife.spawnedChunks],
    };
  }

  /** Übernimmt einen geladenen Stand - schon auf das heutige Format gebracht (save.ts). */
  private applySave({ data, scale }: LoadedSave) {
    this.stock = data.stock;
    // Welche Felder leer sind, steht nicht im Speicherstand - es ergibt sich
    // aus der entnommenen Menge und dem, was der Generator dort hergibt. So
    // bleibt die Datei klein und übersteht eine Änderung an den Vorkommen.
    for (const [k, amount] of Object.entries(data.harvested)) {
      this.harvested.set(k, amount);
      const comma = k.indexOf(',');
      const [x, y] = [Number(k.slice(0, comma)), Number(k.slice(comma + 1))];
      const tile = this.terrain.getTile(x, y);
      if (amount >= tile.resourceAmount) this.exhausted.add(k);
      // Wann zuletzt gepflückt wurde, steht nicht im Speicherstand - die
      // Pause beginnt beim Laden von vorn.
      if (tile.resource === 'berries') this.berryTiles.set(k, { total: tile.resourceAmount, picked: 0 });
      // Angefangene Bäume liegen schon - ohne noch einmal umzufallen. Die
      // Richtung steht nicht im Speicherstand; sie ergibt sich aus der Lage.
      if (tile.resource === 'wood') this.felled.set(k, { at: -Infinity, dir: ((x * 7 + y * 13) % 8) * (Math.PI / 4) });
    }

    for (const saved of data.buildings) {
      // Unbekannte Arten fallen weg; umbenannte schreibt buildingFromSave um.
      const building = buildingFromSave(saved, scale);
      if (!building) continue;
      this.buildings.set(building.anchor, building);
      for (const [tx, ty] of building.footprintTiles()) this.occupied.set(key(tx, ty), building.anchor);
    }

    for (const k of data.spawned ?? []) this.wildlife.spawnedChunks.add(k);
    for (const a of data.animals ?? []) {
      if (isAnimalKind(a.k)) this.wildlife.add(a.k, a.x, a.y, { hp: a.hp, food: a.f, dead: a.d });
    }

    for (const s of data.villagers) {
      // Ältere Speicherstände kennen weder Namen noch Geschlecht.
      const female = s.f ?? this.nextId % 2 === 1;
      const v = newVillager(this.nextId++, s.x * scale, s.y * scale, s.n ?? this.freeName(female), female);
      v.carrying = s.c;
      v.carryType = s.ct;
      v.task = s.task;
      v.hp = Math.min(s.hp ?? VILLAGER.hp, VILLAGER.hp);
      this.villagers.push(v);
    }
  }

  /** Ein Vorname, den gerade kein lebender Dorfbewohner trägt. */
  private freeName(female: boolean): string {
    return uniqueName(female, new Set(this.villagers.map((v) => v.name)));
  }

  /**
   * Beerensträucher wachsen nach: erst BERRY_REST Sekunden nach dem letzten
   * Pflücken, dann in BERRY_REGROW_TIME Sekunden von leer auf voll. Sobald
   * wieder etwas daran hängt, kann man sie erneut abernten.
   */
  private regrowBerries(dt: number) {
    for (const [k, { total, picked }] of this.berryTiles) {
      if (this.time - picked < BERRY_REST) continue;
      const taken = (this.harvested.get(k) ?? 0) - (total / BERRY_REGROW_TIME) * dt;
      if (taken <= 0) {
        this.harvested.delete(k);
        this.berryTiles.delete(k);
        this.exhausted.delete(k);
      } else {
        this.harvested.set(k, taken);
        if (taken < total - 1) this.exhausted.delete(k);
      }
      this.dirty = true;
    }
  }

  /** Alles zurücksetzen - für den Neustart-Knopf. */
  reset() {
    this.buildings.clear();
    this.farming.invalidate();
    this.fieldLooks.clear();
    this.occupied.clear();
    this.harvested.clear();
    this.exhausted.clear();
    this.berryTiles.clear();
    this.felled.clear();
    this.villagers = [];
    this.wildlife.clear();
    this.stock = initialResources();
    this.dirty = true;
    this.save();
  }
}



/** Fester Winkel 0..2π je Feld - gleiche Welt, gleiche Werte. */
function tileAngle(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * Math.PI * 2;
}
