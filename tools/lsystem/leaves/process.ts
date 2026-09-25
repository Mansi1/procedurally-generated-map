// Bildbearbeitung für die Blätter - läuft im Browser (Canvas), fetch.ts ruft sie
// über playwright auf. playwright schickt nur den Quelltext einer Funktion in die
// Seite; deshalb steckt alles in installLeafTools, das einmal window.leafTools
// anlegt: processLeaf (Foto freistellen) und composeCard (Blattebene zusammensetzen).

export interface ProcessInput {
  /** Das Foto als data:-URL. */
  readonly image: string;
  readonly rotate: number;
  readonly tolerance: number;
  /** Anteil, der je Seite abgeschnitten wird: oben, rechts, unten, links. */
  readonly crop: readonly [number, number, number, number];
  /** Höhe der Textur in Pixeln. */
  readonly size: number;
}

export interface CardInput {
  /** Das freigestellte Blatt (processLeaf) als data:-URL, Stiel unten. */
  readonly leaf: string;
  /** Ränder des Blattes in Blattlängen vom Stiel (wie LeafData.x0/x1). */
  readonly x0: number;
  readonly x1: number;
  /** Blätter am Zweig, ohne das an der Spitze. */
  readonly count: number;
  readonly seed: number;
  readonly size: number;
}

export interface LeafImage {
  /** PNG mit Alpha als data:-URL. */
  readonly color: string;
  /** Dieselbe Form in Graustufen (Mittelwert 0.8), zum Einfärben. */
  readonly grey: string;
  /** Umriss, x und y in Höhen des Bildes: Stiel bei (0, 0), oben bei y = 1, gegen den Uhrzeigersinn. */
  readonly outline: [number, number][];
  /** Ränder des Bildes in denselben Einheiten, links und rechts vom Stiel. */
  readonly x0: number;
  readonly x1: number;
  /** Durchschnittsfarbe, 0..1. */
  readonly average: [number, number, number];
}

export interface LeafTools {
  processLeaf(input: ProcessInput): Promise<LeafImage>;
  composeCard(input: CardInput): Promise<LeafImage>;
}

declare global {
  interface Window {
    leafTools?: LeafTools;
  }
}

