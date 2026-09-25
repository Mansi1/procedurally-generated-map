// ConfirmDialog.tsx
// Rückfrage im Stil des Spiels statt window.confirm: ein Holzschild über
// allem mit Frage, "Ja" und "Abbrechen". Enter bestätigt, Esc bricht ab.
// Gibt ein Promise zurück - true, wenn bestätigt.

import { render } from 'defuss';
import './ConfirmDialog.css';
import woodBar from '../icons/wood-bar.png';

export interface ConfirmOptions {
  /** Text des Bestätigen-Knopfs (Vorgabe: "Ja"). */
  ok?: string;
  /** Rot, weil etwas verloren geht (Löschen, Überschreiben). */
  danger?: boolean;
}

export function confirmDialog(question: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'confirm';
    document.body.appendChild(root);

    const done = (answer: boolean) => {
      window.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(answer);
    };
    // Vor allen anderen Tasten-Handlern (capture) - Esc schließt sonst auch das Menü dahinter.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done(e.key === 'Enter');
      } else {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    // Klick neben das Schild bricht ab.
    root.addEventListener('mousedown', (e) => {
      if (e.target === root) done(false);
    });

    render(
      <div class="confirm-board" role="alertdialog" aria-label={question} style={`background-image:url(${woodBar})`}>
        <p class="confirm-question">{question}</p>
        <div class="confirm-buttons">
          <button type="button" class="wood-btn confirm-btn" onClick={() => done(false)}>Abbrechen</button>
          <button type="button" class={options.danger ? 'wood-btn confirm-btn confirm-ok danger' : 'wood-btn confirm-btn confirm-ok gold'}
            onClick={() => done(true)}>{options.ok ?? 'Ja'}</button>
        </div>
      </div>,
      root,
    );
    root.querySelector<HTMLButtonElement>('.confirm-ok')?.focus();
  });
}
