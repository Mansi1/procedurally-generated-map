// Shortcuts.tsx
// Die Steuerung (game/controls.ts) als Liste - ausführlich im Menü
// (Steuerung, zum Aufklappen) und knapp in der Tastenhilfe oben rechts.
// Mausbefehle zeigen eine Maus mit der jeweiligen Taste statt "Klick".

import { CONTROLS, MOUSE_LEFT, MOUSE_RIGHT, type Control } from '../game/controls';

/** Maus mit hervorgehobener linker oder rechter Taste. */
function MouseIcon({ button }: { button: 'left' | 'right' }) {
  return (
    <svg class="key-mouse" viewBox="0 0 16 22" aria-label={button === 'left' ? 'Linke Maustaste' : 'Rechte Maustaste'}>
      <rect x="1" y="1" width="14" height="20" rx="7" fill="#f4e2bc" stroke="#1a0f07" stroke-width="1.5" />
      <path d={button === 'left' ? 'M8 1.8 A6.2 6.2 0 0 0 1.8 8 V9 H8 Z' : 'M8 1.8 A6.2 6.2 0 0 1 14.2 8 V9 H8 Z'} fill="#d9a441" />
      <path d="M1.5 9 H14.5 M8 1.5 V9" stroke="#1a0f07" stroke-width="1.2" />
    </svg>
  );
}

/** Eine Taste, eine Maus oder Text daneben. */
function Key({ k }: { k: string }) {
  if (k === MOUSE_LEFT) return <MouseIcon button="left" />;
  if (k === MOUSE_RIGHT) return <MouseIcon button="right" />;
  if (k.startsWith('~')) return <span class="key-note">{k.slice(1)}</span>;
  return <kbd>{k}</kbd>;
}

/** Die Tasten eines Kürzels mit ihren Trennzeichen. */
function Keys({ s }: { s: Control }) {
  return <>{s.label.map((k, i) => <>{i > 0 && s.sep ? s.sep : null}<Key k={k} /></>)}</>;
}

/** Ausführlich, zweispaltig: Tasten, Wirkung - fürs Menü. */
export function ShortcutList() {
  return (
    <dl class="menu-keys">
      {CONTROLS.map((s) => (
        <>
          <dt><Keys s={s} /></dt>
          <dd>{s.what}</dd>
        </>
      ))}
    </dl>
  );
}

/** Knapp, fließend: Tasten und ein Wort - für die Tastenhilfe. */
export function ShortcutLine() {
  return (
    <div class="help-keys">
      {CONTROLS.map((s) => <span class="help-key"><Keys s={s} /> {s.short}</span>)}
    </div>
  );
}
