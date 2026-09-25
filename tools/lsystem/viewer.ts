// Spielwiese für L-System-Bäume: Beispiel wählen, Regeln und Regler ändern,
// das Ergebnis dreht sich in der Vorschau und lässt sich als OBJ speichern.
import { grow, type Tree, type TreeSpec } from './lsystem.ts';
import { MATERIALS } from './materials.ts';
import { GROUPS, PRESETS, isPresetName, type PresetName } from './presets/index.ts';
import { render, trianglesFromObj, type Triangle, type View } from './render.ts';

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
const sliders = SLIDERS.map((key) => ({ key, input: element(key, HTMLInputElement), value: element(`${key}-value`, HTMLElement) }));
const texts = TEXTS.map((key) => ({ key, input: textField(key) }));

const view: View = { yaw: 0.6, pitch: 0.25, zoom: 1 };
let base: TreeSpec = PRESETS.laubbaum;
let triangles: Triangle[] = [];
let obj = '';

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

function update() {
  const spec = currentSpec();
  for (const { key, value } of sliders) value.textContent = String(spec[key]);
  let tree: Tree;
  try {
    tree = grow(spec);
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  error.textContent = '';
  obj = `# L-System "${spec.label}", Seed ${spec.seed} (tools/lsystem)\n${tree.model.out.join('\n')}\n`;
  triangles = trianglesFromObj(tree.model.out, MATERIALS);
  const n = (v: number) => v.toLocaleString('de');
  stats.textContent = [
    `${tree.iterations} Schritte${tree.capped ? ' (gekappt - zu viele Zeichen)' : ''}`,
    `${n(tree.symbols)} Zeichen`, `${n(tree.segments)} Äste`, `${n(tree.leaves)} Laub`,
    `${n(triangles.length)} Dreiecke`, `${tree.height.toFixed(1)} m hoch`,
  ].join(' · ');
  draw();
}

const draw = () => render(canvas, triangles, view);

function download() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([obj], { type: 'model/obj' }));
  a.download = `lsys_${presetSelect.value}.obj`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  history.replaceState(null, '', `?preset=${presetSelect.value}`);
  load(presetSelect.value);
});
for (const { input } of [...sliders, ...texts]) input.addEventListener('input', update);
seedInput.addEventListener('input', update);
element('reseed', HTMLButtonElement).addEventListener('click', () => {
  seedInput.value = String(1 + Math.floor(Math.random() * 99_999));
  update();
});
element('download', HTMLButtonElement).addEventListener('click', download);

// ?preset=<name> - so verlinkt die Galerie (gallery.html) hierher.
const requested = new URLSearchParams(location.search).get('preset') ?? '';
const initial: PresetName = isPresetName(requested) ? requested : 'laubbaum';
presetSelect.value = initial;
load(initial);
