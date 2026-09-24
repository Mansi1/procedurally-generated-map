// editor.ts
// Szenario-Editor wie in AoE2: alles, was das Spiel an Modellen hat, frei
// hinstellen - echte Gebäude und Felder (kostenlos), Dorfbewohner, Wild, und
// jedes Modell als Deko zum Anschauen. Die Palette ist hier; was ein Klick in
// die Welt bewirkt, entscheidet main.ts.

import { BUILDING_HEADING, SHAPE } from './gl/entityRenderer';
import { ANIMALS, BUILDING_ORDER, BUILDINGS, type AnimalKind, type BuildingType } from './world/buildings';

export type EditorItem =
  | { kind: 'building'; label: string; type: BuildingType }
  | { kind: 'villager'; label: string; female: boolean }
  | { kind: 'animal'; label: string; animal: AnimalKind }
  | { kind: 'decor'; label: string; shape: number; size: number; heading: number }
  | { kind: 'erase'; label: string };

/** Deko: jedes Modell in der Größe, in der es im Spiel steht. */
const decor = (label: string, shape: number, size: number, heading = 0): EditorItem =>
  ({ kind: 'decor', label, shape, size, heading });

/** Die Palette, nach Gruppen. */
export const EDITOR_GROUPS: { label: string; items: EditorItem[] }[] = [
  {
    label: 'Gebäude',
    items: BUILDING_ORDER.map((type) => ({ kind: 'building', label: BUILDINGS[type].label, type })),
  },
  {
    label: 'Einheiten',
    items: [
      { kind: 'villager', label: 'Dorfbewohner', female: false },
      { kind: 'villager', label: 'Dorfbewohnerin', female: true },
    ],
  },
  {
    label: 'Tiere',
    items: (Object.keys(ANIMALS) as AnimalKind[]).map((animal) => ({ kind: 'animal', label: ANIMALS[animal].label, animal })),
  },
  {
    label: 'Bäume',
    items: [
      decor('Fichte', SHAPE.tree, 0.6), decor('Kiefer', SHAPE.treePine, 0.6), decor('Eiche', SHAPE.treeOak, 0.6),
      decor('Junge Eiche', SHAPE.treeOakYoung, 0.6), decor('Alte Eiche', SHAPE.treeOakOld, 0.6),
      decor('Birke', SHAPE.treeBirch, 0.6), decor('Ahorn', SHAPE.treeMaple, 0.6), decor('Pappel', SHAPE.treePoplar, 0.6),
    ],
  },
  {
    label: 'Natur',
    items: [
      decor('Stein 1', SHAPE.stoneRock, 0.6), decor('Stein 2', SHAPE.stoneRock2, 0.6), decor('Stein 3', SHAPE.stoneRock3, 0.6),
      decor('Gold 1', SHAPE.goldRock, 0.56), decor('Gold 2', SHAPE.goldRock2, 0.56), decor('Gold 3', SHAPE.goldRock3, 0.56),
      decor('Johannisbeere', SHAPE.berryBush, 0.45), decor('Brombeere', SHAPE.berryBush2, 0.45),
      decor('Heidelbeere', SHAPE.berryBush3, 0.45), decor('Himbeere', SHAPE.berryBush4, 0.45),
    ],
  },
  {
    label: 'Modelle',
    items: [
      ...[SHAPE.house, SHAPE.house2, SHAPE.house3, SHAPE.house4].map((s, i) => decor(`Haus ${i + 1}`, s, BUILDINGS.house.size, BUILDING_HEADING)),
      ...[SHAPE.mill, SHAPE.mill2, SHAPE.mill3, SHAPE.mill4].map((s, i) => decor(`Mühle ${i + 1}`, s, BUILDINGS.forager.size, BUILDING_HEADING)),
      ...[SHAPE.lumberCamp, SHAPE.lumberCamp2, SHAPE.lumberCamp3, SHAPE.lumberCamp4]
        .map((s, i) => decor(`Holzlager ${i + 1}`, s, BUILDINGS.lumberjack.size, BUILDING_HEADING)),
      decor('Hauptgebäude', SHAPE.townCenter, BUILDINGS.town_center.size, BUILDING_HEADING),
      decor('Minenlager', SHAPE.miningCamp, BUILDINGS.mine.size, BUILDING_HEADING),
      decor('Fahne', SHAPE.rallyFlag, 0.54),
    ],
  },
];

const ERASE: EditorItem = { kind: 'erase', label: 'Löschen' };

/**
 * Die Leiste des Editors unten am Bildrand: Gruppen als Reiter, darunter
 * ihre Modelle, dazu Löschen und Beenden. Hält fest, was gerade gesetzt wird
 * und in welche Richtung Deko schaut (R dreht).
 */
export class EditorPanel {
  readonly el: HTMLDivElement;
  active = false;
  item: EditorItem | null = null;
  /** Zusätzliche Drehung für Deko (Radiant). */
  turn = 0;
  private group = 0;

  constructor(private onClose: () => void) {
    this.el = document.createElement('div');
    this.el.id = 'editor';
    this.el.className = 'panel';
    this.el.hidden = true;
    this.el.addEventListener('mousedown', (e) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;
      e.preventDefault();
      if (button.dataset.group !== undefined) this.group = Number(button.dataset.group);
      if (button.dataset.item !== undefined) {
        const item = EDITOR_GROUPS[this.group].items[Number(button.dataset.item)];
        this.item = this.item === item ? null : item;
      }
      if (button.dataset.act === 'erase') this.item = this.item === ERASE ? null : ERASE;
      if (button.dataset.act === 'close') this.onClose();
      this.render();
    });
    document.body.appendChild(this.el);
  }

  show(on: boolean) {
    this.active = on;
    this.el.hidden = !on;
    if (!on) this.item = null;
    this.render();
  }

  /** R: Deko um 45° weiterdrehen. */
  rotate() {
    this.turn = (this.turn + Math.PI / 4) % (Math.PI * 2);
  }

  private render() {
    const tabs = EDITOR_GROUPS.map((g, i) =>
      `<button type="button" class="editor-tab" data-group="${i}" aria-pressed="${i === this.group}">${g.label}</button>`).join('');
    const items = EDITOR_GROUPS[this.group].items.map((item, i) =>
      `<button type="button" class="build-btn" data-item="${i}" aria-pressed="${item === this.item}"><span class="name">${item.label}</span></button>`).join('');
    this.el.innerHTML =
      `<div class="editor-head"><b>Szenario-Editor</b>${tabs}` +
      `<button type="button" class="editor-tab" data-act="erase" aria-pressed="${this.item === ERASE}">Löschen</button>` +
      `<button type="button" class="editor-tab" data-act="close">Beenden <small>F4</small></button></div>` +
      `<div class="editor-items">${items}</div>` +
      `<div class="muted">Linksklick setzt · R dreht Deko · Rechtsklick legt das Werkzeug weg · das Spiel steht still</div>`;
  }
}
