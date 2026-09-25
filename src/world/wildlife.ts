// wildlife.ts
// Das Wild der Welt: welche Tiere es gibt, wo neue entstehen und was aus
// Kadavern wird. Tiere entstehen stückweise nahe der Kamera - fest nach Seed
// und Lage: auf Wiese und Waldboden mal ein Rudel Rehe, mal ein, zwei Hasen.
// Wie ein einzelnes Tier sich verhält, steht in unit/AnimalBase.ts.

import type { Terrain } from '../map';
import { ANIMALS, createAnimal, type Animal, type AnimalKind, type AnimalOptions, type AnimalSurroundings } from './unit';

/** Kantenlänge (Tiles) der Stücke, in denen Tiere entstehen - je Stück höchstens ein Rudel. */
const CHUNK = 24;
/** Tiere entstehen nur so nah an der Kamera (Tiles) - herausgezoomt sonst Tausende. */
const SPAWN_RADIUS = 60;

/** Was das Wild von der Welt braucht. */
export interface WildlifeWorld {
  terrain: Terrain;
  /** Steht auf dem Tile ein Gebäude (auch ein Feld)? */
  isOccupied(tileX: number, tileY: number): boolean;
  /** Neue Kennung für eine Figur - Tiere und Dorfbewohner teilen sich den Zähler. */
  nextId(): number;
  /** Zahl aus dem Seed der Welt - damit die Tiere in jeder Welt woanders stehen. */
  seedHash: number;
}

export class Wildlife {
  animals: Animal[] = [];
  /** Stücke, in denen schon Tiere entstanden sind - "cx,cy". */
  spawnedChunks = new Set<string>();

  constructor(private world: WildlifeWorld) {}

  /**
   * Lässt in den Stücken um (x, y) Tiere entstehen, die noch keine hatten.
   * true, wenn dabei ein Stück dazukam.
   */
  spawnAround(x: number, y: number): boolean {
    let spawned = false;
    for (let cy = Math.floor((y - SPAWN_RADIUS) / CHUNK); cy <= Math.floor((y + SPAWN_RADIUS) / CHUNK); cy++) {
      for (let cx = Math.floor((x - SPAWN_RADIUS) / CHUNK); cx <= Math.floor((x + SPAWN_RADIUS) / CHUNK); cx++) {
        const k = `${cx},${cy}`;
        if (this.spawnedChunks.has(k)) continue;
        this.spawnedChunks.add(k);
        this.spawnChunk(cx, cy);
        spawned = true;
      }
    }
    return spawned;
  }

  /** Ein Rudel (oder keins) im Stück (cx, cy), an einem Platz auf Wiese oder Waldboden ohne Baum und Fels. */
  private spawnChunk(cx: number, cy: number) {
    const seed = this.world.seedHash;
    const roll = hash01(cx, cy, seed);
    const kind: AnimalKind | null = roll < 0.22 ? 'deer' : roll < 0.55 ? 'hare' : null;
    if (!kind) return;
    const definition = ANIMALS[kind];
    for (let tries = 0; tries < 16; tries++) {
      const x = cx * CHUNK + Math.floor(hash01(cx, cy, seed + 10 + tries) * CHUNK);
      const y = cy * CHUNK + Math.floor(hash01(cx, cy, seed + 40 + tries) * CHUNK);
      const tile = this.world.terrain.getTile(x, y);
      if ((tile.tileType !== 'grass' && tile.tileType !== 'forest') || tile.resource !== 'none' || this.world.isOccupied(x, y)) continue;
      const [min, max] = definition.herd;
      const count = min + Math.floor(hash01(cx, cy, seed + 80) * (max - min + 1));
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + hash01(cx, cy, seed + 90 + i) * 2;
        this.add(kind, x + 0.5 + Math.cos(a) * (i ? 1 : 0), y + 0.5 + Math.sin(a) * (i ? 1 : 0));
      }
      return;
    }
  }

  add(kind: AnimalKind, x: number, y: number, options?: AnimalOptions): Animal {
    const animal = createAnimal(kind, this.world.nextId(), x, y, options);
    this.animals.push(animal);
    return animal;
  }

  byId(id: number): Animal | undefined {
    return this.animals.find((a) => a.id === id);
  }

  /** Das Tier, das einem Welt-Punkt am nächsten liegt - höchstens `radius` Tiles entfernt. */
  near(x: number, y: number, radius: number): Animal | undefined {
    let best: Animal | undefined;
    let bestDistance = radius;
    for (const a of this.animals) {
      const d = a.distanceTo(x, y);
      if (d < bestDistance) {
        bestDistance = d;
        best = a;
      }
    }
    return best;
  }

  /** Ein Tick für alle Tiere; leer zerlegte Kadaver verschwinden. true, wenn sich etwas geändert hat. */
  tick(dt: number, surroundings: AnimalSurroundings): boolean {
    let changed = false;
    for (const a of this.animals) changed = a.tick(dt, surroundings) || changed;
    if (this.animals.some((a) => a.isEmptyCarcass)) {
      this.animals = this.animals.filter((a) => !a.isEmptyCarcass);
      changed = true;
    }
    return changed;
  }

  clear() {
    this.animals = [];
    this.spawnedChunks.clear();
  }
}

/** Zahl 0..1, fest je Stück und Kanal. */
export function hash01(x: number, y: number, channel: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
