// Hud.tsx
// Die ganze Spielseite: das Canvas fürs Spielfeld und darüber das Grundgerüst
// der Oberfläche - Tastenhilfe, Legende und Entwickler-Infos, die Plätze für
// Rohstoffleiste, Auswahl, Hinweise und Baumenü, Minimap, Ton-Knopf, Kompass
// und das Pause-Schild. main.ts rendert es einmal vor allem anderen und findet
// die Teile dann über ihre IDs; was sich ändert, setzt es gezielt (Texte,
// hidden, Klassen) oder rendert die jeweilige Komponente hinein.

import { render } from 'defuss';
import './Hud.css';
import { TILE_TYPE_COLOR, TILE_TYPE_LABEL } from '../map';
import type { TileType } from '../noise';
import { ShortcutLine } from './Shortcuts';

/** Tastenhilfe oben rechts - dieselben Kürzel wie im Menü, knapp; × blendet sie aus (main.ts). */
function HelpPanel() {
  return (
    <div id="ui" class="panel">
      <button type="button" id="help-close" class="panel-close" title="Tastenhilfe ausblenden">×</button>
      <ShortcutLine />
    </div>
  );
}

/** Legende der Geländearten - nur die Farben, der Name als Tooltip. Aus der Palette, damit sie nicht aus dem Tritt gerät. */
function Legend() {
  return (
    <div id="legend">
      {(Object.keys(TILE_TYPE_LABEL) as TileType[]).map((type) => (
        <i class="legend-item" title={TILE_TYPE_LABEL[type]}
          style={`background:${TILE_TYPE_COLOR[type].toRgbString()}`} />
      ))}
    </div>
  );
}

/** Legende und Entwickler-Infos oben links - dazu Position, Abtastung und Zoom. */
function DebugPanel() {
  return (
    <div id="debug" class="panel">
      {/* Schließt das Panel - wie der Schalter im Menü (main.ts). */}
      <button type="button" id="debug-close" class="panel-close" title="Entwickler-Infos ausblenden">×</button>
      <div>
        Pos <b id="pos">0, 0</b><span class="sep">|</span>
        Tiles/Px <b id="sampling">-</b><span class="sep">|</span>
        Zoom <b id="zoom">8px</b>
      </div>
      <Legend />
      <div>Tile <b id="tile-info">-</b></div>
      {/* "Gebäude" oder "Ressource" - je nachdem, was unter dem Zeiger steht (main.ts). */}
      <div><span id="object-label">Ressource</span> <b id="resource-info">-</b></div>
      <div>
        Cursor <b id="cursor-coords">-, -</b><span class="sep">|</span>
        Kamera <b id="cam-coords">-, -</b><span class="sep">|</span>
        MiniMap <b id="hover-coords">-, -</b>
      </div>
      <div>
        FPS <b id="fps">0</b><span class="sep">|</span>
        {/* Bild = Billboards (Menü → Grafik → Bäume als Bild), 3D = Modelle. */}
        Bäume <b id="billboards">3D</b>
      </div>
    </div>
  );
}

/** Ton an/aus - das Lautsprecher-Symbol, durchgestrichen, wenn aus (Klasse muted). */
function SoundButton() {
  return (
    <button id="sound" type="button">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" stroke="none" />
        <path class="on" d="M13 7.5a3.5 3.5 0 0 1 0 5M15.5 5a7 7 0 0 1 0 10" />
        <path class="off" d="M13.5 7.5l4 5M17.5 7.5l-4 5" />
      </svg>
    </button>
  );
}

/**
 * Kompass auf dem Ring um die Minimap: die vier Himmelsrichtungen stehen an
 * den Spitzen der Raute, in die sie zeigen - main.ts stellt sie je nach
 * Blickrichtung (game/Compass.ts). Ein Klick dreht die Richtung nach oben.
 */
function Compass() {
  return (
    <div id="compass" title="Blickrichtung - klicke auf eine Himmelsrichtung">
      <button type="button" data-dir="N">N</button>
      <button type="button" data-dir="E">O</button>
      <button type="button" data-dir="S">S</button>
      <button type="button" data-dir="W">W</button>
    </div>
  );
}

/** Pfeil im Halbkreis - `flip` spiegelt ihn für die Drehung im Uhrzeigersinn. */
function TurnIcon({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round" style={flip ? 'transform:scaleX(-1)' : ''}>
      <path d="M15 16V10a5 5 0 0 0-5-5H5" />
      <path d="M8 2 5 5l3 3" />
    </svg>
  );
}

/**
 * Minimap wie in AoE4: die Raute der Karte in goldenem Rand, dahinter ein Ring
 * mit Zacken auf dunklem Stein. Unten links der Ton, unten rechts das Drehen
 * der Ansicht um eine Vierteldrehung.
 */
function Minimap() {
  // Maße wie in Hud.css: Rahmen 312 px, Raute 280 px, Mitte bei 156.
  const c = 156;
  const ring = 146;
  const tip = 140;
  // Zacken zwischen den Spitzen der Raute, wie eine Windrose.
  const spikes = [45, 135, 225, 315].map((deg) => {
    const a = (deg * Math.PI) / 180;
    const p = (r: number, off: number) => `${c + Math.cos(a + off) * r},${c + Math.sin(a + off) * r}`;
    return `${p(ring + 14, 0)} ${p(ring - 2, 0.06)} ${p(ring - 2, -0.06)}`;
  });
  return (
    <div id="minimap-frame">
      <svg class="minimap-ring" viewBox="0 0 312 312" width="312" height="312">
        {spikes.map((points) => <polygon points={points} />)}
        <circle cx={c} cy={c} r={ring} class="ring-outer" />
        <circle cx={c} cy={c} r={ring - 5} class="ring-inner" />
      </svg>
      <canvas id="minimap" />
      <svg class="minimap-edge" viewBox="0 0 312 312" width="312" height="312">
        <polygon points={`${c},${c - tip} ${c + tip},${c} ${c},${c + tip} ${c - tip},${c}`} />
      </svg>
      <Compass />
      <SoundButton />
      <div class="minimap-turn">
        <button type="button" id="turn-left" title="Ansicht gegen den Uhrzeigersinn drehen"><TurnIcon /></button>
        <button type="button" id="turn-right" title="Ansicht im Uhrzeigersinn drehen"><TurnIcon flip /></button>
      </div>
    </div>
  );
}

function Hud() {
  return (
    <>
      <HelpPanel />
      <DebugPanel />
      <div id="stock" />

      <div id="select-box" hidden />
      <div id="hint" />
      {/* Befehlsleiste wie in AoE2: Steintafel mit Baumenü oder Befehlen, Pergament mit der Auswahl. */}
      <div id="command-bar">
        <div class="cmd-stone">
          <div id="build" class="cmd-grid" />
          <div id="actions" class="cmd-grid" hidden />
        </div>
        <div id="selection" />
      </div>
      <Minimap />
      <div id="paused" hidden>Pause</div>
    </>
  );
}

/** Rendert Spielfeld-Canvas und Grundgerüst in `root` - einmal, bevor main.ts seine Teile sucht. */
export function mountGame(root: HTMLElement) {
  render(
    <>
      <canvas id="game" />
      <Hud />
    </>,
    root,
  );
}
