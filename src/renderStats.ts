// renderStats.ts
// Kennzahlen des Zeichnens für die Diagnose: je Sekunde ein kleines Objekt,
// die letzten 30 in einem Ringpuffer. Im Browser (etwa über Playwright) mit
// `getRenderStats()` abzurufen - so lässt sich vor und nach einer Änderung
// vergleichen, woran es liegt, wenn die Bildrate sinkt.
//
// Fest dabei: t (Sekunde seit dem Start), fps (gezeichnete Bilder), frameMs
// und frameMsMax (Abstand der Bilder, Mittel und längster), cpuMs und
// cpuMsMax (Arbeit der Spielschleife je Bild). Alles aus addRenderStats wird
// über die Sekunde aufsummiert und durch die Zahl der Bilder geteilt - also
// "je Bild". Mehrere Aufrufe im selben Bild zählen zusammen (Draw-Calls).
//
// Derzeit gezählt (nur Hauptansicht, ohne Minimap):
//   simMs, collectMs, renderMs, minimapMs - Anteile von cpuMs (main.ts)
//   drawCalls, vertices - GPU-Last (gl/entityRenderer.ts, gl/terrainRenderer.ts)
//   instances, batched - Objekte einzeln je Bild gepackt / aus festen Puffern
//   billboards - Anteil der Bilder mit Bäumen als Bild (0..1)
//   terrainTexels - neu erzeugtes Gelände; hoch = Cache wird befüllt
//   tileSize, relief - Zoom (CSS-Pixel je Tile) und Reliefstärke
//   idle - Anteil der Bilder, die gedrosselt kamen (Kamera steht, 30 fps gewollt)
// Steigt frameMs, aber nicht cpuMs, wartet das Bild auf die Grafikkarte.

/** So viele Sekunden bleiben im Puffer. */
const SECONDS = 30;

export type RenderStat = Record<string, number>;

const buffer: RenderStat[] = [];
/** Summen der laufenden Sekunde - null, solange nicht gestartet (etwa in der Galerie). */
let sums: Record<string, number> | null = null;
let started = 0;
let frames = 0;
/** Abstände zwischen Bildern - der erste der Sekunde reicht über ihre Grenze zurück. */
let intervals = 0;
let lastFrame = 0;
let frameMsSum = 0;
let frameMsMax = 0;
let cpuMsSum = 0;
let cpuMsMax = 0;

/** Solange true, zählt addRenderStats nicht - etwa beim Zeichnen der Minimap. */
let muted = false;

/** Wert für `key` zur laufenden Sekunde dazuzählen. */
export function addRenderStats(key: string, value: number) {
  if (sums && !muted) sums[key] = (sums[key] ?? 0) + value;
}

/**
 * `draw` ausführen, ohne dass dessen Draw-Calls, Instanzen usw. mitzählen -
 * die Minimap läuft über dieselben Renderer, gemeint ist aber die Hauptansicht.
 */
export function withoutRenderStats(draw: () => void) {
  muted = true;
  try {
    draw();
  } finally {
    muted = false;
  }
}

/** Ein Bild wurde gezeichnet: `now` wie in requestAnimationFrame, `cpuMs` die Arbeit dafür. */
export function renderStatsFrame(now: number, cpuMs: number) {
  if (!sums) return;
  if (lastFrame > 0) {
    const ms = now - lastFrame;
    frameMsSum += ms;
    intervals++;
    frameMsMax = Math.max(frameMsMax, ms);
  }
  lastFrame = now;
  frames++;
  cpuMsSum += cpuMs;
  cpuMsMax = Math.max(cpuMsMax, cpuMs);
}

/** Die letzten bis zu 30 Sekunden, die älteste zuerst - als JSON serialisierbar. */
export function getRenderStats(): RenderStat[] {
  return buffer.map((s) => ({ ...s }));
}

/** Kleine Werte mit einer Nachkommastelle, große ganz. */
const round = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

/** Die laufende Sekunde abschließen und in den Puffer legen. */
function close() {
  if (!sums) return;
  const stat: RenderStat = {
    t: Math.round((performance.now() - started) / 1000),
    fps: frames,
    frameMs: round(intervals > 0 ? frameMsSum / intervals : 0),
    frameMsMax: round(frameMsMax),
    cpuMs: round(frames > 0 ? cpuMsSum / frames : 0),
    cpuMsMax: round(cpuMsMax),
  };
  for (const [key, sum] of Object.entries(sums)) stat[key] = round(frames > 0 ? sum / frames : sum);
  buffer.push(stat);
  if (buffer.length > SECONDS) buffer.shift();
  sums = {};
  frames = 0;
  intervals = 0;
  frameMsSum = 0;
  frameMsMax = 0;
  cpuMsSum = 0;
  cpuMsMax = 0;
}

/**
 * Sammeln starten: jede Sekunde (setInterval, unabhängig vom Zeichnen) wird
 * abgeschlossen; `getRenderStats` liegt dann auch global auf window.
 */
export function startRenderStats() {
  if (sums) return;
  sums = {};
  started = performance.now();
  setInterval(close, 1000);
  (globalThis as { getRenderStats?: typeof getRenderStats }).getRenderStats = getRenderStats;
}
