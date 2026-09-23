// resources.ts
// Die Vorkommen als Objekte in der Landschaft: Bäume auf Holz, Felsen auf
// Stein und Gold, Sträucher auf Beeren. Welche Tiles etwas tragen, ist eine
// reine Funktion des Geländes - es wird in Stücken von 16x16 Tiles einmal
// ausgerechnet und gemerkt, verteilt über mehrere Bilder. Ein Wald hat
// Tausende Tiles; je Bild neu zu rechnen wäre viel zu teuer.

import type { EntityInstance } from '../gl/entityRenderer';
import { SHAPE, TREES } from '../gl/entityRenderer';
import type { TileProbe } from '../map';
import { reliefZ, type MapGenerator } from '../noise';
import type { GatherType } from './buildings';
import type { ViewRect, World } from './world';

/** Klein genug, dass ein Stück das Zeitbudget eines Bildes nicht sprengt. */
const CHUNK = 16;
/** So viele Stücke bleiben im Speicher - grob das Zehnfache eines Bildschirms. */
const MAX_CHUNKS = 6400;

/**
 * Modell und Grundgröße (Tiles) je Ressource. `variants`: stattdessen eine
 * dieser Formen, fest je Tile gewählt - nicht jeder Strauch sieht gleich aus.
 */
const LOOK: Record<GatherType, { shape: number; size: number; color: [number, number, number]; variants?: number[] }> = {
  wood: { shape: SHAPE.tree, size: 0.6, color: [42, 97, 52] },
  stone: {
    shape: SHAPE.stoneRock, size: 0.6, color: [158, 158, 164],
    variants: [SHAPE.stoneRock, SHAPE.stoneRock2, SHAPE.stoneRock3],
  },
  gold: {
    shape: SHAPE.goldRock, size: 0.56, color: [242, 194, 51],
    variants: [SHAPE.goldRock, SHAPE.goldRock2, SHAPE.goldRock3],
  },
  berries: {
    shape: SHAPE.berryBush, size: 0.45, color: [62, 115, 52],
    variants: [SHAPE.berryBush, SHAPE.berryBush2, SHAPE.berryBush3, SHAPE.berryBush4],
  },
};

/** Nadelbäume wachsen lieber oben, Laubbäume weiter unten. */
const CONIFERS = [SHAPE.tree, SHAPE.treePine];
/** Laubbäume, jeder so oft, wie er hier steht - Eichen am häufigsten. */
const BROADLEAF = [
  SHAPE.treeOak, SHAPE.treeOak, SHAPE.treeOak, SHAPE.treeOak, SHAPE.treeBirch, SHAPE.treeBirch,
  SHAPE.treeMaple, SHAPE.treePoplar,
];
/**
 * In einem Eichenhain stehen junge, ausgewachsene und alte Eichen gemischt -
 * je Tile eine davon, alte am seltensten.
 */
const OAKS = [
  SHAPE.treeOak, SHAPE.treeOak, SHAPE.treeOak, SHAPE.treeOak, SHAPE.treeOak,
  SHAPE.treeOakYoung, SHAPE.treeOakYoung, SHAPE.treeOakYoung, SHAPE.treeOakOld, SHAPE.treeOakOld,
];

/** Kantenlänge eines Hains in Tiles: darin wächst meist dieselbe Art. */
const GROVE = 7;

/**
 * Welche Baumart auf Tile (x, y) wächst: meist die des Hains, jeder vierte
 * Baum eine zufällige. Hoch gelegen mehr Nadelbäume.
 */
function treeAt(x: number, y: number, height: number): number {
  const own = hash(x, y, 7) < 0.25;
  const gx = own ? x : Math.floor(x / GROVE);
  const gy = own ? y : Math.floor(y / GROVE);
  // Waldtiles liegen etwa zwischen -0.3 und 0.5 hoch.
  const conifer = Math.min(1, Math.max(0, (height + 0.1) / 0.45));
  const kinds = hash(gx, gy, 8) < 0.25 + 0.6 * conifer ? CONIFERS : BROADLEAF;
  const kind = kinds[Math.floor(hash(gx, gy, 9) * kinds.length)];
  return kind === SHAPE.treeOak ? OAKS[Math.floor(hash(x, y, 10) * OAKS.length)] : kind;
}

