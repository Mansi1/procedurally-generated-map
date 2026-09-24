// format.ts
// Zahlen und Zeiten für die Anzeige - von main.ts und den Komponenten genutzt.

/** Dauer als "1:35 h", "4:05 min" bzw. "40 s". */
export function formatDuration(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
  const m = Math.ceil(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
}
