// ResourceBar.tsx
// Rohstoffleiste oben links wie in AoE2: ein Steinband, darauf je Rohstoff
// ein Symbol mit der Zahl der Sammler unten links und daneben der Vorrat,
// dann die Bevölkerung, ein runder Knopf für untätige Dorfbewohner und das
// Zahnrad fürs Menü.
// Eine defuss-Komponente: einmal gerendert, danach setzt update() über Refs
// nur Texte, Titel und Klassen - neu gerendert luden die Bilder neu, und die
// Leiste zuckte.

import { createRef, render, type Props, type Ref } from 'defuss';
import './ResourceBar.css';
import type { Stock } from '../world/buildings';
import { MenuButton } from './MenuButton';

import woodIcon from '../icons/wood.png';
import berriesIcon from '../icons/berries.png';
import goldIcon from '../icons/gold.png';
import stoneIcon from '../icons/stone.png';
import populationIcon from '../icons/population.png';
import idleIcon from '../icons/idle.png';
import woodBar from '../icons/wood-bar.png';

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

/** Refs einer Zelle: die ganze Zelle (Titel), der Vorrat und die Zahl der Sammler. */
interface CellRefs {
  item: Ref<HTMLDivElement>;
  amount: Ref<HTMLSpanElement>;
  count: Ref<HTMLSpanElement>;
}

const cellRefs = (): CellRefs => ({ item: createRef(), amount: createRef(), count: createRef() });

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <img src={ICONS[name]} width="34" height="34" alt="" draggable={false} />;
}

interface CellProps extends Props {
  name: keyof typeof ICONS;
  refs: CellRefs;
  pop?: boolean;
}

/** Eine Zelle: Symbol mit Sammlerzahl, daneben der Vorrat. */
function Cell({ name, refs, pop }: CellProps) {
  return (
    <div class="rb-item" data-key={name} ref={refs.item}>
      <span class="rb-icon">
        <Icon name={name} />
        <span class="rb-count" ref={refs.count} />
      </span>
      <span class={pop ? 'rb-amount rb-pop' : 'rb-amount'} ref={refs.amount} />
    </div>
  );
}

export class ResourceBar {
  private cells = new Map<string, CellRefs>();
  private idleButton = createRef<HTMLButtonElement>();
  private idleCount = createRef<HTMLSpanElement>();

  /** @param onMenu Klick aufs Zahnrad */
  constructor(root: HTMLElement, order: (keyof Stock)[], onMenu: () => void) {
    root.style.backgroundImage = `url(${woodBar})`;
    for (const key of [...order, 'population']) this.cells.set(key, cellRefs());
    render(
      <>
        {order.map((r) => <Cell name={r} refs={this.cells.get(r)!} />)}
        <Cell name="population" refs={this.cells.get('population')!} pop />
        {/* Ein Klick wählt die untätigen Dorfbewohner aus (siehe main.ts, data-action). */}
        <button type="button" class="rb-idle" data-action="idle" ref={this.idleButton}
          title="Untätige auswählen (Taste .) - mit Umschalt einzeln">
          <Icon name="idle" />
          <span class="rb-count" ref={this.idleCount} />
        </button>
        <MenuButton onClick={onMenu} />
      </>,
      root,
    );
  }

  update(s: ResourceBarState) {
    for (const r of s.order) {
      const cell = this.cells.get(r)!;
      setText(cell.amount.current, String(Math.floor(s.stock[r])));
      setText(cell.count.current, String(s.gatherers[r]));
      setTitle(cell.item.current, `${s.labels[r]} - ${s.gatherers[r]} ${s.villagerLabel} sammeln`);
    }
    const pop = s.population;
    const cell = this.cells.get('population')!;
    setText(cell.amount.current, `${pop.used}/${pop.cap}${pop.training > 0 ? ` +${pop.training}` : ''}`);
    cell.amount.current.classList.toggle('full', pop.cap > 0 && pop.used >= pop.cap);
    setText(cell.count.current, String(pop.used));
    setTitle(cell.item.current, `Bevölkerung${pop.training > 0 ? ` - ${pop.training} in Ausbildung` : ''}`);
    this.idleButton.current.classList.toggle('active', s.idle > 0);
    setText(this.idleCount.current, String(s.idle));
  }
}

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}
function setTitle(el: HTMLElement, text: string) {
  if (el.title !== text) el.title = text;
}