/** Welche Form eines Vorkommens mit mehreren Varianten auf Tile (x, y) steht - fest je Tile. */
function variantAt(x: number, y: number, kinds: number[]): number {
  return kinds[Math.floor(hash(x, y, 6) * kinds.length)];
}

/** Namen der Baum- und Straucharten für die Anzeige. */
const KIND_LABEL: Record<number, string> = {
  [SHAPE.tree]: 'Fichte',
  [SHAPE.treePine]: 'Kiefer',
  [SHAPE.treeOak]: 'Eiche',
  [SHAPE.treeBirch]: 'Birke',
  [SHAPE.treePoplar]: 'Pappel',
  [SHAPE.treeMaple]: 'Ahorn',
  [SHAPE.treeOakOld]: 'Alte Eiche',
  [SHAPE.treeOakYoung]: 'Junge Eiche',
  [SHAPE.berryBush]: 'Johannisbeere',
  [SHAPE.berryBush2]: 'Brombeere',
  [SHAPE.berryBush3]: 'Heidelbeere',
  [SHAPE.berryBush4]: 'Himbeere',
};

/** Form des Vorkommens auf einem Tile - dieselbe Wahl für Bild und Anzeige. */
function shapeAt(x: number, y: number, type: GatherType, height: number): number {
  if (type === 'wood') return treeAt(x, y, height);
  const look = LOOK[type];
  return look.variants ? variantAt(x, y, look.variants) : look.shape;
}

interface ResourceNode {
  x: number;
  y: number;
  shape: number;
  total: number;
  /** Größe, wenn noch nichts abgebaut ist. */
  size: number;
  /** Wird je Bild nur angepasst, nicht neu angelegt. */
  instance: EntityInstance;
}

