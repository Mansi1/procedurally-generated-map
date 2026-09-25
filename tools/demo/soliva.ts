// tools/demo/soliva.ts
// Demo-Spielstand für die Welt Soliva, gebaut mit der echten Spiellogik:
// Hauptgebäude, Häuser, Lager, Felder und Dorfbewohner bei der Arbeit.
// Aufruf: npx vite-node tools/demo/soliva.ts - schreibt public/demo-soliva.json.
import fs from 'node:fs';
import { MapGenerator } from '../../src/noise';
import { Terrain } from '../../src/map';
import { World } from '../../src/world/world';
import { VILLAGER, type BuildingType } from '../../src/world/catalog';

// Die Welt speichert in den localStorage - hier ein Ersatz im Speicher.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const seed = 'Soliva';
const mapGen = new MapGenerator(seed);
const terrain = new Terrain(mapGen, seed);
const world = new World(terrain, seed);
world.stock = { food: 99999, wood: 99999, stone: 99999, gold: 99999 };

function spiral(cx: number, cy: number, maxR: number, test: (x: number, y: number) => boolean) {
  for (let r = 0; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (test(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
    }
  }
  return null;
}
const res = (x: number, y: number) => terrain.getTile(x, y).resource;
/** Nahe `near`, aber nicht auf dem Vorkommen selbst - mindestens `gap` Tiles daneben. */
const place = (type: BuildingType, near: { x: number; y: number }, r = 14, gap = 0) => {
  const at = spiral(near.x, near.y, r, (x, y) => Math.max(Math.abs(x - near.x), Math.abs(y - near.y)) >= gap
    && world.canPlace(x, y, type) === null);
  if (!at) { console.log('kein Platz für', type); return null; }
  world.place(at.x, at.y, type);
  console.log(type, at);
  return at;
};

// Hauptgebäude: nächster Platz zum Standardstart, mit Holz, Beeren und Stein in der Nähe.
const count = (x: number, y: number, type: string, r: number) => {
  let n = 0;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (res(x + dx, y + dy) === type) n++;
  return n;
};
const tc = spiral(88, -59, 160, (x, y) => world.canPlace(x, y, 'town_center') === null
  && count(x, y, 'wood', 12) >= 8 && count(x, y, 'berries', 12) >= 2 && count(x, y, 'stone', 22) + count(x, y, 'gold', 22) >= 2);
if (!tc) throw new Error('kein Platz fürs Hauptgebäude');
world.place(tc.x, tc.y, 'town_center');
console.log('town_center', tc);

const nearest = (type: string) => spiral(tc.x, tc.y, 30, (x, y) => res(x, y) === type);
const wood = nearest('wood'), berries = nearest('berries'), stone = nearest('stone'), gold = nearest('gold');
console.log({ wood, berries, stone, gold });

for (const [dx, dy] of [[-4, 0], [0, -4], [-4, -4]]) place('house', { x: tc.x + dx, y: tc.y + dy }, 6);
if (wood) place('lumber_camp', wood, 8, 2);
if (berries) place('mill', berries, 8, 2);
if (stone ?? gold) place('mining_camp', (stone ?? gold)!, 8, 2);
// Felder nebeneinander.
const firstFarm = place('farm', { x: tc.x + 4, y: tc.y + 4 }, 8);
// Bis zu drei weitere Feldstücke im 3er-Raster daneben - sie wachsen zu einem Feld zusammen.
if (firstFarm) {
  let added = 0;
  for (const [dx, dy] of [[3, 0], [0, 3], [3, 3], [-3, 0], [0, -3], [-3, 3], [3, -3]]) {
    if (added === 3) break;
    const x = firstFarm.x + dx, y = firstFarm.y + dy;
    if (world.canPlace(x, y, 'farm') === null) {
      world.place(x, y, 'farm');
      console.log('farm', { x, y });
      added++;
    }
  }
}

// Dorfbewohner ausbilden.
const center = world.townCenters()[0];
for (let i = 0; i < 14; i++) world.train(center);
for (let t = 0; t < 14 * VILLAGER.trainTime + 5; t += 0.1) world.tick(0.1);
console.log('Dorfbewohner:', world.villagers.length);

// Arbeit verteilen.
const ids = world.villagers.map((v: any) => v.id);
const give = (n: number, target: { x: number; y: number } | null) => {
  if (!target) return;
  const set = new Set(ids.splice(0, n));
  const reason = world.command(set, target.x, target.y);
  if (reason) console.log('Befehl', target, reason);
};
give(4, wood);
give(3, berries);
give(2, stone);
give(1, gold);
if (firstFarm) give(4, firstFarm);

// Eine Weile arbeiten lassen - Vorrat, Felder, abgebaute Bäume.
for (let t = 0; t < 150; t += 0.1) world.tick(0.1);
// Ein Vorrat wie nach einer Weile Spielen.
world.stock = { food: 310, wood: 420, stone: 180, gold: 90 };
console.log('Vorrat', world.stock, 'Bevölkerung', world.population());
(world as any).dirty = true;
world.save();
const json = store.get(`pgm.world.${seed}`)!;
fs.writeFileSync(new URL('../../public/demo-soliva.json', import.meta.url), JSON.stringify(JSON.parse(json), null, 1));
console.log('Größe', json.length);
