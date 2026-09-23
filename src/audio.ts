// audio.ts
// Geräusche, erzeugt statt abgespielt: jeder Ton entsteht mit der Web Audio
// API aus Rauschen und Oszillatoren. Das spart Dateien und Lizenzfragen, und
// jeder Axthieb klingt ein wenig anders.
//
// Browser erlauben Ton erst nach einer Nutzeraktion - der AudioContext wird
// darum beim ersten Klick oder Tastendruck angelegt.

export type SoundName =
  | 'chop' // Axthieb
  | 'pick' // Spitzhacke auf Stein oder Gold
  | 'rustle' // Beeren pflücken
  | 'treeFall' // Baum knarrt und schlägt auf
  | 'deliver' // Ladung abgeliefert
  | 'place' // Gebäude gesetzt
  | 'trained' // Dorfbewohner fertig ausgebildet
  | 'click' // Auswahl, Befehl
  | 'error'; // geht nicht

const STORAGE_KEY = 'pgm.sound';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  /** Zeitpunkte der zuletzt gespielten Töne - begrenzt, wie viele gleichzeitig laufen. */
  private recent: number[] = [];

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === 'off';
    } catch {
      // Ohne Speicher eben mit Ton.
    }
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get enabled(): boolean {
    return !this.muted;
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? 'off' : 'on');
    } catch {
      // egal
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return !this.muted;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    // Leichte Kompression: viele gleichzeitige Axthiebe sollen nicht übersteuern.
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 4;
    this.master.connect(compressor).connect(this.ctx.destination);

    // Eine Sekunde weißes Rauschen - Grundstoff für alles, was kein Ton ist.
    const length = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  /**
   * Spielt ein Geräusch.
   * @param volume 0..1, z. B. nach Entfernung zur Bildmitte
   * @param pan -1 links .. 1 rechts
   */
  play(name: SoundName, volume = 1, pan = 0) {
    if (this.muted || volume <= 0.01) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running' || !this.master) return;

    // Höchstens 12 Geräusche je Viertelsekunde - eine Holzfäller-Kolonne
    // soll nach Arbeit klingen, nicht nach Maschinengewehr.
    const now = ctx.currentTime;
    this.recent = this.recent.filter((t) => now - t < 0.25);
    if (this.recent.length >= 12) return;
    this.recent.push(now);

    const out = ctx.createGain();
    out.gain.value = volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(this.master);

    // Etwas Zufall in Tonhöhe und Lautstärke, damit sich nichts wiederholt.
    const vary = 0.9 + Math.random() * 0.2;
    SOUNDS[name](ctx, out, now, vary, this.noise!);
  }
}

type Synth = (ctx: AudioContext, out: AudioNode, t: number, vary: number, noise: AudioBuffer) => void;

/** Hüllkurve: schnell an, exponentiell aus. */
function envelope(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

/** Gefiltertes Rauschen. */
function noiseBurst(
    ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number,
    type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter).connect(envelope(ctx, out, t, peak, attack, decay));
  // Zufälliger Einstieg ins Rauschen - sonst klingt jeder Schlag gleich.
  src.start(t, Math.random() * 0.8);
  src.stop(t + attack + decay + 0.05);
}

/** Ton mit Tonhöhenverlauf. */
function tone(
    ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType,
    from: number, to: number, peak: number, attack: number, decay: number,
) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + attack + decay);
  osc.connect(envelope(ctx, out, t, peak, attack, decay));
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

const SOUNDS: Record<SoundName, Synth> = {
  chop: (ctx, out, t, v, noise) => {
    // Holziger Schlag: Knack im Mittenbereich plus dumpfer Körper.
    noiseBurst(ctx, out, noise, t, 'bandpass', 1400 * v, 2.5, 0.9, 0.002, 0.07);
    tone(ctx, out, t, 'triangle', 180 * v, 90, 0.6, 0.003, 0.12);
  },
  pick: (ctx, out, t, v, noise) => {
    // Metall auf Stein: heller Klick und ein kurz klingender Oberton.
    noiseBurst(ctx, out, noise, t, 'highpass', 3000, 0.7, 0.5, 0.001, 0.04);
    tone(ctx, out, t, 'sine', 2600 * v, 2500 * v, 0.25, 0.001, 0.18);
    tone(ctx, out, t, 'sine', 3900 * v, 3800 * v, 0.12, 0.001, 0.12);
  },
  rustle: (ctx, out, t, v, noise) => {
    // Blätterrascheln: weiches, hohes Rauschen.
    noiseBurst(ctx, out, noise, t, 'highpass', 2500 * v, 0.5, 0.25, 0.03, 0.14);
  },
  treeFall: (ctx, out, t, v, noise) => {
    // Erst das Knarren des brechenden Stamms ...
    const creak = ctx.createOscillator();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(140 * v, t);
    creak.frequency.linearRampToValueAtTime(70 * v, t + 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.18, t + 0.15);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    creak.connect(lp).connect(cg).connect(out);
    creak.start(t);
    creak.stop(t + 0.85);
    // ... dann der Aufschlag, passend zur Fallanimation nach gut einer Sekunde.
    const hit = t + 1.05;
    noiseBurst(ctx, out, noise, hit, 'lowpass', 500, 0.8, 1.0, 0.005, 0.7);
    tone(ctx, out, hit, 'sine', 70, 40, 0.8, 0.005, 0.4);
    noiseBurst(ctx, out, noise, hit + 0.02, 'bandpass', 2500, 1, 0.25, 0.01, 0.35); // Zweige
  },
  deliver: (ctx, out, t, v) => {
    // Sanftes Plopp beim Abladen.
    tone(ctx, out, t, 'sine', 420 * v, 260 * v, 0.35, 0.005, 0.12);
  },
  place: (ctx, out, t, v, noise) => {
    // Schwerer Holzbalken, der aufsetzt.
    tone(ctx, out, t, 'sine', 110 * v, 55, 0.9, 0.004, 0.3);
    noiseBurst(ctx, out, noise, t, 'lowpass', 900, 0.7, 0.5, 0.003, 0.18);
  },
  trained: (ctx, out, t) => {
    // Zwei Töne aufwärts: "fertig".
    tone(ctx, out, t, 'triangle', 523, 523, 0.3, 0.01, 0.25);
    tone(ctx, out, t + 0.12, 'triangle', 784, 784, 0.3, 0.01, 0.35);
  },
  click: (ctx, out, t, v) => {
    tone(ctx, out, t, 'sine', 1100 * v, 800 * v, 0.2, 0.001, 0.05);
  },
  error: (ctx, out, t) => {
    tone(ctx, out, t, 'square', 150, 140, 0.15, 0.005, 0.18);
    tone(ctx, out, t + 0.12, 'square', 120, 110, 0.15, 0.005, 0.2);
  },
};
