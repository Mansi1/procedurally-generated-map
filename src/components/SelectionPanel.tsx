// SelectionPanel.tsx
// Auswahl-Panel unten links: was ausgewählt ist und was man damit tun kann.
// main.ts fragt die Welt ab und beschreibt das Ergebnis als SelectionView
// (reine Daten); diese Komponente zeichnet es. Die Knöpfe tragen data-action
// (train, demolish, crop, idle) - ausgewertet per Delegation in main.ts.
// Neu gerendert wird getaktet mit dem Vorrat; defuss gleicht dabei nur ab,
// was sich geändert hat.

import { render } from 'defuss';
import './SelectionPanel.css';
import './buttons.css';
import { formatDuration } from '../format';
import { CROP_ORDER, CROPS, type CropType } from '../world/buildings';

/** Stand eines zusammenhängenden Felds. */
export interface FarmView {
  phase: string;
  /** Tiles des Felds - bei mehr als einem angezeigt. */
  tiles: number;
  crops: string;
  food: number;
  rows: number;
  ploughed: number;
  sown: number;
  ripe: number;
  /** Sekunden, bis die nächste Furche reif ist - wenn etwas wächst. */
  nextRipeIn?: number;
  farmers: string[];
}

/** Ausbildung von Dorfbewohnern: Knopf und seine Kosten. */
export interface TrainView {
  label: string;
  cost: string;
  affordable: boolean;
}

export type SelectionView =
  | {
      kind: 'buildings';
      title: string;
      /** "2× Haus, 1× Mühle" - bei verschiedenen Arten. */
      kinds?: string;
      hp: number;
      maxHp: number;
      training?: { queued: number; capacity: number; train: TrainView };
      farms?: { farmers: number; rows: number; plan: CropType | null };
    }
  | {
      kind: 'building';
      label: string;
      hp: number;
      maxHp: number;
      accepts?: string;
      provides?: number;
      farm?: FarmView & { plan: CropType };
      trainer?: {
        queue: number;
        max: number;
        full: boolean;
        /** Fortschritt des vordersten in Prozent - nur, wenn einer in Ausbildung ist. */
        percent: number;
        rally: boolean;
        train: TrainView;
      };
    }
  | {
      kind: 'resource';
      title: string;
      subtitle?: string;
      left: number;
      total: number;
      percent: number;
      regrow?: { empty: boolean; seconds: number };
      gatherers: number;
      max: number;
    }
  | { kind: 'empty' }
  | {
      kind: 'villagers';
      /** Genau einer: Name, Frau oder Mann, was er gerade tut. */
      single?: { name: string; role: string; doing: string };
      count: number;
      label: string;
      names: string;
      hp: number;
      maxHp: number;
      /** Gleiche Tätigkeiten zusammengefasst: [Text, Anzahl]. */
      activities: [string, number][];
    }
  | { kind: 'start' }
  | { kind: 'overview'; idle: number };

function Bar({ percent }: { percent: number }) {
  return <div class="bar"><i style={`width:${percent}%`} /></div>;
}

function ActionButton({ action, name, cost, title, disabled, crop, pressed }: {
  action: string;
  name: string;
  cost: string;
  title?: string;
  disabled?: boolean;
  crop?: CropType;
  pressed?: boolean;
}) {
  return (
    <button class="build-btn" data-action={action} data-crop={crop} title={title} disabled={disabled}
      aria-pressed={pressed === undefined ? undefined : String(pressed)}>
      <span class="name">{name}</span>
      <span class="cost">{cost}</span>
    </button>
  );
}

function TrainButton({ train }: { train: TrainView }) {
  return (
    <ActionButton action="train" name={`V ${train.label}`} cost={train.cost}
      title="Mit Umschalt: 5 auf einmal" disabled={!train.affordable} />
  );
}

/** Knöpfe zur Wahl der Frucht; `current` ist gedrückt. */
function CropButtons({ current }: { current: CropType | null }) {
  return (
    <>
      {CROP_ORDER.map((c) => (
        <ActionButton action="crop" crop={c} pressed={c === current} name={CROPS[c].label}
          cost={`${CROPS[c].food} Nahrung · reif in ${formatDuration(CROPS[c].growTime)}`} />
      ))}
    </>
  );
}

/** Stand eines Felds: Phase, Furchen je Arbeitsschritt, Ernte, Bauern. */
function FarmDetails({ farm }: { farm: FarmView }) {
  return (
    <>
      <div>
        <b>{farm.phase}</b>
        {farm.tiles > 1 ? <span class="muted"> ({farm.tiles} Tiles)</span> : null}
      </div>
      <div>{farm.crops} · <b>{Math.ceil(farm.food)}</b> Nahrung auf dem Feld</div>
      <div class="muted">
        Furchen: {farm.ploughed}/{farm.rows} gepflügt · {farm.sown}/{farm.rows} gesät · {farm.ripe}/{farm.rows} reif
      </div>
      {farm.nextRipeIn !== undefined
        ? <div class="muted">Nächste Furche reif in {formatDuration(farm.nextRipeIn)}</div>
        : null}
      <div>
        Bauern <b>{farm.farmers.length}/{farm.rows}</b>
        {farm.farmers.length > 0 ? <span class="muted"> {farm.farmers.join(', ')}</span> : null}
      </div>
      {farm.farmers.length === 0
        ? <div class="muted">Wähle Dorfbewohner und klicke mit rechts auf das Feld - je Furche arbeitet einer.</div>
        : null}
    </>
  );
}

