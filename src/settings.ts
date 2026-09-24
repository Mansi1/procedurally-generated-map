// settings.ts
// Einstellungen und das Menü dazu (Zahnrad an der Rohstoffleiste oder F10,
// wie in AoE2). Die Werte merkt sich der Browser; ohne Speicher gelten die
// Vorgaben.

import woodBar from './icons/wood-bar.png';
import { PLAYER_COLORS } from './world/buildings';

export interface Settings {
  /** Lautstärke 0..1 - an/aus steuert weiterhin Sound.enabled (Taste M). */
  volume: number;
  /** Spielgeschwindigkeit: 1 = normal. */
  speed: number;
  /** Kamera-Tempo mit WASD/Pfeiltasten: 1 = normal. */
  scroll: number;
  /** Tastenhilfe oben rechts. */
  showHelp: boolean;
  /** Legende und Tile-, Kamera- und FPS-Anzeige oben links. */
  showDebug: boolean;
  /** Himmelsrichtung, die oben im Bild liegt (Kompass) - bleibt beim Neuladen. */
  facing: string;
  /** Angehalten (F3) - bleibt beim Neuladen. */
  paused: boolean;
  /** Spielerfarbe - Schlüssel in PLAYER_COLORS. */
  playerColor: string;
}

const DEFAULTS: Settings = {
  volume: 1, speed: 1, scroll: 1, showHelp: true, showDebug: true, facing: '', paused: false,
  playerColor: 'green',
};
const STORAGE_KEY = 'pgm.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Kein Speicher oder kaputter Eintrag - dann die Vorgaben.
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Ohne Speicher gelten die Einstellungen nur bis zum Neuladen.
  }
}

/** Was das Menü außer den Einstellungen braucht - main.ts liefert es. */
export interface MenuHooks {
  /** Nach jeder Änderung: Einstellungen anwenden. */
  apply(s: Settings): void;
  soundEnabled(): boolean;
  toggleSound(): void;
  paused(): boolean;
  togglePause(): void;
  /** Den Szenario-Editor öffnen. */
  openEditor(): void;
  newGame(): void;
}

const SPEEDS: [number, string][] = [[1, 'Normal'], [1.5, 'Schnell'], [2, 'Sehr schnell']];

/**
 * Menü als Holztafel in der Bildmitte. open()/close()/toggle() öffnen und
 * schließen es; solange es offen ist, meldet isOpen() true (main.ts nimmt
 * dann keine Spieltasten an).
 */
export class SettingsMenu {
  private el: HTMLElement;
  private opened = false;

