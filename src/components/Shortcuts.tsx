// Shortcuts.tsx
// Die Tastenkürzel des Spiels an einer Stelle - gezeigt ausführlich im Menü
// (Steuerung, zum Aufklappen) und knapp in der Tastenhilfe oben rechts.
// Mausbefehle zeigen eine Maus mit der jeweiligen Taste statt "Klick".

const MOUSE_LEFT = 'mouse:left';
const MOUSE_RIGHT = 'mouse:right';

interface Shortcut {
  /** Tasten, je eine kbd - MOUSE_LEFT/MOUSE_RIGHT zeichnen eine Maus, "~2×" ist nur Text daneben. */
  keys: string[];
  /** Was es tut - ausführlich, fürs Menü. */
  what: string;
  /** Knapp, für die Tastenhilfe. */
  short: string;
  /** Zwischen den Tasten: "+" zusammen, "/" oder "-" eine davon, sonst nebeneinander (WASD). */
  sep?: string;
}

const SHORTCUTS: Shortcut[] = [
  { keys: ['W', 'A', 'S', 'D'], what: 'Kamera bewegen (auch Pfeiltasten)', short: 'bewegen' },
  { keys: [MOUSE_RIGHT, '~ziehen'], what: 'Karte verschieben', short: 'verschieben' },
  { keys: ['Q', 'E'], what: 'Zoomen (auch Mausrad)', short: 'zoomen', sep: '/' },
  { keys: ['Leertaste'], what: 'Halten: Gelände flach', short: 'flach' },
  { keys: ['H'], what: 'Zum Hauptgebäude', short: 'Hauptgebäude' },
  { keys: [MOUSE_LEFT], what: 'Auswählen (Ziehen: Rahmen)', short: 'auswählen' },
  { keys: ['Umschalt', MOUSE_LEFT], what: 'Zur Auswahl hinzu', short: 'hinzu', sep: '+' },
  { keys: [MOUSE_LEFT, '~2×'], what: 'Gleiche Gebäude in der Nähe', short: 'gleiche' },
  { keys: ['.'], what: 'Untätige (Umschalt: einzeln)', short: 'untätige' },
  { keys: [MOUSE_RIGHT], what: 'Befehl: sammeln, jagen, bauen, gehen', short: 'Befehl' },
  { keys: ['1', '6'], what: 'Gebäude bauen', short: 'bauen', sep: '-' },
  { keys: ['V'], what: 'Dorfbewohner ausbilden (Umschalt: 5)', short: 'Dorfbewohner' },
  { keys: ['Entf'], what: 'Abreißen', short: 'abreißen' },
  { keys: ['Esc'], what: 'Abbrechen, Auswahl aufheben', short: 'abbrechen' },
  { keys: ['F3'], what: 'Pause', short: 'Pause' },
  { keys: ['F10'], what: 'Menü', short: 'Menü' },
  { keys: ['M'], what: 'Ton an/aus', short: 'Ton' },
];

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
function Keys({ s }: { s: Shortcut }) {
  return <>{s.keys.map((k, i) => <>{i > 0 && s.sep ? s.sep : null}<Key k={k} /></>)}</>;
}

/** Ausführlich, zweispaltig: Tasten, Wirkung - fürs Menü. */
export function ShortcutList() {
  return (
    <dl class="menu-keys">
      {SHORTCUTS.map((s) => (
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
      {SHORTCUTS.map((s) => <span class="help-key"><Keys s={s} /> {s.short}</span>)}
    </div>
  );
}
