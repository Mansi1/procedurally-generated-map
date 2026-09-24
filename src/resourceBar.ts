// resourceBar.ts
// Rohstoffleiste oben links wie in AoE2: ein Steinband, darauf je Rohstoff
// ein Symbol mit der Zahl der Sammler unten links und daneben der Vorrat,
// dann die Bevölkerung und ein runder Knopf für untätige Dorfbewohner.

import type { Stock } from './world/buildings';

import woodIcon from './icons/wood.png';
import berriesIcon from './icons/berries.png';
import goldIcon from './icons/gold.png';
import stoneIcon from './icons/stone.png';
import populationIcon from './icons/population.png';
import idleIcon from './icons/idle.png';
import woodBar from './icons/wood-bar.png';

/**
 * Symbole: die Modelle aus dem Spiel (Eiche, Beerenstrauch, Goldfels,
 * Steinhaufen, Dorfbewohner), vorab als PNG mit durchsichtigem Grund gerendert.
 */
const ICONS: Record<keyof Stock | 'population' | 'idle', string> = {
  wood: woodIcon,
  berries: berriesIcon,
  gold: goldIcon,
  stone: stoneIcon,
  population: populationIcon,
  idle: idleIcon,
};

const icon = (name: keyof typeof ICONS) =>
  `<img src="${ICONS[name]}" width="34" height="34" alt="" draggable="false">`;

export interface ResourceBarState {
  order: (keyof Stock)[];
  stock: Stock;
  labels: Record<keyof Stock, string>;
  /** Sammler je Rohstoff. */
  gatherers: Record<keyof Stock, number>;
  population: { used: number; cap: number; training: number };
  idle: number;
  villagerLabel: string;
}

/**
 * Die Leiste wird einmal aufgebaut; danach ändern sich nur Texte, Titel und
 * Klassen. Würde sie bei jeder Änderung neu gesetzt, luden die Bilder neu und
 * die Leiste zuckte.
 */
export class ResourceBar {
  private amount = new Map<string, HTMLElement>();
  private count = new Map<string, HTMLElement>();
  private item = new Map<string, HTMLElement>();
  private idleButton: HTMLButtonElement;

  constructor(root: HTMLElement, order: (keyof Stock)[]) {
    root.style.backgroundImage = `url(${woodBar})`;
    const cell = (key: string, name: keyof typeof ICONS) =>
      `<div class="rb-item" data-key="${key}">` +
      `<span class="rb-icon">${icon(name)}<span class="rb-count"></span></span>` +
      `<span class="rb-amount${key === 'population' ? ' rb-pop' : ''}"></span></div>`;
    root.innerHTML = order.map((r) => cell(r, r)).join('') + cell('population', 'population') +
      // Ein Klick wählt die untätigen Dorfbewohner aus (siehe main.ts, data-action).
      `<button type="button" class="rb-idle" data-action="idle"` +
      ` title="Untätige auswählen (Taste .) - mit Umschalt einzeln">` +
      `${icon('idle')}<span class="rb-count"></span></button>`;
    for (const el of root.querySelectorAll<HTMLElement>('.rb-item')) {
      const key = el.dataset.key!;
      this.item.set(key, el);
      this.amount.set(key, el.querySelector('.rb-amount')!);
      this.count.set(key, el.querySelector('.rb-count')!);
    }
    this.idleButton = root.querySelector('.rb-idle')!;
  }

  update(s: ResourceBarState) {
    for (const r of s.order) {
      setText(this.amount.get(r)!, String(Math.floor(s.stock[r])));
      setText(this.count.get(r)!, String(s.gatherers[r]));
      setTitle(this.item.get(r)!, `${s.labels[r]} - ${s.gatherers[r]} ${s.villagerLabel} sammeln`);
    }
    const pop = s.population;
    const amount = this.amount.get('population')!;
    setText(amount, `${pop.used}/${pop.cap}${pop.training > 0 ? ` +${pop.training}` : ''}`);
    amount.classList.toggle('full', pop.cap > 0 && pop.used >= pop.cap);
    setText(this.count.get('population')!, String(pop.used));
    setTitle(this.item.get('population')!,
        `Bevölkerung${pop.training > 0 ? ` - ${pop.training} in Ausbildung` : ''}`);
    this.idleButton.classList.toggle('active', s.idle > 0);
    setText(this.idleButton.querySelector('.rb-count')!, String(s.idle));
  }
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}
function setTitle(el: HTMLElement, text: string) {
  if (el.title !== text) el.title = text;
}
