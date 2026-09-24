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

/** Tastenhilfe oben rechts. */
function HelpPanel() {
  return (
    <div id="ui" class="panel">
      <div>
        <kbd>WASD</kbd> bewegen <kbd>Q</kbd>/<kbd>E</kbd> zoomen<span class="sep">|</span>
        <kbd>1</kbd>-<kbd>6</kbd> bauen <kbd>Esc</kbd> abbrechen<span class="sep">|</span>
        <kbd>Klick</kbd>/<kbd>Ziehen</kbd> auswählen <kbd>Rechtsklick</kbd> Befehl{' '}
        <kbd>V</kbd> Dorfbewohner <kbd>H</kbd> Hauptgebäude <kbd>.</kbd> untätige <kbd>M</kbd> Ton{' '}
        <kbd>Entf</kbd> abreißen
      </div>
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
      <button type="button" id="debug-close" title="Entwickler-Infos ausblenden">×</button>
      <div>
        Pos <b id="pos">0, 0</b><span class="sep">|</span>
        Tiles/Px <b id="sampling">-</b><span class="sep">|</span>
        Zoom <b id="zoom">8px</b>
      </div>
      <Legend />
      <div>Tile <b id="tile-info">-</b></div>
      <div>
        Cursor <b id="cursor-coords">-, -</b><span class="sep">|</span>
        Kamera <b id="cam-coords">-, -</b><span class="sep">|</span>
        MiniMap <b id="hover-coords">-, -</b><span class="sep">|</span>
        FPS <b id="fps">0</b>
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

/** Kompass: Nadel und die vier Himmelsrichtungen - main.ts stellt sie je nach Blickrichtung. */
function Compass() {
  return (
    <div id="compass" title="Blickrichtung - klicke auf eine Himmelsrichtung">
      <div class="needle" />
      <button type="button" data-dir="N">N</button>
      <button type="button" data-dir="E">O</button>
      <button type="button" data-dir="S">S</button>
      <button type="button" data-dir="W">W</button>
    </div>
  );
}

function Hud() {
  return (
    <>
      <HelpPanel />
      <DebugPanel />
      <div id="stock" />
      <div id="selection" class="panel" />
      <div id="select-box" hidden />
      <div id="hint" />
      <div id="build" class="panel" />
      <canvas id="minimap" />
      <SoundButton />
      <Compass />
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
