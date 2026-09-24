// pathfinding.ts
// Wege für Dorfbewohner: A* auf dem Tile-Raster mit acht Richtungen, ohne
// Ecken abzuschneiden, danach geglättet (Sichtlinie), damit niemand im
// Zickzack läuft. Das Raster ist unendlich - die Suche ist deshalb auf eine
// Anzahl Knoten begrenzt.

/** Ist Tile (x, y) versperrt? */
export type Blocked = (x: number, y: number) => boolean;

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Kleiner binärer Heap nach f. */
class Heap {
  private items: { k: number; f: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(k: number, f: number) {
    const a = this.items;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.k;
  }
}

// Tile-Koordinaten in eine Zahl gepackt (je ±2^20 Tiles reicht für jede Karte).
const OFFSET = 1 << 20;
const pack = (x: number, y: number) => (x + OFFSET) * 2 ** 21 + (y + OFFSET);
const unpackX = (k: number) => Math.floor(k / 2 ** 21) - OFFSET;
const unpackY = (k: number) => (k % 2 ** 21) - OFFSET;

/**
 * Freie Sichtlinie zwischen zwei Punkten (Weltkoordinaten): kein versperrtes
 * Tile auf dem Weg, geprüft in kleinen Schritten und mit etwas Abstand zu
 * den Seiten, damit die Figur nicht über Ecken streift.
 */
export function lineOfSight(x0: number, y0: number, x1: number, y1: number, blocked: Blocked): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 0.2);
  const [nx, ny] = d > 0 ? [-(y1 - y0) / d, (x1 - x0) / d] : [0, 0];
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    for (const side of [-0.18, 0, 0.18]) {
      if (blocked(Math.floor(x + nx * side), Math.floor(y + ny * side))) return false;
    }
  }
  return true;
}

/**
 * Weg von (sx, sy) nach (tx, ty), beides Weltkoordinaten. Fertig, sobald ein
 * Tile innerhalb von `reach` Tiles um das Ziel erreicht ist - Gebäude
 * versperren ihr eigenes Feld, man läuft nur bis heran. Liefert die
 * Wegpunkte (Tile-Mitten, ohne den Start) oder null, wenn es keinen Weg
 * gibt (oder er zu weit wäre).
 */
export function findPath(
    sx: number, sy: number, tx: number, ty: number, reach: number,
    blocked: Blocked, maxNodes = 6000,
): { x: number; y: number }[] | null {
  const start = pack(Math.floor(sx), Math.floor(sy));
  const gx = Math.floor(tx), gy = Math.floor(ty);
  const done = (x: number, y: number) =>
    (x === gx && y === gy) || Math.hypot(x + 0.5 - tx, y + 0.5 - ty) <= reach + 0.75;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const g = new Map<number, number>([[start, 0]]);
  const from = new Map<number, number>();
  const closed = new Set<number>();
  const open = new Heap();
  open.push(start, h(Math.floor(sx), Math.floor(sy)));
  let found = -1;

  while (open.size > 0 && closed.size < maxNodes) {
    const k = open.pop();
    if (closed.has(k)) continue;
    closed.add(k);
    const x = unpackX(k), y = unpackY(k);
    if (done(x, y)) {
      found = k;
      break;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const nk = pack(nx, ny);
      if (closed.has(nk)) continue;
      // Das Ziel-Tile selbst ist immer erreichbar (Baum, Fels: man steht daran).
      const goal = nx === gx && ny === gy;
      if (!goal && blocked(nx, ny)) continue;
      // Diagonal nur, wenn beide Nachbarn frei sind - keine Ecken abschneiden.
      if (dx !== 0 && dy !== 0 && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
      const ng = g.get(k)! + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        from.set(nk, k);
        open.push(nk, ng + h(nx, ny));
      }
    }
  }
  if (found < 0) return null;

  // Rückwärts einsammeln, dann glätten: von jedem Punkt so weit springen,
  // wie die Sichtlinie reicht.
  const tiles: { x: number; y: number }[] = [];
  for (let k = found; k !== start; k = from.get(k)!) tiles.push({ x: unpackX(k) + 0.5, y: unpackY(k) + 0.5 });
  tiles.reverse();
  const smooth: { x: number; y: number }[] = [];
  let cx = sx, cy = sy, i = 0;
  while (i < tiles.length) {
    let j = tiles.length - 1;
    while (j > i && !lineOfSight(cx, cy, tiles[j].x, tiles[j].y, blocked)) j--;
    smooth.push(tiles[j]);
    cx = tiles[j].x;
    cy = tiles[j].y;
    i = j + 1;
  }
  return smooth;
}
