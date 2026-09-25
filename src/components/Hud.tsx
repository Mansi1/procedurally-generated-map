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
import woodBar from '../icons/wood-bar.png';
import type { TileType } from '../noise';
import { MenuButton } from './MenuButton';
import { SaveButton } from './SaveButton';
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
      <div>FPS <b id="fps">0</b></div>
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
 * den Stellen des Rings, in die sie zeigen - main.ts stellt sie je nach
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
 * Minimap wie in AoE4, aber aus Holz wie die Rohstoffleiste: die Karte füllt
 * eine runde, eingelassene Scheibe mit Holzreif und Nägeln, alles auf Planken. In den Ecken runde Holzknöpfe: oben Speichern und
 * Menü (mountMinimapMenu), unten links der Ton, unten rechts das Drehen.
 */
function Minimap() {
  // Maße wie in Hud.css: Rahmen 312 px, Karte 284 px, Mitte bei 156.
  const c = 156;
  const ring = 146;
  // Nägel im Ring, zwischen den Himmelsrichtungen - wie auf den Planken oben.
  const nails = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x: c + Math.cos(a) * ring, y: c + Math.sin(a) * ring };
  });
  return (
    <div id="minimap-frame" style={`background-image:url(${woodBar})`}>
      <svg class="minimap-ring" viewBox="0 0 312 312" width="312" height="312">
        <defs>
          <radialGradient id="minimap-disc" cx="50%" cy="45%" r="55%">
            <stop offset="0" stop-color="#3e2614" />
            <stop offset="1" stop-color="#1c1009" />
          </radialGradient>
          <radialGradient id="minimap-nail" cx="40%" cy="35%" r="65%">
            <stop offset="0" stop-color="#b9b2a4" />
            <stop offset="0.6" stop-color="#5d574c" />
            <stop offset="1" stop-color="#2a2620" />
          </radialGradient>
        </defs>
        {/* Eingelassene Scheibe: dunkles Holz, außen ein Reif aus Kantholz. */}
        <circle cx={c} cy={c} r={ring + 3} class="disc" />
        <circle cx={c} cy={c} r={ring} class="ring-wood" />
        <circle cx={c} cy={c} r={ring - 4.5} class="ring-light" />
        <circle cx={c} cy={c} r={ring + 5} class="ring-light" />
        {nails.map((n) => <circle cx={n.x} cy={n.y} r="3" class="nail" />)}
      </svg>
      {/* Die Karte dreht sich beim Drehen der Ansicht (game/TurnAnimation.ts). */}
      <div class="minimap-spin">
        <canvas id="minimap" />
      </div>
      {/* Schatten des Reifs auf der Karte - sie liegt eingelassen darunter. */}
      <div class="minimap-shade" />
      <Compass />
      <div id="minimap-menu" />
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

/** Speichern und Menü in die oberen Ecken des Minimap-Rahmens - game/ui.ts kennt die Aktionen. */
export function mountMinimapMenu(onSave: () => void, onMenu: () => void) {
  render(
    <>
      <SaveButton onClick={onSave} />
      <MenuButton onClick={onMenu} />
    </>,
    document.getElementById('minimap-menu')!,
  );
}

/** Rendert Spielfeld-Canvas und Grundgerüst in `root` - einmal, bevor main.ts seine Teile sucht. */
export function mountGame(root: HTMLElement) {
  render(
    <>
      <canvas id="game" />
      {/* Das letzte Bild vor dem Drehen, für den Übergang (game/TurnAnimation.ts). */}
      <canvas id="turn-snapshot" hidden />
      <Hud />
    </>,
    root,
  );
}
