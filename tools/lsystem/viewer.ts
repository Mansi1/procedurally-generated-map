// Spielwiese für L-System-Bäume: Beispiel wählen, Regeln und Regler ändern,
// das Ergebnis dreht sich in der Vorschau und lässt sich als OBJ speichern.
import { grow, type LeafMode, type Tree, type TreeSpec } from './lsystem.ts';
import { looksFor } from './looks.ts';
import { mtlFile } from './mtl.ts';
import { GROUPS, PRESETS, isPresetName, type PresetName } from './presets/index.ts';
import { render, shapesFromObj, type Shape, type View } from './render.ts';

/** Regler: Feld des Rezepts, das sie einstellen - die id im HTML ist derselbe Name. */
const SLIDERS = ['iterations', 'angle', 'tropism', 'jitter', 'lengthFactor', 'leafSize'] as const satisfies readonly (keyof TreeSpec)[];
const TEXTS = ['axiom', 'rules', 'leaves'] as const satisfies readonly (keyof TreeSpec)[];

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} fehlt oder ist kein ${type.name}`);
  return el;
}

function textField(id: string): HTMLInputElement | HTMLTextAreaElement {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
  throw new Error(`#${id} fehlt oder ist kein Textfeld`);
}

const canvas = element('view', HTMLCanvasElement);
const presetSelect = element('preset', HTMLSelectElement);
const seedInput = element('seed', HTMLInputElement);
const stats = element('stats', HTMLElement);
const error = element('error', HTMLElement);
const leafModeSelect = element('leafMode', HTMLSelectElement);
const cardsSelect = element('cards', HTMLSelectElement);
const sliders = SLIDERS.map((key) => ({ key, input: element(key, HTMLInputElement), value: element(`${key}-value`, HTMLElement) }));
const texts = TEXTS.map((key) => ({ key, input: textField(key) }));

const view: View = { yaw: 0.6, pitch: 0.25, zoom: 1 };
let base: TreeSpec = PRESETS.laubbaum;
let shapes: Shape[] = [];
let tree: Tree | null = null;
/** Zählt die Aufrufe von update - eine ältere, noch ladende Vorschau zeichnet dann nicht mehr. */
let generation = 0;

const leafMode = (): LeafMode => (leafModeSelect.value === 'texture' ? 'texture' : 'shape');
const cards = () => cardsSelect.value !== '0';

/** Rezept aus dem gewählten Beispiel und den Eingaben. */
function currentSpec(): TreeSpec {
  const spec: { -readonly [K in keyof TreeSpec]: TreeSpec[K] } = { ...base, seed: Number(seedInput.value) || 1 };
  for (const { key, input } of sliders) spec[key] = Number(input.value);
  for (const { key, input } of texts) spec[key] = input.value;
  return spec;
}

function load(name: PresetName) {
  base = PRESETS[name];
  seedInput.value = String(base.seed);
  for (const { key, input } of sliders) input.value = String(base[key]);
  for (const { key, input } of texts) input.value = base[key];
  update();
}

async function update() {
  const spec = currentSpec();
  const mode = leafMode();
  const current = ++generation;
  for (const { key, value } of sliders) value.textContent = String(spec[key]);
  let grown: Tree;
  try {
    grown = grow(spec, { leaves: mode, cards: cards() });
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  error.textContent = '';
  const look = await looksFor(grown, mode);
  if (current !== generation) return;
  tree = grown;
  shapes = shapesFromObj(grown.model.out, look);
  const n = (v: number) => v.toLocaleString('de');
  stats.textContent = [
    `${grown.iterations} Schritte${grown.capped ? ' (gekappt - zu viele Zeichen)' : ''}`,
    `${n(grown.symbols)} Zeichen`, `${n(grown.segments)} Äste`, `${n(grown.leaves)} Laub`,
    `${n(shapes.length)} Flächen`, `${grown.height.toFixed(1)} m hoch`,
  ].join(' · ');
  draw();
}

const draw = () => render(canvas, shapes, view);

function save(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** OBJ und MTL; die Blattbilder liegen in tools/lsystem/leaves/img (MTL verweist auf leaves/). */
function download() {
  if (!tree) return;
  const file = `lsys_${presetSelect.value}`;
  save(`${file}.obj`, `# L-System "${base.label}" (tools/lsystem)\nmtllib ${file}.mtl\n${tree.model.out.join('\n')}\n`);
  save(`${file}.mtl`, `# ${file}.mtl${mtlFile(tree, leafMode(), 'leaves')}`);
}

// Ziehen dreht, Mausrad zoomt.
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  view.yaw += (e.clientX - drag.x) * 0.01;
  view.pitch = Math.max(-0.2, Math.min(1.4, view.pitch + (e.clientY - drag.y) * 0.01));
  drag = { x: e.clientX, y: e.clientY };
  draw();
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoom *= Math.exp(-e.deltaY * 0.001);
  draw();
}, { passive: false });
addEventListener('resize', draw);

for (const group of GROUPS) {
  const optgroup = document.createElement('optgroup');
  optgroup.label = group;
  for (const [name, p] of Object.entries(PRESETS)) if (p.group === group) optgroup.append(new Option(p.label, name));
  presetSelect.append(optgroup);
}
presetSelect.addEventListener('change', () => {
  if (!isPresetName(presetSelect.value)) return;
  history.replaceState(null, '', `?preset=${presetSelect.value}&leaves=${leafMode()}&cards=${cards() ? 1 : 0}`);
  load(presetSelect.value);
});
for (const { input } of [...sliders, ...texts]) input.addEventListener('input', update);
seedInput.addEventListener('input', update);
leafModeSelect.addEventListener('change', update);
cardsSelect.addEventListener('change', update);
element('reseed', HTMLButtonElement).addEventListener('click', () => {
  seedInput.value = String(1 + Math.floor(Math.random() * 99_999));
  update();
});
element('download', HTMLButtonElement).addEventListener('click', download);

// ?preset=<name>&leaves=shape|texture&cards=0|1 - so verlinkt die Galerie (gallery.html) hierher.
const params = new URLSearchParams(location.search);
const requested = params.get('preset') ?? '';
const initial: PresetName = isPresetName(requested) ? requested : 'laubbaum';
if (params.get('leaves') === 'texture') leafModeSelect.value = 'texture';
if (params.get('cards') === '0') cardsSelect.value = '0';
presetSelect.value = initial;
load(initial);
