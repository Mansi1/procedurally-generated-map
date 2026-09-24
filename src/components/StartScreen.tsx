// StartScreen.tsx
// Hauptmenü beim Öffnen der Seite, wie bei einem Spiel: Logo und die Wahl
// zwischen Einzelspieler, Mehrspieler (noch nicht da), Einstellungen und
// Galerie. Dahinter zieht langsam die Welt vorbei; das Spiel selbst steht,
// bis man unter Einzelspieler weiterspielt oder neu beginnt - für ein neues
// Spiel fragt es nach der Welt (Seed).

import { createRef, render } from 'defuss';
import './StartScreen.css';
import woodBar from '../icons/wood-bar.png';
import { DEFAULT_SEED, hasProgress, randomSeed } from '../worlds';

/** Was das Hauptmenü braucht - main.ts liefert es. */
export interface StartHooks {
  /** Gibt es einen Spielstand zum Weiterspielen? */
  hasSave(): boolean;
  /** Name der Welt (Seed) - steht unten auf der Tafel. */
  world: string;
  /** Mit dem Spielstand weiterspielen. */
  continueGame(): void;
  /** Neues Spiel in der Welt `seed` - ein vorhandener Spielstand dort geht verloren. */
  newGame(seed: string): void;
  /** Das Einstellungsmenü öffnen. */
  openSettings(): void;
}

type Page = 'main' | 'single' | 'new';

function StartButton({ label, hint, onClick, disabled, submit }: {
  label: string; hint?: string; onClick?: () => void; disabled?: boolean; submit?: boolean;
}) {
  return (
    <button type={submit ? 'submit' : 'button'} class="start-btn" disabled={disabled} onClick={onClick}>
      {label}
      {hint ? <small>{hint}</small> : null}
    </button>
  );
}

export class StartScreen {
  private root: HTMLDivElement;
  private opened = false;
  private seedInput = createRef<HTMLInputElement>();
  /** Wohin "Zurück" auf der Seite "Neues Spiel" führt - ins Spiel-Menü geöffnet: zum Hauptmenü. */
  private back: Page = 'single';

  constructor(private hooks: StartHooks) {
    this.root = document.createElement('div');
    this.root.id = 'start';
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  private show(page: Page) {
    const h = this.hooks;
    const save = h.hasSave();
    // Neu aufbauen statt abgleichen: sonst erbte "Zurück" an zweiter Stelle
    // das disabled von "Mehrspieler".
    this.root.replaceChildren();
    if (page !== 'new') this.back = page;
    render(
      <div class="start-board" style={`background-image:url(${woodBar})`}>
        <img class="start-logo" src="/logo.svg" alt="Soliva" />
        {page === 'main' ? (
          <nav class="start-list">
            <StartButton label="Einzelspieler" onClick={() => this.show('single')} />
            <StartButton label="Mehrspieler" hint="bald" disabled />
            <StartButton label="Einstellungen" onClick={() => h.openSettings()} />
            <StartButton label="Galerie" hint="alle Modelle" onClick={() => window.location.assign('/galerie')} />
          </nav>
        ) : page === 'single' ? (
          <nav class="start-list">
            <div class="start-title">Einzelspieler</div>
            {save ? <StartButton label="Weiterspielen" onClick={() => this.play(() => h.continueGame())} /> : null}
            <StartButton label="Neues Spiel" onClick={() => this.show('new')} />
            <StartButton label="Zurück" onClick={() => this.show('main')} />
          </nav>
        ) : (
          <form class="start-list" onSubmit={(e: Event) => { e.preventDefault(); this.newGame(); }}>
            <div class="start-title">Neues Spiel</div>
            <label class="start-field">
              <span>Welt (Seed)</span>
              <span class="start-seed">
                <input ref={this.seedInput} type="text" value={h.world} maxLength={40} spellcheck={false}
                  autocomplete="off" placeholder={DEFAULT_SEED} />
                <button type="button" class="start-dice" title="Zufällige Welt"
                  onClick={() => { this.seedInput.current.value = randomSeed(); }}>🎲</button>
              </span>
              <small>Gleicher Name, gleiche Welt - teile ihn mit Freunden.</small>
            </label>
            <StartButton label="Los geht's" submit />
            <StartButton label="Zurück" onClick={() => this.show(this.back)} />
          </form>
        )}
        <div class="start-footer">Welt <b>{h.world}</b></div>
      </div>,
      this.root,
    );
    if (page === 'new') this.seedInput.current.select();
  }

  private newGame() {
    const seed = this.seedInput.current.value.trim() || DEFAULT_SEED;
    if (hasProgress(seed) && !window.confirm(`Die Welt "${seed}" hat schon einen Spielstand. Neu beginnen? Er geht verloren.`)) return;
    this.play(() => this.hooks.newGame(seed));
  }

  private play(start: () => void) {
    this.close();
    start();
  }

  isOpen(): boolean {
    return this.opened;
  }

  /** @param page 'new' springt gleich zur Wahl der Welt (Neues Spiel aus dem Spiel-Menü). */
  open(page: Page = 'main') {
    this.opened = true;
    this.root.hidden = false;
    document.body.classList.add('title-screen');
    if (page === 'new') this.back = 'main';
    this.show(page);
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
    document.body.classList.remove('title-screen');
  }
}