export function installLeafTools(): void {
  const context = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!;
  const canvas = (w: number, h: number) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const load = async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  };

  /** Umriss der Alpha-Maske: Moore-Nachbarschaft entlang des Randes, dann Douglas-Peucker. */
  function trace(inside: (x: number, y: number) => boolean, W: number, H: number): [number, number][] {
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    let start: [number, number] = [0, 0];
    find: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) { start = [x, y]; break find; }
    const path: [number, number][] = [start];
    let cur = start, back = 4;
    for (let guard = 0; guard < W * H * 4; guard++) {
      let next: [number, number] | null = null;
      for (let k = 1; k <= 8; k++) {
        const dir = (back + k) % 8;
        const cand: [number, number] = [cur[0] + dirs[dir][0], cur[1] + dirs[dir][1]];
        if (!inside(cand[0], cand[1])) continue;
        next = cand;
        // Neue Rückblick-Richtung: vom neuen Punkt zum zuletzt geprüften (leeren) Nachbarn.
        const prev = dirs[(dir + 7) % 8];
        const dx = cur[0] + prev[0] - cand[0], dy = cur[1] + prev[1] - cand[1];
        back = dirs.findIndex(([ex, ey]) => ex === dx && ey === dy);
        break;
      }
      if (!next || (next[0] === start[0] && next[1] === start[1])) break;
      path.push(next);
      cur = next;
    }
    const simplify = (pts: [number, number][], eps: number): [number, number][] => {
      if (pts.length < 3) return pts;
      const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      let worst = 0, index = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const dist = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / len;
        if (dist > worst) { worst = dist; index = i; }
      }
      if (worst <= eps) return [pts[0], pts[pts.length - 1]];
      return [...simplify(pts.slice(0, index + 1), eps).slice(0, -1), ...simplify(pts.slice(index), eps)];
    };
    // Geschlossen vereinfachen: am weitesten vom Start entfernten Punkt teilen.
    let far = 0;
    const d0 = (i: number) => Math.hypot(path[i][0] - start[0], path[i][1] - start[1]);
    path.forEach((_, i) => { if (d0(i) > d0(far)) far = i; });
    const eps = Math.max(W, H) * 0.012;
    return [...simplify(path.slice(0, far + 1), eps).slice(0, -1), ...simplify([...path.slice(far), start], eps).slice(0, -1)];
  }

  /** Auf die Form zuschneiden, auf `size` Höhe bringen; dazu Graufassung, Farbe und Umriss. */
  function finish(src: HTMLCanvasElement, size: number): LeafImage {
    const sd = context(src).getImageData(0, 0, src.width, src.height).data;
    let bx0 = src.width, bx1 = 0, by0 = src.height, by1 = 0;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      if (sd[(y * src.width + x) * 4 + 3] < 128) continue;
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    }
    const OW = Math.max(1, Math.round(((bx1 - bx0 + 1) * size) / (by1 - by0 + 1))), OH = size;
    const out = canvas(OW, OH);
    const octx = context(out);
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(src, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, 0, 0, OW, OH);
    const o = octx.getImageData(0, 0, OW, OH);
    const od = o.data;
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < OW && y < OH && od[(y * OW + x) * 4 + 3] >= 128;
    // Für den Umriss um 2 Pixel geweitet: dünne Stiele und Zweige halten so alle Blätter
    // einer Blattebene zusammen, und der Umriss umfasst die ganze Ebene.
    const grown = new Uint8Array(OW * OH);
    for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
      if (od[(y * OW + x) * 4 + 3] < 64) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < OW && Y < OH) grown[Y * OW + X] = 1;
      }
    }
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < OW && y < OH && grown[y * OW + x] === 1;

    let r = 0, g = 0, b = 0, lum = 0, n = 0;
    for (let i = 0; i < OW * OH; i++) {
      if (od[i * 4 + 3] < 128) continue;
      r += od[i * 4]; g += od[i * 4 + 1]; b += od[i * 4 + 2];
      lum += 0.3 * od[i * 4] + 0.59 * od[i * 4 + 1] + 0.11 * od[i * 4 + 2];
      n++;
    }
    const color = out.toDataURL('image/png');
    const lift = (0.8 * 255) / (lum / n);
    for (let i = 0; i < OW * OH; i++) {
      const l = Math.min(255, (0.3 * od[i * 4] + 0.59 * od[i * 4 + 1] + 0.11 * od[i * 4 + 2]) * lift);
      od[i * 4] = od[i * 4 + 1] = od[i * 4 + 2] = l;
    }
    octx.putImageData(o, 0, 0);
    const grey = out.toDataURL('image/png');

    // Stiel = Mitte der untersten Bildzeile; in Bildhöhen umrechnen, y nach oben.
    let sum = 0, count = 0;
    for (let x = 0; x < OW; x++) if (opaque(x, OH - 1)) { sum += x; count++; }
    const baseX = count ? sum / count : OW / 2;
    const outline = trace(inside, OW, OH).map(([x, y]): [number, number] => [(x - baseX) / OH, (OH - y) / OH]);
    const area = outline.reduce((s, [x, y], i) => { const [nx, ny] = outline[(i + 1) % outline.length]; return s + x * ny - nx * y; }, 0);
    if (area < 0) outline.reverse();
    return { color, grey, outline, x0: -baseX / OH, x1: (OW - baseX) / OH, average: [r / n / 255, g / n / 255, b / n / 255] };
  }

  async function processLeaf({ image, rotate, tolerance, crop, size }: ProcessInput): Promise<LeafImage> {
    const img = await load(image);
    const [ct, cr, cb, cl] = crop;
    const cx = Math.round(img.naturalWidth * cl), cy = Math.round(img.naturalHeight * ct);
    const W = Math.round(img.naturalWidth * (1 - cl - cr)), H = Math.round(img.naturalHeight * (1 - ct - cb));
    const src = canvas(W, H);
    const sctx = context(src);
    sctx.drawImage(img, cx, cy, W, H, 0, 0, W, H);
    const px = sctx.getImageData(0, 0, W, H);
    const d = px.data;

    // Hintergrundfarbe: Median der Randpixel.
    const border: number[][] = [[], [], []];
    const sample = (i: number) => { for (let c = 0; c < 3; c++) border[c].push(d[i * 4 + c]); };
    for (let x = 0; x < W; x++) { sample(x); sample((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { sample(y * W); sample(y * W + W - 1); }
    const bg = border.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
    const isBg = (i: number) => d[i * 4 + 3] < 128
      || Math.hypot(d[i * 4] - bg[0], d[i * 4 + 1] - bg[1], d[i * 4 + 2] - bg[2]) < tolerance;

    // Hintergrund = vom Rand aus erreichbar; helle Stellen im Blatt bleiben so erhalten.
    const background = new Uint8Array(W * H);
    const stack: number[] = [];
    const seed = (i: number) => { if (!background[i] && isBg(i)) { background[i] = 1; stack.push(i); } };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    while (stack.length) {
      const i = stack.pop()!, x = i % W;
      if (x > 0) seed(i - 1);
      if (x < W - 1) seed(i + 1);
      if (i >= W) seed(i - W);
      if (i < W * (H - 1)) seed(i + W);
    }

    // Größtes zusammenhängendes Stück behalten - Maßstab, Beschriftung, weitere Blätter fallen weg.
    const label = new Int32Array(W * H).fill(-1);
    let best = -1, bestSize = 0;
    for (let start = 0; start < W * H; start++) {
      if (background[start] || label[start] >= 0) continue;
      let count = 0;
      label[start] = start;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!, x = i % W;
        count++;
        for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
          if (n >= 0 && n < W * H && !background[n] && label[n] < 0) { label[n] = start; stack.push(n); }
        }
      }
      if (count > bestSize) { bestSize = count; best = start; }
    }
    for (let i = 0; i < W * H; i++) d[i * 4 + 3] = label[i] === best ? 255 : 0;
    sctx.putImageData(px, 0, 0);

    // Drehen, bis der Stiel unten ist.
    const a = (rotate * Math.PI) / 180;
    const rot = canvas(
      Math.ceil(Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))),
      Math.ceil(Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a))),
    );
    const rctx = context(rot);
    rctx.translate(rot.width / 2, rot.height / 2);
    rctx.rotate(a);
    rctx.drawImage(src, -W / 2, -H / 2);
    return finish(rot, size);
  }

  /**
   * Blattebene: ein leicht gebogener Zweig, daran `count` Blätter wechselständig
   * in wechselnden Winkeln und Größen, eines an der Spitze.
   */
  async function composeCard({ leaf, x0, x1, count, seed, size }: CardInput): Promise<LeafImage> {
    const img = await load(leaf);
    let s = seed >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const S = 1600, twig = 1000;
    const c = canvas(S, S);
    const ctx = context(c);
    // Zweig als quadratische Kurve vom Fuß (unten Mitte) nach oben, leicht zur Seite.
    const foot = [S / 2, S - 20], tip = [S / 2 + (rnd() - 0.5) * 160, S - 20 - twig];
    const ctrl = [S / 2 + (rnd() - 0.5) * 200, S - 20 - twig / 2];
    const at = (t: number) => [0, 1].map((k) => (1 - t) ** 2 * foot[k] + 2 * (1 - t) * t * ctrl[k] + t * t * tip[k]);
    const heading = (t: number) => {
      const dx = 2 * (1 - t) * (ctrl[0] - foot[0]) + 2 * t * (tip[0] - ctrl[0]);
      const dy = 2 * (1 - t) * (ctrl[1] - foot[1]) + 2 * t * (tip[1] - ctrl[1]);
      return Math.atan2(dx, -dy);
    };
    ctx.strokeStyle = 'rgb(96, 72, 46)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(foot[0], foot[1]);
    ctx.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]);
    ctx.stroke();
    // Breite Blätter (gefiedert, gefingert) etwas kleiner, damit die Ebene nicht zu breit wird.
    const base = twig * 0.5 * Math.min(1, 0.7 / Math.max(0.35, x1 - x0));
    const draw = (t: number, angle: number, length: number) => {
      const [px, py] = at(t);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(heading(t) + angle);
      ctx.drawImage(img, x0 * length, -length, (x1 - x0) * length, length);
      ctx.restore();
    };
    for (let i = 0; i < count; i++) {
      const t = 0.2 + (0.62 * i) / Math.max(1, count - 1);
      const side = i % 2 ? 1 : -1;
      draw(t, side * (0.65 + rnd() * 0.35), base * (0.8 + rnd() * 0.35) * (1.1 - 0.35 * t));
    }
    draw(1, (rnd() - 0.5) * 0.3, base * 0.85);
    return finish(c, size);
  }

  window.leafTools = { processLeaf, composeCard };
}