/** Deterministischer Zufall 0..1 je Tile und Kanal - gleiche Welt, gleiche Bäume. */
function hash(x: number, y: number, channel: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class ResourceField {
  private chunks = new Map<string, ResourceNode[]>();

  constructor(private probe: TileProbe, private mapGen: MapGenerator) {}

  /** Baum- oder Strauchart auf Tile (x, y), z. B. "Eiche" - sonst undefined. */
  kindAt(x: number, y: number): string | undefined {
    const found = this.probe.resourceAt(x, y);
    if (found.type === 'none') return undefined;
    return KIND_LABEL[shapeAt(x, y, found.type as GatherType, found.height)];
  }

  /**
   * Rechnet fehlende Stücke im Rechteck aus, die der Mitte nächsten zuerst,
   * bis das Zeitbudget dieses Bildes aufgebraucht ist.
   */
  update(view: ViewRect, centerX: number, centerY: number, budgetMs = 4) {
    const missing: [number, number][] = [];
    const cx0 = Math.floor(view.x / CHUNK);
    const cy0 = Math.floor(view.y / CHUNK);
    const cx1 = Math.floor((view.x + view.width) / CHUNK);
    const cy1 = Math.floor((view.y + view.height) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.chunks.has(`${cx},${cy}`)) missing.push([cx, cy]);
      }
    }
    if (missing.length === 0) return;

    const distance = ([cx, cy]: [number, number]) =>
      Math.hypot((cx + 0.5) * CHUNK - centerX, (cy + 0.5) * CHUNK - centerY);
    missing.sort((a, b) => distance(a) - distance(b));

    const start = performance.now();
    for (const [cx, cy] of missing) {
      this.chunks.set(`${cx},${cy}`, this.generate(cx, cy));
      if (performance.now() - start > budgetMs) break;
    }

    // Zu viele gemerkt: die am weitesten entfernten fallen weg.
    if (this.chunks.size > MAX_CHUNKS) {
      const keys = [...this.chunks.keys()].map((k) => {
        const [cx, cy] = k.split(',').map(Number);
        return { k, d: distance([cx, cy]) };
      });
      keys.sort((a, b) => b.d - a.d);
      for (let i = 0; i < this.chunks.size - MAX_CHUNKS; i++) this.chunks.delete(keys[i].k);
    }
  }

  private generate(cx: number, cy: number): ResourceNode[] {
    const nodes: ResourceNode[] = [];
    for (let y = cy * CHUNK; y < (cy + 1) * CHUNK; y++) {
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        const found = this.probe.resourceAt(x, y);
        if (found.type === 'none' || found.amount <= 0) continue;
        const look = LOOK[found.type as GatherType];
        // Etwas Streuung, damit ein Wald nicht aus lauter gleichen Bäumen
        // besteht: Größe, Drehung, Farbton und Lage im Tile.
        const size = look.size * (0.8 + 0.4 * hash(x, y, 1));
        const shade = 0.82 + 0.3 * hash(x, y, 2);
        const ox = x + (hash(x, y, 3) - 0.5) * 0.35;
        const oy = y + (hash(x, y, 4) - 0.5) * 0.35;
        const shape = shapeAt(x, y, found.type as GatherType, found.height);
        nodes.push({
          x,
          y,
          shape,
          total: found.amount,
          size,
          instance: {
            x: ox,
            y: oy,
            size,
            color: look.color.map((c) => Math.min(255, Math.round(c * shade))) as [number, number, number],
            shape,
            alpha: 1,
            motion: [hash(x, y, 5) * Math.PI * 2, 0, 0, 0],
            ground: this.groundUnder(ox + 0.5, oy + 0.5, size / 2),
          },
        });
      }
    }
    return nodes;
  }

  /**
   * Tiefster Punkt des Geländes unter einem Objekt (Mitte und vier Punkte am
   * Rand). Am Hang steht es so mit der Talseite auf dem Boden und mit der
   * Bergseite im Hang - auf der Mitte oder gar der Tile-Ecke abgestellt
   * schwebte es talseitig über dem Boden.
   */
  private groundUnder(x: number, y: number, radius: number): number {
    let lowest = this.mapGen.heightAt(x, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      lowest = Math.min(lowest, this.mapGen.heightAt(x + dx * radius, y + dy * radius));
    }
    return reliefZ(lowest);
  }

  /**
   * Die Objekte im Rechteck. Was abgebaut wird, schrumpft, was leer ist,
   * verschwindet. Das ausgewählte Vorkommen bekommt einen Balken mit dem Rest.
   */
  instances(view: ViewRect, world: World, out: EntityInstance[],
            selected: { x: number; y: number } | null = null, blend = 1) {
    const x1 = view.x + view.width;
    const y1 = view.y + view.height;
    for (let cy = Math.floor(view.y / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++) {
      for (let cx = Math.floor(view.x / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        const nodes = this.chunks.get(`${cx},${cy}`);
        if (!nodes) continue;
        for (const node of nodes) {
          if (node.x < view.x || node.x > x1 || node.y < view.y || node.y > y1) continue;
          const share = world.remainingShare(node.x, node.y, node.total);
          if (share <= 0) continue;
          node.instance.size = node.size * (0.45 + 0.55 * share);
          // Gefällte Bäume kippen um bzw. liegen: Winkel und Richtung des
          // Falls stecken in motion[1] und motion[2].
          const motion = node.instance.motion!;
          const fall = TREES.includes(node.shape) ? world.fall(node.x, node.y, blend) : null;
          motion[1] = fall ? fall.angle : 0;
          motion[2] = fall ? fall.dir : 0;
          // Die Instanzen werden wiederverwendet - der Balken muss also auch
          // wieder weg, wenn die Auswahl wechselt.
          node.instance.health =
            selected && selected.x === node.x && selected.y === node.y ? share : undefined;
          out.push(node.instance);
        }
      }
    }
  }
}
