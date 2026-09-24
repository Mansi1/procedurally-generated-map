// SettingsMenu.tsx
// Menü als Holztafel in der Bildmitte (Zahnrad an der Rohstoffleiste oder
// F10, wie in AoE2): Spielerfarbe, Pause, Tempo, Ton und Musik, Kamera-Tempo,
// Anzeigen, neues Spiel. Einmal gerendert; refresh() setzt über Refs, was sich
// auch von außen ändert (Pause, Ton, laufendes Musikstück).

import { createRef, render, type Ref } from 'defuss';
import './SettingsMenu.css';
import woodBar from '../icons/wood-bar.png';
import { PLAYER_COLORS } from '../world/buildings';
import { resetSettings, saveSettings, type Settings } from '../settings';
import { ShortcutList } from './Shortcuts';

/** Was das Menü außer den Einstellungen braucht - main.ts liefert es. */
export interface MenuHooks {
  /** Nach jeder Änderung: Einstellungen anwenden. */
  apply(s: Settings): void;
  soundEnabled(): boolean;
  toggleSound(): void;
  paused(): boolean;
  togglePause(): void;
  /** Titel des Musikstücks, das gerade läuft, oder null. */
  musicTitle(): string | null;
  nextTrack(): void;
  newGame(): void;
}

const SPEEDS: [number, string][] = [[1, 'Normal'], [1.5, 'Schnell'], [2, 'Sehr schnell']];

/** Regler 0..100 % mit der Zahl daneben. */
interface SliderRefs {
  input: Ref<HTMLInputElement>;
  output: Ref<HTMLOutputElement>;
}

const sliderRefs = (): SliderRefs => ({ input: createRef(), output: createRef() });

function Slider({ refs, min, max, step, onInput }: {
  refs: SliderRefs; min: number; max: number; step: number; onInput: (value: number) => void;
}) {
  return (
    <>
      <input type="range" min={String(min)} max={String(max)} step={String(step)} ref={refs.input}
        onInput={(e: Event) => onInput(Number((e.target as HTMLInputElement).value) / 100)} />
      <output ref={refs.output} />
    </>
  );
}

export class SettingsMenu {
  private root: HTMLDivElement;
  private opened = false;
  private pauseButton = createRef<HTMLButtonElement>();
  private soundButton = createRef<HTMLButtonElement>();
  private speedButtons = SPEEDS.map(() => createRef<HTMLButtonElement>());
  private colorButtons = new Map(Object.keys(PLAYER_COLORS).map((key) => [key, createRef<HTMLButtonElement>()]));
  private volume = sliderRefs();
  private music = sliderRefs();
  private scroll = sliderRefs();
  private track = createRef<HTMLSpanElement>();
  private showHelp = createRef<HTMLInputElement>();
  private showDebug = createRef<HTMLInputElement>();
  /** Nur im Spiel: Pause, Neues Spiel, Weiter spielen - aus dem Hauptmenü heraus stattdessen Zurück. */
  private pauseRow = createRef<HTMLDivElement>();
  private gameButtons = createRef<HTMLDivElement>();
  private backButton = createRef<HTMLDivElement>();
  private title = createRef<HTMLDivElement>();

  constructor(private settings: Settings, private hooks: MenuHooks) {
    this.root = document.createElement('div');
    this.root.id = 'menu';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    // Klick neben die Tafel schließt das Menü.
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    render(this.board(), this.root);
    this.refresh();
  }

