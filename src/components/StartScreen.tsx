// StartScreen.tsx
// Hauptmenü beim Öffnen der Seite, wie bei einem Spiel: Logo und die Wahl
// zwischen Einzelspieler, Mehrspieler (noch nicht da), Einstellungen und
// Galerie. Dahinter zieht langsam die Welt vorbei; das Spiel selbst steht,
// bis man unter Einzelspieler weiterspielt oder neu beginnt.

import { render } from 'defuss';
import './StartScreen.css';
import woodBar from '../icons/wood-bar.png';

/** Was das Hauptmenü braucht - main.ts liefert es. */
export interface StartHooks {
  /** Gibt es einen Spielstand zum Weiterspielen? */
  hasSave(): boolean;
  /** Name der Welt (Seed) - steht unten auf der Tafel. */
  world: string;
  /** Mit dem Spielstand weiterspielen. */
  continueGame(): void;
  /** Spielstand verwerfen und neu beginnen. */
  newGame(): void;
  /** Das Einstellungsmenü öffnen. */
  openSettings(): void;
}

type Page = 'main' | 'single';

function StartButton({ label, hint, onClick, disabled }: {
  label: string; hint?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" class="start-btn" disabled={disabled} onClick={onClick}>
      {label}
      {hint ? <small>{hint}</small> : null}
    </button>
  );
}

export class StartScreen {
  private root: HTMLDivElement;
  private opened = false;

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
        ) : (
          <nav class="start-list">
            <div class="start-title">Einzelspieler</div>
            {save ? <StartButton label="Weiterspielen" onClick={() => this.play(() => h.continueGame())} /> : null}
            <StartButton label="Neues Spiel" onClick={() => this.newGame(save)} />
            <StartButton label="Zurück" onClick={() => this.show('main')} />
          </nav>
        )}
        <div class="start-footer">Welt <b>{h.world}</b></div>
      </div>,
      this.root,
    );
  }

  private newGame(save: boolean) {
    if (save && !window.confirm('Neues Spiel beginnen? Der jetzige Stand geht verloren.')) return;
    this.play(() => this.hooks.newGame());
  }

  private play(start: () => void) {
    this.close();
    start();
  }

  isOpen(): boolean {
    return this.opened;
  }

  open() {
    this.opened = true;
    this.root.hidden = false;
    document.body.classList.add('title-screen');
    this.show('main');
  }

  close() {
    this.opened = false;
    this.root.hidden = true;
    document.body.classList.remove('title-screen');
  }
}
