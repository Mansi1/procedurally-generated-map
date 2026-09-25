// SaveButton.tsx
// Diskette oben links am Rahmen der Minimap - speichert sofort; ein
// Haken bestätigt es kurz.

import { createRef } from 'defuss';
import './SaveButton.css';

export interface SaveButtonProps {
  onClick: () => void;
}

export function SaveButton({ onClick }: SaveButtonProps) {
  const button = createRef<HTMLButtonElement>();
  let timer = 0;
  const save = () => {
    onClick();
    const el = button.current;
    el.classList.add('saved');
    el.title = 'Gespeichert';
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      el.classList.remove('saved');
      el.title = 'Speichern';
    }, 1500);
  };
  return (
    <button type="button" class="rb-menu rb-save" title="Speichern" ref={button} onClick={save}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {/* Diskette */}
        <path class="disk" fill="currentColor"
          d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-2zm2 2v5h9V5zm5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm2-8h1v3h-1z" fill-rule="evenodd" />
        {/* Haken nach dem Speichern */}
        <path class="check" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"
          d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}