  private board() {
    const act = (fn: () => void) => () => {
      fn();
      this.refresh();
    };
    return (
      <div class="menu-board" role="dialog" aria-label="Menü" style={`background-image:url(${woodBar})`}>
        <img class="menu-logo" src="/logo.svg" alt="Soliva" />
        <div class="menu-title" ref={this.title}>Menü</div>
        <section>
          <h3>Spieler</h3>
          <div class="menu-row">
            <span>Farbe</span>
            <span class="menu-colors">
              {Object.entries(PLAYER_COLORS).map(([key, c]) => (
                <button type="button" title={c.label} style={`background:${c.color.toRgbString()}`}
                  ref={this.colorButtons.get(key)!} onClick={() => this.change({ playerColor: key })} />
              ))}
            </span>
          </div>
        </section>
        <section>
          <h3>Spiel</h3>
          <div class="menu-row" ref={this.pauseRow}>
            <span>Pause <small>F3</small></span>
            <button type="button" class="menu-btn" ref={this.pauseButton} onClick={act(() => this.hooks.togglePause())} />
          </div>
          <div class="menu-row">
            <span>Geschwindigkeit</span>
            <span class="menu-choice">
              {SPEEDS.map(([value, label], i) => (
                <button type="button" ref={this.speedButtons[i]} onClick={() => this.change({ speed: value })}>{label}</button>
              ))}
            </span>
          </div>
        </section>
        <section>
          <h3>Ton</h3>
          <div class="menu-row">
            <span>Ton <small>M</small></span>
            <button type="button" class="menu-btn" ref={this.soundButton} onClick={act(() => this.hooks.toggleSound())} />
          </div>
          <div class="menu-row">
            <span>Lautstärke</span>
            <Slider refs={this.volume} min={0} max={100} step={5} onInput={(v) => this.change({ volume: v })} />
          </div>
          <div class="menu-row">
            <span>Musik</span>
            <Slider refs={this.music} min={0} max={100} step={5} onInput={(v) => this.change({ music: v })} />
          </div>
          <div class="menu-row">
            <span class="menu-track" ref={this.track} />
            <button type="button" class="menu-btn" onClick={act(() => this.hooks.nextTrack())}>Nächstes Stück</button>
          </div>
        </section>
        <section>
          <h3>Steuerung</h3>
          <div class="menu-row">
            <span>Kamera-Tempo</span>
            <Slider refs={this.scroll} min={50} max={200} step={10} onInput={(v) => this.change({ scroll: v })} />
          </div>
          <details class="menu-keys-box">
            <summary>Tastenkürzel</summary>
            <ShortcutList />
          </details>
        </section>
        <section>
          <h3>Anzeige</h3>
          <label class="menu-row">
            <span>Tastenhilfe</span>
            <input type="checkbox" ref={this.showHelp}
              onInput={(e: Event) => this.change({ showHelp: (e.target as HTMLInputElement).checked })} />
          </label>
          <label class="menu-row">
            <span>Legende und Entwickler-Infos</span>
            <input type="checkbox" ref={this.showDebug}
              onInput={(e: Event) => this.change({ showDebug: (e.target as HTMLInputElement).checked })} />
          </label>
        </section>
        <section>
          <div class="menu-row">
            <span>Alle Einstellungen</span>
            <button type="button" class="menu-btn" onClick={() => this.reset()}>Zurücksetzen</button>
          </div>
        </section>
        <div class="menu-footer" ref={this.gameButtons}>
          <button type="button" class="menu-btn danger" onClick={() => this.newGame()}>Neues Spiel</button>
          <button type="button" class="menu-btn" onClick={() => this.close()}>Weiter spielen <small>Esc</small></button>
        </div>
        <div class="menu-footer menu-footer-end" ref={this.backButton} hidden>
          <button type="button" class="menu-btn" onClick={() => this.close()}>Zurück <small>Esc</small></button>
        </div>
      </div>
    );
  }

  /** Neues Spiel: die Wahl der Welt übernimmt das Hauptmenü, auch die Rückfrage. */
  private newGame() {
    this.close();
    this.hooks.newGame();
  }

  isOpen(): boolean {
    return this.opened;
  }

  /** @param fromTitle aus dem Hauptmenü: ohne Pause, Neues Spiel und Weiter spielen - nur Zurück. */
  open(fromTitle = false) {
    this.opened = true;
    this.root.hidden = false;
    this.pauseRow.current.hidden = fromTitle;
    this.gameButtons.current.hidden = fromTitle;
    this.backButton.current.hidden = !fromTitle;
    this.title.current.textContent = fromTitle ? 'Einstellungen' : 'Menü';
    this.refresh();
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
  }

  toggle() {
    if (this.opened) this.close();
    else this.open();
  }

  /** Zustände neu anzeigen, die sich auch von außen ändern (Pause, Ton, Musik). */
  refresh() {
    const s = this.settings;
    this.pauseButton.current.textContent = this.hooks.paused() ? 'Fortsetzen' : 'Anhalten';
    this.soundButton.current.textContent = this.hooks.soundEnabled() ? 'An' : 'Aus';
    SPEEDS.forEach(([value], i) => this.speedButtons[i].current.classList.toggle('active', value === s.speed));
    for (const [key, ref] of this.colorButtons) ref.current.classList.toggle('active', key === s.playerColor);
    const slider = (refs: SliderRefs, v: number) => {
      refs.input.current.value = String(Math.round(v * 100));
      refs.output.current.textContent = `${Math.round(v * 100)} %`;
    };
    slider(this.volume, s.volume);
    slider(this.music, s.music);
    slider(this.scroll, s.scroll);
    const title = this.hooks.musicTitle();
    this.track.current.textContent = title ? `♪ ${title}` : 'Musik beginnt mit dem ersten Klick';
    this.showHelp.current.checked = s.showHelp;
    this.showDebug.current.checked = s.showDebug;
  }

  /** Alle Einstellungen auf ihre Vorgaben - nach Rückfrage. */
  private reset() {
    if (!window.confirm('Alle Einstellungen zurücksetzen?')) return;
    resetSettings(this.settings);
    this.change({});
  }

  private change(patch: Partial<Settings>) {
    Object.assign(this.settings, patch);
    saveSettings(this.settings);
    this.hooks.apply(this.settings);
    this.refresh();
  }
}
