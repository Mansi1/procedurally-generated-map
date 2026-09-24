// BuildMenu.tsx
// Baumenü unten in der Mitte: je Gebäudetyp ein Knopf mit Farbe, Taste,
// Name, Kosten und wozu es gut ist. Einmal gerendert; danach setzt die
// Klasse nur noch, welcher gedrückt ist und welche man sich leisten kann.

import { createRef, render, type Ref } from 'defuss';
import { RESOURCE_TYPE_LABEL } from '../map';
import { BUILDINGS, BUILDING_ORDER, type BuildingType, type Stock } from '../world/buildings';

const COST_ORDER: (keyof Stock)[] = ['wood', 'stone', 'gold', 'berries'];

/** Kosten und Nutzen eines Gebäudes für die zweite Zeile des Knopfs. */
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

interface BuildButtonProps {
  type: BuildingType;
  buttonRef: Ref<HTMLButtonElement>;
  onClick: () => void;
}

function BuildButton({ type, buttonRef, onClick }: BuildButtonProps) {
  const def = BUILDINGS[type];
  return (
    <button type="button" class="build-btn" aria-pressed="false" ref={buttonRef} onClick={onClick}>
      <span class="name">
        <i style={`background:${def.color.toRgbString()}`} />
        {def.key} {def.label}
      </span>
      <span class="cost">{describe(type)}</span>
    </button>
  );
}

export class BuildMenu {
  private buttons = new Map<BuildingType, Ref<HTMLButtonElement>>();

  /** @param onClick Klick auf den Knopf eines Gebäudetyps */
  constructor(root: HTMLElement, onClick: (type: BuildingType) => void) {
    for (const type of BUILDING_ORDER) this.buttons.set(type, createRef());
    render(
      <>
        {BUILDING_ORDER.map((type) => (
          <BuildButton type={type} buttonRef={this.buttons.get(type)!} onClick={() => onClick(type)} />
        ))}
      </>,
      root,
    );
  }

  /** Welcher Typ gerade gebaut wird (gedrückt), oder keiner. */
  setPressed(type: BuildingType | null) {
    for (const [key, ref] of this.buttons) ref.current.setAttribute('aria-pressed', String(key === type));
  }

  /** Welche Knöpfe gehen - die übrigen sind ausgegraut. */
  setEnabled(enabled: (type: BuildingType) => boolean) {
    for (const [type, ref] of this.buttons) ref.current.disabled = !enabled(type);
  }
}
