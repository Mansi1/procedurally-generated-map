// Galerie: alle Beispiele als kleine Bilder, nach Gruppen. Ein Klick öffnet
// das Beispiel in der Spielwiese (index.html?preset=<name>).
import { grow } from './lsystem.ts';
import { MATERIALS } from './materials.ts';
import { GROUPS, PRESETS, type Preset } from './presets/index.ts';
import { render, trianglesFromObj } from './render.ts';

const VIEW = { yaw: 0.6, pitch: 0.2, zoom: 1 };
const main = document.querySelector('main');
if (!main) throw new Error('<main> fehlt');

const jobs: { canvas: HTMLCanvasElement; preset: Preset }[] = [];
for (const group of GROUPS) {
  const entries = Object.entries(PRESETS).filter(([, p]) => p.group === group);
  const heading = document.createElement('h2');
  heading.textContent = group;
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const [name, p] of entries) {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `./?preset=${name}`;
    const canvas = document.createElement('canvas');
    const label = document.createElement('span');
    label.textContent = p.label;
    card.append(canvas, label);
    grid.append(card);
    jobs.push({ canvas, preset: p });
  }
  main.append(heading, grid);
}

// Eins nach dem anderen, damit die Seite schon während des Rechnens reagiert.
async function renderAll() {
  for (const { canvas, preset } of jobs) {
    await new Promise((resolve) => setTimeout(resolve));
    const tree = grow(preset);
    render(canvas, trianglesFromObj(tree.model.out, MATERIALS), VIEW);
    canvas.title = `${tree.height.toFixed(1)} m · ${tree.model.out.length.toLocaleString('de')} OBJ-Zeilen`;
  }
  document.body.dataset['done'] = 'true';
}
void renderAll();