  constructor(private settings: Settings, private hooks: MenuHooks) {
    this.el = document.createElement('div');
    this.el.id = 'menu';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="menu-board" role="dialog" aria-label="Menü">
        <div class="menu-title">Menü</div>
        <section>
          <h3>Spieler</h3>
          <div class="menu-row">
            <span>Farbe</span>
            <span class="menu-colors">
              ${Object.entries(PLAYER_COLORS).map(([key, c]) =>
                `<button type="button" data-color="${key}" title="${c.label}" style="background:${c.color.toRgbString()}"></button>`).join('')}
            </span>
          </div>
        </section>
        <section>
          <h3>Spiel</h3>
          <div class="menu-row">
            <span>Pause <small>F3</small></span>
            <button type="button" class="menu-btn" data-act="pause"></button>
          </div>
          <div class="menu-row">
            <span>Geschwindigkeit</span>
            <span class="menu-choice" data-set="speed">
              ${SPEEDS.map(([v, l]) => `<button type="button" data-value="${v}">${l}</button>`).join('')}
            </span>
          </div>
        </section>
        <section>
          <h3>Ton</h3>
          <div class="menu-row">
            <span>Ton <small>M</small></span>
            <button type="button" class="menu-btn" data-act="sound"></button>
          </div>
          <div class="menu-row">
            <span>Lautstärke</span>
            <input type="range" min="0" max="100" step="5" data-set="volume">
            <output data-out="volume"></output>
          </div>
        </section>
        <section>
          <h3>Steuerung</h3>
          <div class="menu-row">
            <span>Kamera-Tempo</span>
            <input type="range" min="50" max="200" step="10" data-set="scroll">
            <output data-out="scroll"></output>
          </div>
        </section>
        <section>
          <h3>Anzeige</h3>
          <label class="menu-row"><span>Tastenhilfe</span><input type="checkbox" data-set="showHelp"></label>
          <label class="menu-row"><span>Legende und Entwickler-Infos</span><input type="checkbox" data-set="showDebug"></label>
        </section>
        <div class="menu-footer">
          <button type="button" class="menu-btn danger" data-act="new">Neues Spiel</button>
          <button type="button" class="menu-btn" data-act="editor">Szenario-Editor <small>F4</small></button>
          <button type="button" class="menu-btn" data-act="close">Weiter spielen <small>Esc</small></button>
        </div>
      </div>`;
    this.el.querySelector<HTMLElement>('.menu-board')!.style.backgroundImage = `url(${woodBar})`;
    document.body.appendChild(this.el);

    // Klick neben die Tafel schließt das Menü.
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'pause') this.hooks.togglePause();
      if (act === 'sound') this.hooks.toggleSound();
      if (act === 'close') this.close();
      if (act === 'editor') {
        this.close();
        this.hooks.openEditor();
      }
      if (act === 'new' && window.confirm('Neues Spiel beginnen? Der jetzige Stand geht verloren.')) {
        this.hooks.newGame();
        this.close();
      }
      if (button.parentElement?.dataset.set === 'speed') this.change({ speed: Number(button.dataset.value) });
      if (button.dataset.color) this.change({ playerColor: button.dataset.color });
      this.refresh();
    });
    this.el.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      const key = input.dataset.set as keyof Settings | undefined;
      if (key === 'volume') this.change({ volume: Number(input.value) / 100 });
      if (key === 'scroll') this.change({ scroll: Number(input.value) / 100 });
      if (key === 'showHelp' || key === 'showDebug') this.change({ [key]: input.checked });
    });
    this.refresh();
  }

  isOpen(): boolean {
    return this.opened;
  }

  open() {
    this.opened = true;
    this.el.hidden = false;
    this.refresh();
  }

  close() {
    this.opened = false;
    this.el.hidden = true;
  }

  toggle() {
    if (this.opened) this.close();
    else this.open();
  }

  /** Zustände neu anzeigen, die sich auch von außen ändern (Pause, Ton). */
  refresh() {
    const s = this.settings;
    const q = <T extends Element>(sel: string) => this.el.querySelector<T>(sel)!;
    q<HTMLButtonElement>('[data-act="pause"]').textContent = this.hooks.paused() ? 'Fortsetzen' : 'Anhalten';
    q<HTMLButtonElement>('[data-act="sound"]').textContent = this.hooks.soundEnabled() ? 'An' : 'Aus';
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-set="speed"] button')) {
      b.classList.toggle('active', Number(b.dataset.value) === s.speed);
    }
    q<HTMLInputElement>('[data-set="volume"]').value = String(Math.round(s.volume * 100));
    q<HTMLOutputElement>('[data-out="volume"]').textContent = `${Math.round(s.volume * 100)} %`;
    q<HTMLInputElement>('[data-set="scroll"]').value = String(Math.round(s.scroll * 100));
    q<HTMLOutputElement>('[data-out="scroll"]').textContent = `${Math.round(s.scroll * 100)} %`;
    q<HTMLInputElement>('[data-set="showHelp"]').checked = s.showHelp;
    q<HTMLInputElement>('[data-set="showDebug"]').checked = s.showDebug;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-color]')) {
      b.classList.toggle('active', b.dataset.color === s.playerColor);
    }
  }

  private change(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    saveSettings(this.settings);
    this.hooks.apply(this.settings);
    this.refresh();
  }
}
