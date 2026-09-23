// world.ts
// Der veränderliche Teil der Welt. Das Gelände ist eine reine Funktion aus
// Seed und Koordinate - alles hier drin ist es nicht: Gebäude, Dorfbewohner,
// bereits abgebaute Vorkommen, Vorrat. Genau deshalb muss es gespeichert
// werden, während das Gelände jederzeit neu berechnet werden kann.

import type { EntityInstance } from '../gl/entityRenderer';
import { POSE, SHAPE, millMotion } from '../gl/entityRenderer';
import { RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABEL, type TileProbe } from '../map';
import { reliefZ } from '../noise';
import {
  BUILDINGS,
  GATHER_TYPES,
  MAX_BUILD_SLOPE,
  MAX_TRAINING_QUEUE,
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
  | { kind: 'trained'; x: number; y: number };

export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Farbe der Markierung über einem leergeräumten Vorkommen. */
const EXHAUSTED_COLOR: [number, number, number] = [16, 18, 22];

/** Neue Figur an (x, y) - alle Laufzeit-Felder auf Anfang. */
function newVillager(id: number, x: number, y: number): Villager {
  return {
    id, x, y, prevX: x, prevY: y,
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
  };
}

/** Abstand der Sammelplätze von der Feldmitte, in Tiles. */
const GATHER_SPREAD = 0.4;
/** Abstand zur Gebäudekante, ab dem er abliefern kann. */
const DELIVER_REACH = 0.6;

interface SaveData {
  version: 3;
  stock: Stock;
  buildings: { t: BuildingType; x: number; y: number; q?: number; hp?: number; r?: [number, number] }[];
  villagers: { x: number; y: number; c: number; ct: GatherType | null; task: Task; hp?: number }[];
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
   * Gefällte Bäume: wann (Weltzeit) und in welche Richtung (Radiant) sie
   * umgefallen sind. Ein Baum fällt beim ersten Axthieb und wird danach als
   * liegender Stamm abgebaut - wie in AoE2.
   */
  private felled = new Map<string, { at: number; dir: number }>();
  /** Weltzeit in Sekunden, läuft mit den Ticks. */
  private time = 0;
  private lastDt = 0;
  private dirty = false;
  private nextId = 1;

  stock: Stock = initialStock();
  villagers: Villager[] = [];
  onEvent: ((event: WorldEvent) => void) | null = null;

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
    // Nicht ganz flach - Äste und Stumpf halten den Stamm etwas hoch.
    const LYING = Math.PI / 2 - 0.1;
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
      { type: GatherType; remaining: number; total: number; gatherers: number } | null {
    const found = this.remainingAt(x, y);
    if (!found.type || found.amount <= 0) return null;
    let gatherers = 0;
    for (const v of this.villagers) {
      if (v.task.kind === 'gather' && v.task.x === x && v.task.y === y) gatherers++;
    }
    return {
      type: found.type,
      remaining: found.amount,
      total: this.probe.getTile(x, y).resourceAmount,
      gatherers,
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
    // Wer gerade genau hierhin liefern wollte, sucht sich beim nächsten Tick
    // ein anderes Lager oder bleibt mit seiner Ladung stehen.
    for (const v of this.villagers) {
      if (v.task.kind === 'deliver' && v.task.building === anchor) v.task = { kind: 'idle' };
    }
    this.dirty = true;
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
      for (const v of selected) {
        v.task = { kind: 'gather', type: found.type, x, y, delivering: false };
        v.problem = null;
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
    for (const b of this.buildings.values()) this.tickTraining(b, dt);
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
    const villager = newVillager(this.nextId++, x, y);
    this.villagers.push(villager);
    this.onEvent?.({ kind: 'trained', x: villager.x, y: villager.y });
    if (building.rally) this.command(new Set([villager.id]), building.rally.x, building.rally.y);
    this.dirty = true;
  }

  /** Schritt Richtung Ziel. true, sobald er bis auf `reach` heran ist. */
  private walk(v: Villager, tx: number, ty: number, reach: number, dt: number): boolean {
    const dx = tx - v.x;
    const dy = ty - v.y;
    const d = Math.hypot(dx, dy);
    if (d <= reach) return true;
    const step = Math.min(VILLAGER.speed * dt, d - reach);
    v.x += (dx / d) * step;
    v.y += (dy / d) * step;
    v.heading = Math.atan2(dy, dx);
    v.stride += step;
    v.pose = POSE.walk;
    this.dirty = true;
    return d - step <= reach + 1e-6;
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
    // Bis an die Kante des Modells bzw. der belegten Felder - was größer ist.
    const def = BUILDINGS[building.type];
    const reach = Math.max(def.footprint, def.size) / 2 + DELIVER_REACH;
    if (!this.walk(v, building.x + 0.5, building.y + 0.5, reach, dt)) return false;
    if (v.carryType && v.carrying > 0) {
      this.stock[v.carryType] += v.carrying;
      this.onEvent?.({ kind: 'deliver', x: v.x, y: v.y });
    }
    v.carrying = 0;
    v.carryType = null;
    this.dirty = true;
    return true;
  }

  /** Nächstes nicht leeres Feld derselben Art um (x, y) - wenn eins leer ist, macht er dort weiter. */
  private nextDeposit(type: GatherType, x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDistance = Infinity;
    const r = VILLAGER.searchRadius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bestDistance || d > r * r) continue;
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
          const next = this.nextDeposit(task.type, task.x, task.y);
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
        const spotX = task.x + 0.5 + Math.cos(angle) * GATHER_SPREAD;
        const spotY = task.y + 0.5 + Math.sin(angle) * GATHER_SPREAD;
        if (!this.walk(v, spotX, spotY, 0.05, dt)) return;
        // Am Platz: zum Vorkommen drehen und arbeiten.
        v.heading = Math.atan2(task.y + 0.5 - v.y, task.x + 0.5 - v.x);
        v.pose = POSE.work;
        // Der Arm schlägt zu, wenn sin(Phase) sein Minimum durchläuft (siehe
        // Shader) - genau dann soll man den Hieb hören.
        const strikes = (time: number) => Math.floor((time * WORK_TEMPO - Math.PI * 1.5) / (Math.PI * 2));
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
      selection?: { villagers: ReadonlySet<number>; building: string | null },
  ): EntityInstance[] {
    const margin = 4;
    const x0 = view.x - margin;
    const y0 = view.y - margin;
    const x1 = view.x + view.width + margin;
    const y1 = view.y + view.height + margin;

    // Leergeräumte Felder zuerst: das Gelände zeigt dort noch die Einfärbung
    // des Vorkommens, obwohl nichts mehr da ist.
    for (const k of this.exhausted) {
      const comma = k.indexOf(',');
      const x = Number(k.slice(0, comma));
      const y = Number(k.slice(comma + 1));
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      out.push({ x, y, size: 1, color: EXHAUSTED_COLOR, shape: SHAPE.flat, alpha: 0.45 });
    }

    for (const building of this.buildings.values()) {
      if (building.x < x0 || building.x > x1 || building.y < y0 || building.y > y1) continue;
      const def = BUILDINGS[building.type];
      out.push({
        x: building.x,
        y: building.y,
        size: def.size,
        color: def.color.toRGB(),
        shape: def.shape,
        alpha: 1,
        // Jede Mühle dreht in ihrem eigenen Takt.
        motion: def.shape === SHAPE.mill ? millMotion(building.x, building.y) : undefined,
        health: selection?.building === key(building.x, building.y) ? building.hp / def.hp : undefined,
      });
    }

    for (const v of this.villagers) {
      const { x, y } = this.villagerPosition(v, blend);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const phase = v.pose === POSE.walk
        ? lerp(v.prevStride, v.stride, blend) * (Math.PI * 2 / STRIDE_LENGTH)
        : v.pose === POSE.work
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
        color: VILLAGER.color.toRGB(),
        shape: SHAPE.villager,
        alpha: 1,
        motion: [v.heading, phase, v.pose, load],
        health: selection?.villagers.has(v.id) ? v.hp / VILLAGER.hp : undefined,
        accent: v.carryType ? RESOURCE_TYPE_COLORS[v.carryType].toRGB() : undefined,
      });
    }
    return out;
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
        x: v.x, y: v.y, c: v.carrying, ct: v.carryType, task: v.task, hp: v.hp,
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
        const v = newVillager(this.nextId++, s.x * scale, s.y * scale);
        v.carrying = s.c;
        v.carryType = s.ct && GATHER_TYPES.includes(s.ct) ? s.ct : null;
        v.task = scale === 1 ? s.task ?? { kind: 'idle' } : { kind: 'idle' };
        v.hp = Math.min(s.hp ?? VILLAGER.hp, VILLAGER.hp);
        this.villagers.push(v);
      }
    }
  }

  /** Alles zurücksetzen - für den Neustart-Knopf. */
  reset() {
    this.buildings.clear();
    this.occupied.clear();
    this.harvested.clear();
    this.exhausted.clear();
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
