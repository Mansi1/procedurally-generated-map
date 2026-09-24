// BuildMenu.tsx
// Baumenü in der Steintafel der Befehlsleiste: je Gebäudetyp ein
// quadratischer Knopf mit dem Modell in Spielerfarbe und der Taste oben
// links; Name, Kosten und Nutzen im Tooltip. Einmal gerendert; danach setzt
// die Klasse nur noch, welcher gedrückt ist, welche man sich leisten kann
// und - nach einem Farbwechsel - die Bilder.

import { createRef, render, type Ref } from 'defuss';
import './buttons.css';
import { RESOURCE_TYPE_LABEL } from '../map';
import { BUILDINGS, BUILDING_ORDER, type BuildingType, type Stock } from '../world/buildings';
import { buildingIcon } from './modelIcons';

type RGB = [number, number, number];

const COST_ORDER: (keyof Stock)[] = ['wood', 'stone', 'gold', 'berries'];

/** Kosten und Nutzen eines Gebäudes für den Tooltip. */
function describe(type: BuildingType): string {
  const def = BUILDINGS[type];
  const cost = COST_ORDER.filter((r) => def.cost[r])
    .map((r) => `${def.cost[r]} ${RESOURCE_TYPE_LABEL[r]}`)
    .join(', ');
  const use = def.provides > 0
    ? `+${def.provides} Platz`
    : def.accepts.length > 0
      ? `Lager: ${def.accepts.map((r) => RESOURCE_TYPE_LABEL[r]).join('/')}`
      : type === 'farm' ? 'Nahrung' : '';
  return [cost || 'kostenlos', use].filter(Boolean).join(' · ');
}

interface ButtonRefs {
  button: Ref<HTMLButtonElement>;
  icon: Ref<HTMLImageElement>;
}

function BuildButton({ type, refs, src, onClick }: { type: BuildingType; refs: ButtonRefs; src: string; onClick: () => void }) {
  const def = BUILDINGS[type];
  return (
    <button type="button" class="cmd-btn" aria-pressed="false" ref={refs.button} onClick={onClick}
      title={`${def.label} (${def.key})\n${describe(type)}`}>
      <img src={src} alt={def.label} draggable={false} ref={refs.icon} />
      <span class="cmd-key">{def.key}</span>
    </button>
  );
}

export class BuildMenu {
  private buttons = new Map<BuildingType, ButtonRefs>();
  private player: RGB;

  /** @param onClick Klick auf den Knopf eines Gebäudetyps */
  constructor(root: HTMLElement, player: RGB, onClick: (type: BuildingType) => void) {
    this.player = player;
    for (const type of BUILDING_ORDER) this.buttons.set(type, { button: createRef(), icon: createRef() });
    render(
      <>
        {BUILDING_ORDER.map((type) => (
          <BuildButton type={type} refs={this.buttons.get(type)!} src={buildingIcon(type, player)} onClick={() => onClick(type)} />
        ))}
      </>,
      root,
    );
  }

  /** Welcher Typ gerade gebaut wird (gedrückt), oder keiner. */
  setPressed(type: BuildingType | null) {
    for (const [key, refs] of this.buttons) refs.button.current.setAttribute('aria-pressed', String(key === type));
  }

  /** Welche Knöpfe gehen - die übrigen sind ausgegraut. */
  setEnabled(enabled: (type: BuildingType) => boolean) {
    for (const [type, refs] of this.buttons) refs.button.current.disabled = !enabled(type);
  }

  /** Neue Spielerfarbe: die Gebäude neu zeichnen. */
  setPlayerColor(player: RGB) {
    if (player.every((c, i) => c === this.player[i])) return;
    this.player = player;
    for (const [type, refs] of this.buttons) refs.icon.current.src = buildingIcon(type, player);
  }
}
