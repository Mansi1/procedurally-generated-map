// world.ts
// Der veränderliche Teil der Welt. Das Gelände ist eine reine Funktion aus
// Seed und Koordinate - alles hier drin ist es nicht: Gebäude, Dorfbewohner,
// bereits abgebaute Vorkommen, Vorrat. Genau deshalb muss es gespeichert
// werden, während das Gelände jederzeit neu berechnet werden kann.

import { findPath, lineOfSight } from './pathfinding';
import { uniqueName } from './names';
import type { EntityInstance } from '../gl/entityRenderer';
import { BUILDING_HEADING, FALL_LYING, POSE, SHAPE, frozenMillMotion, millMotion, modelEntry } from '../gl/entityRenderer';
import { RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABEL, type TileProbe } from '../map';
import { reliefZ } from '../noise';
import {
  BUILDINGS,
  GATHER_TYPES,
  MAX_BUILD_SLOPE,
  MAX_GATHERERS,
  MAX_TRAINING_QUEUE,
  player,
  VILLAGER,
  initialStock,
} from './buildings';
import type { BuildingType, GatherType, Stock } from './buildings';

export interface Building {
  type: BuildingType;
  x: number;
  y: number;
  /** Dorfbewohner, die noch ausgebildet werden (nur Hauptgebäude). */
  queue: number;
  /** Sekunden, die der vorderste in der Warteschlange schon ausgebildet wird. */
  progress: number;
  /** Verbleibende Trefferpunkte - höchstens BUILDINGS[type].hp. */
  hp: number;
  /** Sammelpunkt (Tile) für frisch Ausgebildete, oder null. */
  rally: { x: number; y: number } | null;
}

/**
 * Was ein Dorfbewohner gerade tun soll. Der Zustand (hingehen, sammeln,
 * abliefern) ergibt sich daraus und aus dem, was er trägt.
 */
export type Task =
  | { kind: 'idle' }
  | { kind: 'move'; x: number; y: number }
  /** Sammelt am Feld (x, y), bringt volle Ladungen zum nächsten Lager. */
  | { kind: 'gather'; type: GatherType; x: number; y: number; delivering: boolean }
  /** Bringt die Ladung zu genau diesem Gebäude, danach untätig. */
  | { kind: 'deliver'; building: string };

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
  carryType: GatherType | null;
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
const STRIDE_LENGTH = Math.max(VILLAGER.size * 1.1, 0.6);
/** Arbeitsschläge je Sekunde, in Radiant. */
const WORK_TEMPO = 6;

/**
 * Was in der Welt passiert und man hören (oder sonst mitbekommen) soll. Die
 * Welt kennt keinen Ton - main.ts hängt sich an `onEvent` und entscheidet,
 * was davon zu hören ist.
 */
export type WorldEvent =
  /** Ein Arbeitsschlag - zeitgleich mit dem Arm in der Animation. */
  | { kind: 'strike'; resource: GatherType; x: number; y: number }
  | { kind: 'treeFall'; x: number; y: number }
  | { kind: 'deliver'; x: number; y: number }
  | { kind: 'collapse'; x: number; y: number }
  | { kind: 'trained'; x: number; y: number };

/**
 * Ein abgerissenes Gebäude, das noch einstürzt: nur fürs Bild, es belegt
 * keine Felder mehr und verschwindet nach RUIN_DURATION Sekunden.
 */
interface Ruin {
  type: BuildingType;
  x: number;
  y: number;
  at: number;
  /** Uhrzeit (performance.now, Sekunden) beim Abriss - dort bleiben die Mühlenflügel stehen. */
  clock: number;
  /** Schuttbrocken: Flugrichtung und -weite, Steiggeschwindigkeit, Bodenhöhe am Landepunkt. */
  debris: { dx: number; dy: number; vz: number; size: number; heading: number; ground: number }[];
}

