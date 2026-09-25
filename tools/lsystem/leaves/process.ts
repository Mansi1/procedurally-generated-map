// Freistellen eines Blattfotos - läuft im Browser (Canvas), fetch.ts ruft es
// über playwright auf. Die Funktion muss für sich stehen: playwright schickt
// nur ihren Quelltext in die Seite, Importe und Hilfsfunktionen von außen gibt es dort nicht.

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

export interface ProcessOutput {
  /** Freigestelltes Blatt, PNG mit Alpha, als data:-URL. */
  readonly color: string;
  /** Dieselbe Form in Graustufen (Mittelwert hell), zum Einfärben. */
  readonly grey: string;
  /** Umriss, x und y in Blattlängen: Stiel bei (0, 0), Spitze bei y = 1. */
  readonly outline: [number, number][];
  /** Ränder der Textur in denselben Einheiten, links und rechts vom Stiel. */
  readonly x0: number;
  readonly x1: number;
  /** Durchschnittsfarbe des Blattes, 0..1. */
  readonly average: [number, number, number];
}

export async function processLeaf({ image, rotate, tolerance, crop, size }: ProcessInput): Promise<ProcessOutput> {
  const img = new Image();
  img.src = image;
  await img.decode();
  const [ct, cr, cb, cl] = crop;
  const cx = Math.round(img.naturalWidth * cl), cy = Math.round(img.naturalHeight * ct);
  const W = Math.round(img.naturalWidth * (1 - cl - cr)), H = Math.round(img.naturalHeight * (1 - ct - cb));
  const src = document.createElement('canvas');
  src.width = W;
  src.height = H;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
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

  // Drehen (Stiel nach unten), dann auf das Blatt zuschneiden.
  const a = (rotate * Math.PI) / 180;
  const RW = Math.ceil(Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a)));
  const RH = Math.ceil(Math.abs(W * Math.sin(a)) + Math.abs(H * Math.cos(a)));
  const rot = document.createElement('canvas');
  rot.width = RW;
  rot.height = RH;
  const rctx = rot.getContext('2d', { willReadFrequently: true })!;
  rctx.translate(RW / 2, RH / 2);
  rctx.rotate(a);
  rctx.drawImage(src, -W / 2, -H / 2);
  const rd = rctx.getImageData(0, 0, RW, RH).data;
  let bx0 = RW, bx1 = 0, by0 = RH, by1 = 0;
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    if (rd[(y * RW + x) * 4 + 3] < 128) continue;
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
  }
  const scale = size / (by1 - by0 + 1);
  const OW = Math.max(1, Math.round((bx1 - bx0 + 1) * scale)), OH = size;
  const out = document.createElement('canvas');
  out.width = OW;
  out.height = OH;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(rot, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, 0, 0, OW, OH);
  const o = octx.getImageData(0, 0, OW, OH);
  const od = o.data;

  // Durchschnittsfarbe und Graufassung.
  let r = 0, g = 0, b = 0, lum = 0, n = 0;
  for (let i = 0; i < OW * OH; i++) {
    if (od[i * 4 + 3] < 128) continue;
    r += od[i * 4]; g += od[i * 4 + 1]; b += od[i * 4 + 2];
    lum += 0.3 * od[i * 4] + 0.59 * od[i * 4 + 1] + 0.11 * od[i * 4 + 2];
    n++;
  }
  const average: [number, number, number] = [r / n / 255, g / n / 255, b / n / 255];
  const color = out.toDataURL('image/png');
  const lift = (0.8 * 255) / (lum / n);
  for (let i = 0; i < OW * OH; i++) {
    const l = Math.min(255, (0.3 * od[i * 4] + 0.59 * od[i * 4 + 1] + 0.11 * od[i * 4 + 2]) * lift);
    od[i * 4] = od[i * 4 + 1] = od[i * 4 + 2] = l;
  }
  octx.putImageData(o, 0, 0);
  const grey = out.toDataURL('image/png');

  // Umriss: Moore-Nachbarschaft entlang des Randes, dann Douglas-Peucker.
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < OW && y < OH && od[(y * OW + x) * 4 + 3] >= 128;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let start: [number, number] = [0, 0];
  find: for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) if (inside(x, y)) { start = [x, y]; break find; }
  const path: [number, number][] = [start];
  let cur = start, back = 4;
  for (let guard = 0; guard < OW * OH * 4; guard++) {
    let next: [number, number] | null = null;
    for (let k = 1; k <= 8; k++) {
      const dir = (back + k) % 8;
      const cand: [number, number] = [cur[0] + dirs[dir][0], cur[1] + dirs[dir][1]];
      if (inside(cand[0], cand[1])) {
        next = cand;
        // Neue Rückblick-Richtung: vom neuen Punkt zum zuletzt geprüften (leeren) Nachbarn.
        const prev = dirs[(dir + 7) % 8];
        const px2 = cur[0] + prev[0] - cand[0], py2 = cur[1] + prev[1] - cand[1];
        back = dirs.findIndex(([dx, dy]) => dx === px2 && dy === py2);
        break;
      }
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
  // Geschlossen vereinfachen: am weitesten entfernten Punkt teilen.
  let far = 0;
  path.forEach(([x, y], i) => { if (Math.hypot(x - start[0], y - start[1]) > Math.hypot(path[far][0] - start[0], path[far][1] - start[1])) far = i; });
  const eps = Math.max(OW, OH) * 0.012;
  const simple = [...simplify(path.slice(0, far + 1), eps).slice(0, -1), ...simplify([...path.slice(far), start], eps).slice(0, -1)];

  // Stiel = unterster Blattpunkt; in Blattlängen umrechnen, y nach oben.
  let sum = 0, count = 0;
  for (let x = 0; x < OW; x++) if (inside(x, OH - 1)) { sum += x; count++; }
  const baseX = count ? sum / count : OW / 2;
  const outline = simple.map(([x, y]): [number, number] => [(x - baseX) / OH, (OH - y) / OH]);
  // Gegen den Uhrzeigersinn (von vorn gesehen) - positive Fläche.
  const area = outline.reduce((s, [x, y], i) => { const [nx, ny] = outline[(i + 1) % outline.length]; return s + x * ny - nx * y; }, 0);
  if (area < 0) outline.reverse();
  return { color, grey, outline, x0: -baseX / OH, x1: (OW - baseX) / OH, average };
}