function Buildings({ v }: { v: Extract<SelectionView, { kind: 'buildings' }> }) {
  return (
    <>
      <div class="title">{v.title}</div>
      {v.kinds ? <div class="muted">{v.kinds}</div> : null}
      <div>Trefferpunkte <b>{Math.ceil(v.hp)}/{v.maxHp}</b></div>
      {v.training ? (
        <>
          <div>In Ausbildung <b>{v.training.queued}/{v.training.capacity}</b></div>
          <div class="muted">
            Neue Dorfbewohner kommen in die kürzeste Warteschlange; Rechtsklick setzt den Sammelpunkt für alle.
          </div>
        </>
      ) : null}
      {v.farms ? <div>Bauern <b>{v.farms.farmers}/{v.farms.rows}</b></div> : null}
      <div class="actions">
        {v.training ? <TrainButton train={v.training.train} /> : null}
        {v.farms ? <CropButtons current={v.farms.plan} /> : null}
        <ActionButton action="demolish" name="Entf Alle abreißen" cost="50 % zurück" />
      </div>
    </>
  );
}

function Building({ v }: { v: Extract<SelectionView, { kind: 'building' }> }) {
  const t = v.trainer;
  return (
    <>
      <div class="title">{v.label}</div>
      <div>Trefferpunkte <b>{Math.ceil(v.hp)}/{v.maxHp}</b></div>
      {v.accepts ? <div class="muted">Lager für {v.accepts}</div> : null}
      {v.provides ? <div class="muted">+{v.provides} Bevölkerung</div> : null}
      {v.farm ? <FarmDetails farm={v.farm} /> : null}
      {t && t.queue > 0 ? (
        <>
          <div>
            In Ausbildung <b>{t.queue}/{t.max}</b>
            {t.full ? <> - <span class="muted">Bevölkerung voll, baue ein Haus</span></> : null}
          </div>
          <Bar percent={t.percent} />
        </>
      ) : null}
      {t ? (
        <div class="muted">
          {t.rally
            ? 'Sammelpunkt gesetzt - Rechtsklick versetzt ihn, auf das Gebäude hebt ihn auf.'
            : 'Rechtsklick auf die Karte setzt einen Sammelpunkt für neue Dorfbewohner.'}
        </div>
      ) : null}
      <div class="actions">
        {v.farm ? <CropButtons current={v.farm.plan} /> : null}
        {t ? <TrainButton train={t.train} /> : null}
        <ActionButton action="demolish" name="Entf Abreißen" cost="50 % zurück" />
      </div>
    </>
  );
}

function Resource({ v }: { v: Extract<SelectionView, { kind: 'resource' }> }) {
  return (
    <>
      <div class="title">
        {v.title}
        {v.subtitle ? <span class="muted"> {v.subtitle}</span> : null}
      </div>
      <div>Übrig <b>{v.left}/{v.total}</b></div>
      <Bar percent={v.percent} />
      {/* Beerensträucher wachsen nach - wie lange noch, bis er wieder voll ist. */}
      {v.regrow ? (
        <div class="muted">
          {v.regrow.empty ? 'Leer gepflückt - wächst nach' : 'Wächst nach'} · voll in {formatDuration(v.regrow.seconds)}
        </div>
      ) : null}
      <div>
        Sammler <b>{v.gatherers}/{v.max}</b>
        {v.gatherers >= v.max ? <span class="muted"> - voll besetzt</span> : null}
      </div>
      {v.gatherers === 0 && v.left > 0
        ? <div class="muted">Wähle Dorfbewohner und klicke mit rechts darauf, um es zu sammeln.</div>
        : null}
    </>
  );
}

function Villagers({ v }: { v: Extract<SelectionView, { kind: 'villagers' }> }) {
  return (
    <>
      {v.single ? (
        <div class="title">{v.single.name} <span class="muted">{v.single.role}</span></div>
      ) : (
        <>
          <div class="title">{v.count} {v.label}</div>
          <div class="muted">{v.names}</div>
        </>
      )}
      <div>Trefferpunkte <b>{Math.ceil(v.hp)}/{v.maxHp}</b></div>
      {v.single
        ? <div>{v.single.doing}</div>
        : <>{v.activities.map(([text, n]) => <div>{n}× {text}</div>)}</>}
      <div class="muted">
        Rechtsklick auf Holz, Stein, Gold oder Beeren: sammeln · auf ein Tier: jagen · auf ein Feld: bestellen ·
        auf ein Lager: abliefern · sonst: hingehen
      </div>
    </>
  );
}

export function SelectionPanel({ view }: { view: SelectionView }) {
  switch (view.kind) {
    case 'buildings': return <Buildings v={view} />;
    case 'building': return <Building v={view} />;
    case 'resource': return <Resource v={view} />;
    case 'empty':
      return <><div class="title">Leer</div><div class="muted">Hier ist nichts mehr zu holen.</div></>;
    case 'villagers': return <Villagers v={view} />;
    case 'start':
      return (
        <>
          <div class="title">Los geht's</div>
          <div class="muted">Baue zuerst ein Hauptgebäude (Taste 1). Dort bildest du Dorfbewohner aus.</div>
        </>
      );
    case 'overview':
      return (
        <>
          <div class="muted">Klicke auf das Hauptgebäude, um Dorfbewohner auszubilden (V), oder wähle Dorfbewohner aus.</div>
          {view.idle > 0 ? (
            <div class="actions">
              <ActionButton action="idle" name=". Untätige" cost={`${view.idle} ohne Arbeit`} />
            </div>
          ) : null}
        </>
      );
  }
}

/** Zeichnet `view` in das Panel - defuss gleicht nur ab, was sich geändert hat. */
export function renderSelection(root: HTMLElement, view: SelectionView) {
  render(<SelectionPanel view={view} />, root);
}