/** Ablauf des Einsturzes in Sekunden. */
const RUIN_SHAKE = 0.3;
const RUIN_COLLAPSE_START = 0.25;
const RUIN_COLLAPSE = 1.0;
const RUIN_FLIGHT = 0.8;
const RUIN_FADE_START = 2.4;
const RUIN_DURATION = 3.0;
const DUST_COLOR: [number, number, number] = [214, 200, 172];

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Häuser, Mühlen und Holzlager gibt es in vier Varianten - welche, hängt fest am Bauplatz. */
const VARIANTS: Partial<Record<BuildingType, number[]>> = {
  house: [SHAPE.house, SHAPE.house2, SHAPE.house3, SHAPE.house4],
  lumberjack: [SHAPE.lumberCamp, SHAPE.lumberCamp2, SHAPE.lumberCamp3, SHAPE.lumberCamp4],
};

function buildingShape(type: BuildingType, x: number, y: number): number {
  const kinds = BUILDINGS[type].shape === SHAPE.mill
    ? [SHAPE.mill, SHAPE.mill2, SHAPE.mill3, SHAPE.mill4]
    : VARIANTS[type];
  if (!kinds) return BUILDINGS[type].shape;
  const h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  return kinds[((h >>> 0) % kinds.length)];
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

interface SaveData {
  version: 3;
  stock: Stock;
  buildings: { t: BuildingType; x: number; y: number; q?: number; hp?: number; r?: [number, number] }[];
  villagers: {
    x: number; y: number; c: number; ct: GatherType | null; task: Task; hp?: number;
    /** Name und Geschlecht - fehlen in älteren Speicherständen. */
    n?: string; f?: boolean;
  }[];
  /** "x,y" -> bereits entnommene Menge. */
  harvested: Record<string, number>;
}

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
  private ruins: Ruin[] = [];
  /** Weltzeit in Sekunden, läuft mit den Ticks. */
  private time = 0;
  private lastDt = 0;
  private dirty = false;
  private nextId = 1;

  stock: Stock = initialStock();
  villagers: Villager[] = [];
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

  constructor(private probe: TileProbe, private seed: string) {
    this.load();
  }

  private get storageKey() {
    return `pgm.world.${this.seed}`;
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
    return key(building.x, building.y);
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
  nearestTownCenter(x: number, y: number): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    for (const b of this.buildings.values()) {
      if (b.type !== 'town_center') continue;
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
      cap += BUILDINGS[b.type].provides;
      training += b.queue;
    }
    return { used: this.villagers.length, cap, training };
  }

  /**
   * Dorfbewohner je Ressource - alle mit dem Auftrag, sie zu sammeln, auch
   * wenn sie gerade eine Ladung zum Lager tragen.
   */
  gatherers(): { counts: Record<GatherType, number>; idle: number } {
    const counts = Object.fromEntries(GATHER_TYPES.map((t) => [t, 0])) as Record<GatherType, number>;
    let idle = 0;
    for (const v of this.villagers) {
      if (v.task.kind === 'gather') counts[v.task.type]++;
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
    const t = this.time + blend * this.lastDt - f.at;
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
      { type: GatherType; remaining: number; total: number; gatherers: number; regrowIn?: number } | null {
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
    const total = bushTotal ?? this.probe.getTile(x, y).resourceAmount;
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
  remainingAt(x: number, y: number): { type: GatherType | null; amount: number } {
    const k = key(x, y);
    if (this.exhausted.has(k)) return { type: null, amount: 0 };
    const tile = this.probe.getTile(x, y);
    if (tile.resource === 'none' || tile.resourceAmount <= 0) return { type: null, amount: 0 };
    return {
      type: tile.resource as GatherType,
      amount: tile.resourceAmount - (this.harvested.get(k) ?? 0),
    };
  }

  private canPay(cost: Partial<Stock>): boolean {
    return (Object.keys(cost) as (keyof Stock)[]).every(
        (r) => this.stock[r] >= (cost[r] ?? 0));
  }

  private pay(cost: Partial<Stock>, factor = 1) {
    for (const [r, amount] of Object.entries(cost) as [keyof Stock, number][]) {
      this.stock[r] -= Math.floor(amount * factor);
    }
  }

  affordable(type: BuildingType): boolean {
    return this.canPay(BUILDINGS[type].cost);
  }

  canAffordVillager(): boolean {
    return this.canPay(VILLAGER.cost);
  }

  /** Die Felder, die ein Gebäude an (x, y) belegen würde. */
  private footprintTiles(x: number, y: number, type: BuildingType): [number, number][] {
    const r = (BUILDINGS[type].footprint - 1) / 2;
    const tiles: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) tiles.push([x + dx, y + dy]);
    }
    return tiles;
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

    for (const [tx, ty] of this.footprintTiles(x, y, type)) {
      if (this.occupied.has(key(tx, ty))) return 'Hier steht schon etwas';
      const tile = this.probe.getTile(tx, ty);
      if (!def.terrain.includes(tile.tileType)) {
        return `${def.label} braucht festen Boden`;
      }
    }

    if (this.slopeUnder(x, y, type) > MAX_BUILD_SLOPE * def.footprint) {
      return 'Der Boden ist hier zu steil';
    }

    if (!this.affordable(type)) return 'Zu wenig Rohstoffe';
    return null;
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
        const z = reliefZ(this.probe.getTile(cx, cy).height);
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
    this.buildings.set(key(x, y), { type, x, y, queue: 0, progress: 0, hp: BUILDINGS[type].hp, rally: null });
    for (const [tx, ty] of this.footprintTiles(x, y, type)) {
      this.occupied.set(key(tx, ty), key(x, y));
    }
    this.dirty = true;
    return null;
  }

  /** Abriss. Die Hälfte der Kosten kommt zurück - sonst bestraft ein Fehlklick zu hart. */
  remove(building: Building) {
    const def = BUILDINGS[building.type];
    this.pay(def.cost, -0.5);
    // Wer noch in Ausbildung war, wird voll erstattet - er hat ja nie gearbeitet.
    this.pay(VILLAGER.cost, -building.queue);
    for (const [tx, ty] of this.footprintTiles(building.x, building.y, building.type)) {
      this.occupied.delete(key(tx, ty));
    }
    const anchor = key(building.x, building.y);
    this.buildings.delete(anchor);
    this.addRuin(building);
    // Wer gerade genau hierhin liefern wollte, sucht sich beim nächsten Tick
    // ein anderes Lager oder bleibt mit seiner Ladung stehen.
    for (const v of this.villagers) {
      if (v.task.kind === 'deliver' && v.task.building === anchor) v.task = { kind: 'idle' };
    }
    this.dirty = true;
  }

  /** Legt den Einsturz an: Schutt fliegt in alle Richtungen, landet auf dem Gelände. */
  private addRuin(building: Building) {
    const def = BUILDINGS[building.type];
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
        ground: reliefZ(this.probe.getTile(Math.floor(cx + dx), Math.floor(cy + dy)).height),
      });
    }
    this.ruins.push({
      type: building.type, x: building.x, y: building.y, at: this.time,
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
    if (!BUILDINGS[building.type].trains) return 'Nur ausbildende Gebäude haben einen Sammelpunkt';
    if (this.at(x, y) === building) {
      building.rally = null;
      this.dirty = true;
      return null;
    }
    const tile = this.probe.getTile(x, y);
    if (tile.tileType === 'water' || tile.tileType === 'deep_water') return 'Dorfbewohner können nicht schwimmen';
    building.rally = { x, y };
    this.dirty = true;
    return null;
  }

  /** Stellt einen Dorfbewohner in die Warteschlange. Kosten werden sofort fällig. */
  train(building: Building): string | null {
    if (!BUILDINGS[building.type].trains) return 'Nur das Hauptgebäude bildet Dorfbewohner aus';
    if (building.queue >= MAX_TRAINING_QUEUE) return 'Die Warteschlange ist voll';
    if (!this.canAffordVillager()) return 'Zu wenig Nahrung';
    this.pay(VILLAGER.cost);
    building.queue++;
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
    if (target) {
      const def = BUILDINGS[target.type];
      if (def.accepts.length === 0) return `${def.label} ist kein Lager`;
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

    const tile = this.probe.getTile(x, y);
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
    for (const b of this.buildings.values()) this.tickTraining(b, dt);
    this.regrowBerries(dt);
    for (const v of this.villagers) {
      v.prevX = v.x;
      v.prevY = v.y;
      v.prevStride = v.stride;
      v.prevWorkTime = v.workTime;
      v.pose = POSE.stand;
      this.tickVillager(v, dt);
    }
  }

  private tickTraining(building: Building, dt: number) {
    if (building.queue === 0) return;
    const pop = this.population();
    // Bevölkerungsgrenze erreicht: die Ausbildung wartet, bis ein Haus steht.
    if (pop.used >= pop.cap) return;

    building.progress += dt;
    if (building.progress < VILLAGER.trainTime) return;

    building.progress = 0;
    building.queue--;
    // Er tritt an der Vorderkante des Gebäudes heraus - zur Kamera hin.
    const r = BUILDINGS[building.type].footprint / 2 + 0.4;
    const spread = (this.nextId % 5) * 0.4 - 0.8;
    const x = building.x + 0.5 + r + spread * 0.5;
    const y = building.y + 0.5 + r - spread * 0.5;
    // Etwa jeder zweite ist eine Frau.
    const female = Math.random() < 0.5;
    const villager = newVillager(this.nextId++, x, y, this.freeName(female), female);
    this.villagers.push(villager);
    this.onEvent?.({ kind: 'trained', x: villager.x, y: villager.y });
    if (building.rally) this.command(new Set([villager.id]), building.rally.x, building.rally.y);
    this.dirty = true;
  }

  /** Schritt Richtung Ziel. true, sobald er bis auf `reach` heran ist. */
  /** Kann man Tile (x, y) nicht betreten? Wasser, Gebäude, stehende Bäume, Felsen. */
  private blockedAt(x: number, y: number): boolean {
    const k = key(x, y);
    if (this.occupied.has(k)) return true;
    let t = this.terrainBlock.get(k);
    if (t === undefined) {
      const found = this.probe.resourceAt(x, y);
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
  private nearestDropSite(v: Villager, type: GatherType): Building | undefined {
    let best: Building | undefined;
    let bestDistance = Infinity;
    for (const b of this.buildings.values()) {
      if (!BUILDINGS[b.type].accepts.includes(type)) continue;
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
    const def = BUILDINGS[building.type];
    const entry = modelEntry(buildingShape(building.type, building.x, building.y),
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
      type: GatherType, x: number, y: number,
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

  private tickVillager(v: Villager, dt: number) {
    const task = v.task;
    switch (task.kind) {
      case 'idle':
        return;

      case 'move':
        if (this.walk(v, task.x, task.y, 0.05, dt)) v.task = { kind: 'idle' };
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
          const site = this.nearestDropSite(v, task.type);
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
            const site = this.nearestDropSite(v, task.type);
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
          const total = this.probe.getTile(task.x, task.y).resourceAmount;
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
        // Der Arm schlägt zu, wenn sin(Phase) sein Minimum durchläuft (siehe
        // Shader) - genau dann soll man den Hieb hören. Pflücken ist im
        // Shader langsamer (Phase * 0.6), das Rascheln folgt dem Griff.
        const tempo = task.type === 'berries' ? WORK_TEMPO * 0.6 : WORK_TEMPO;
        const strikes = (time: number) => Math.floor((time * tempo - Math.PI * 1.5) / (Math.PI * 2));
        const before = strikes(v.workTime);
        v.workTime += dt;
        if (strikes(v.workTime) > before) {
          this.onEvent?.({ kind: 'strike', resource: task.type, x: v.x, y: v.y });
        }

        // Wechselt er die Ressource, lässt er die alte Ladung fallen - wie in AoE2.
        if (v.carryType !== task.type) {
          v.carrying = 0;
          v.carryType = task.type;
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
    }
  }

  // --- Zeichnen ------------------------------------------------------------

  /**
   * Sammelt alles Sichtbare als Zeichen-Instanzen. Der Rand ist großzügig,
   * damit große Gebäude am Bildrand nicht abgeschnitten aufpoppen.
   * @param blend 0..1 - wie weit der nächste Tick schon fortgeschritten ist,
   *   damit Dorfbewohner flüssig laufen statt zehnmal je Sekunde zu springen.
   * @param selection was ausgewählt ist - nur das bekommt einen Lebensbalken
   */
  instances(
      view: ViewRect,
      out: EntityInstance[] = [],
      blend = 1,
      selection?: { villagers: ReadonlySet<number>; buildings: ReadonlySet<string> },
  ): EntityInstance[] {
    const margin = 4;
    const x0 = view.x - margin;
    const y0 = view.y - margin;
    const x1 = view.x + view.width + margin;
    const y1 = view.y + view.height + margin;

    this.ruinInstances(x0, y0, x1, y1, out, blend);

    for (const building of this.buildings.values()) {
      if (building.x < x0 || building.x > x1 || building.y < y0 || building.y > y1) continue;
      const def = BUILDINGS[building.type];
      out.push({
        x: building.x,
        y: building.y,
        size: def.size,
        color: player.color.toRGB(),
        shape: buildingShape(building.type, building.x, building.y),
        alpha: 1,
        // Jede Mühle dreht in ihrem eigenen Takt.
        motion: def.shape === SHAPE.mill ? millMotion(building.x, building.y) : undefined,
        health: selection?.buildings.has(key(building.x, building.y)) ? building.hp / def.hp : undefined,
      });
    }

    for (const v of this.villagers) {
      // Im Gebäude (beim Abladen) sieht man ihn nicht.
      if (v.inside > 0) continue;
      const { x, y } = this.villagerPosition(v, blend);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const phase = v.pose === POSE.walk
        ? lerp(v.prevStride, v.stride, blend) * (Math.PI * 2 / STRIDE_LENGTH)
        : v.pose === POSE.work || v.pose === POSE.pick
          ? lerp(v.prevWorkTime, v.workTime, blend) * WORK_TEMPO
          // Stehen: Weltzeit in Sekunden, je Figur versetzt (Leerlauf-Animation).
          : this.time + blend * this.lastDt + v.id * 7.3;
      // Die Last auf dem Rücken wächst mit der Ladung und trägt die Farbe
      // der Ressource - man sieht, wer was trägt und wie viel.
      const load = v.carryType ? Math.min(1, v.carrying / VILLAGER.capacity) : 0;
      out.push({
        // Instanzen werden um die Tile-Mitte gezeichnet, die Figur steht auf (x, y).
        x: x - 0.5,
        y: y - 0.5,
        size: VILLAGER.size,
        color: player.color.toRGB(),
        // Frau oder Mann - steht beim Dorfbewohner fest (siehe Villager.female).
        shape: v.female ? SHAPE.villagerFemale : SHAPE.villager,
        alpha: 1,
        motion: [v.heading, phase, v.pose, load],
        ground: this.groundAt?.(x, y),
        health: selection?.villagers.has(v.id) ? v.hp / VILLAGER.hp : undefined,
        accent: v.carryType ? RESOURCE_TYPE_COLORS[v.carryType].toRGB() : undefined,
      });
    }
    return out;
  }

  /** Einstürzende Gebäude: Wackeln, Zusammensacken, Staub, fliegender Schutt, Ausblenden. */
  private ruinInstances(x0: number, y0: number, x1: number, y1: number, out: EntityInstance[], blend: number) {
    const now = this.time + blend * this.lastDt;
    const ease = (t: number) => t * t * (3 - 2 * t);
    for (const ruin of this.ruins) {
      if (ruin.x < x0 || ruin.x > x1 || ruin.y < y0 || ruin.y > y1) continue;
      const def = BUILDINGS[ruin.type];
      const t = now - ruin.at;
      const fade = t < RUIN_FADE_START ? 1 : Math.max(0, 1 - (t - RUIN_FADE_START) / (RUIN_DURATION - RUIN_FADE_START));
      const collapse = ease(Math.min(1, Math.max(0, (t - RUIN_COLLAPSE_START) / RUIN_COLLAPSE)));
      // Wackeln, bevor es nachgibt.
      const shake = t < RUIN_SHAKE ? Math.sin(t * 70) * 0.04 * def.size : 0;
      // Eine eingestürzte Mühle dreht nicht weiter.
      const motion = def.shape === SHAPE.mill
        ? frozenMillMotion(ruin.x, ruin.y, ruin.clock)
        : [BUILDING_HEADING, 0, 0, 0] as [number, number, number, number];
      motion[3] = Math.max(0.001, collapse);
      out.push({
        x: ruin.x + shake,
        y: ruin.y - shake,
        size: def.size,
        color: player.color.toRGB(),
        shape: buildingShape(ruin.type, ruin.x, ruin.y),
        // Knapp unter 1: bleibt so vorn in der Sortierung für Halbdurchsichtiges.
        alpha: Math.max(0.01, fade * 0.999),
        motion,
      });

      // Staub quillt in Wolken rund um das Gebäude auf, steigt und verzieht sich.
      const dustT = Math.min(1, t / 2.2);
      if (dustT < 1) {
        const spread = Math.max(def.footprint, def.size) * 0.5;
        for (let i = 0; i < 7; i++) {
          const angle = (i / 7) * Math.PI * 2 + ruin.x * 0.7;
          const reach = spread * (i === 0 ? 0 : 0.5 + 0.9 * ease(dustT));
          out.push({
            x: ruin.x + Math.cos(angle) * reach,
            y: ruin.y + Math.sin(angle) * reach,
            size: def.size * (0.7 + 0.9 * ease(dustT)) * (i === 0 ? 1.3 : 1),
            color: DUST_COLOR,
            shape: SHAPE.dust,
            alpha: 0.75 * (1 - dustT) ** 1.3 * Math.min(1, t * 6),
            motion: [def.size * (0.25 + 0.6 * dustT), 0, 0, 0],
          });
        }
      }

      // Schutt fliegt im Bogen hinaus und bleibt liegen.
      const ground = reliefZ(this.probe.getTile(ruin.x, ruin.y).height);
      const tf = Math.min(t, RUIN_FLIGHT);
      for (const d of ruin.debris) {
        const along = tf / RUIN_FLIGHT;
        // Höhe: Wurfparabel, die genau nach RUIN_FLIGHT auf der Landestelle ankommt.
        const arc = d.vz * tf - 0.5 * (2 * d.vz / RUIN_FLIGHT) * tf * tf;
        const z = ground + (d.ground - ground) * along + Math.max(0, arc) * 0.6;
        out.push({
          x: ruin.x + d.dx * along,
          y: ruin.y + d.dy * along,
          size: d.size * fade,
          color: DUST_COLOR,
          shape: SHAPE.stoneRock,
          alpha: 1,
          motion: [d.heading + t * 6 * (1 - along), 0, 0, 0],
          ground: z,
        });
      }
    }
  }

  /** Überblendete Position zwischen zwei Ticks. */
  villagerPosition(v: Villager, blend: number): { x: number; y: number } {
    return { x: v.prevX + (v.x - v.prevX) * blend, y: v.prevY + (v.y - v.prevY) * blend };
  }

  // --- Speichern -----------------------------------------------------------

  /** Schreibt nur, wenn sich etwas geändert hat. */
  save() {
    if (!this.dirty) return;
    const data: SaveData = {
      version: 3,
      stock: this.stock,
      buildings: [...this.buildings.values()].map((b) => ({
        t: b.type, x: b.x, y: b.y, q: b.queue, hp: b.hp,
        ...(b.rally ? { r: [b.rally.x, b.rally.y] as [number, number] } : {}),
      })),
      villagers: this.villagers.map((v) => ({
        x: v.x, y: v.y, c: v.carrying, ct: v.carryType, task: v.task, hp: v.hp, n: v.name, f: v.female,
      })),
      harvested: Object.fromEntries(this.harvested),
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      this.dirty = false;
    } catch {
      // Privater Modus oder volles Kontingent - das Spiel läuft weiter,
      // nur ohne Speicherstand.
    }
  }

  private load() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.storageKey);
    } catch {
      return;
    }
    if (!raw) return;

    let data:
      | SaveData
      | { version: 2 } & Omit<SaveData, 'version'>
      | { version: 1 } & Omit<SaveData, 'version' | 'villagers'>;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    // Version 1 kannte noch keine Dorfbewohner - Gebäude und Vorrat bleiben.
    if (data.version !== 1 && data.version !== 2 && data.version !== 3) return;
    // Bis Version 2 war ein Tile doppelt so lang: Koordinaten verdoppeln sich,
    // damit alles auf demselben Gelände steht. Was abgebaut war, lässt sich
    // nicht übertragen - aus einem Tile sind vier geworden -, und laufende
    // Aufträge zeigen auf alte Felder; beides beginnt von vorn.
    const scale = data.version < 3 ? 2 : 1;

    this.stock = { ...initialStock(), ...data.stock };
    // Welche Felder leer sind, steht nicht im Speicherstand - es ergibt sich
    // aus der entnommenen Menge und dem, was der Generator dort hergibt. So
    // bleibt die Datei klein und übersteht eine Änderung an den Vorkommen.
    for (const [k, amount] of Object.entries(scale === 1 ? data.harvested ?? {} : {})) {
      this.harvested.set(k, amount);
      const comma = k.indexOf(',');
      const tile = this.probe.getTile(Number(k.slice(0, comma)), Number(k.slice(comma + 1)));
      if (amount >= tile.resourceAmount) this.exhausted.add(k);
      // Wann zuletzt gepflückt wurde, steht nicht im Speicherstand - die
      // Pause beginnt beim Laden von vorn.
      if (tile.resource === 'berries') this.berryTiles.set(k, { total: tile.resourceAmount, picked: 0 });
      // Angefangene Bäume liegen schon - ohne noch einmal umzufallen. Die
      // Richtung steht nicht im Speicherstand; sie ergibt sich aus der Lage.
      if (tile.resource === 'wood') {
        const [x, y] = [Number(k.slice(0, comma)), Number(k.slice(comma + 1))];
        this.felled.set(k, { at: -Infinity, dir: ((x * 7 + y * 13) % 8) * (Math.PI / 4) });
      }
    }

    for (const b of data.buildings ?? []) {
      if (!BUILDINGS[b.t]) continue;
      // Ältere Speicherstände kennen keine Trefferpunkte - dann unbeschädigt.
      const hp = Math.min(b.hp ?? BUILDINGS[b.t].hp, BUILDINGS[b.t].hp);
      const rally = b.r ? { x: b.r[0] * scale, y: b.r[1] * scale } : null;
      const [x, y] = [b.x * scale, b.y * scale];
      this.buildings.set(key(x, y), { type: b.t, x, y, queue: b.q ?? 0, progress: 0, hp, rally });
      for (const [tx, ty] of this.footprintTiles(x, y, b.t)) {
        this.occupied.set(key(tx, ty), key(x, y));
      }
    }

    if (data.version !== 1) {
      for (const s of data.villagers ?? []) {
        // Ältere Speicherstände kennen weder Namen noch Geschlecht.
        const female = s.f ?? this.nextId % 2 === 1;
        const v = newVillager(this.nextId++, s.x * scale, s.y * scale, s.n ?? this.freeName(female), female);
        v.carrying = s.c;
        v.carryType = s.ct && GATHER_TYPES.includes(s.ct) ? s.ct : null;
        v.task = scale === 1 ? s.task ?? { kind: 'idle' } : { kind: 'idle' };
        v.hp = Math.min(s.hp ?? VILLAGER.hp, VILLAGER.hp);
        this.villagers.push(v);
      }
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
    this.occupied.clear();
    this.harvested.clear();
    this.exhausted.clear();
    this.berryTiles.clear();
    this.felled.clear();
    this.villagers = [];
    this.stock = initialStock();
    this.dirty = true;
    this.save();
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fester Winkel 0..2π je Feld - gleiche Welt, gleiche Werte. */
function tileAngle(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * Math.PI * 2;
}
