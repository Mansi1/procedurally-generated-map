// terrainRenderer.ts
// WebGL2-Aufbau für den Gelände-Shader: Programme, Permutations-Textur, die
// Uniforms aus TERRAIN_PARAMS und der Farb-Cache. Gezeichnet wird ein Gitter
// in isometrischer Ansicht; der Vertex-Shader hebt es auf die Geländehöhe, die
// Farbe kommt aus dem Cache.

import { NOISE_LAYERS, SimplexNoise, TERRAIN_PARAMS } from '../noise';
import {
  DISPLAY_FRAGMENT_SOURCE,
  FILL_FRAGMENT_SOURCE,
  FILL_VERTEX_SOURCE,
  VERTEX_SOURCE,
} from './terrainShader';
import { MAX_RELIEF, Z_SCREEN, setCameraUniforms, type GpuCamera } from './iso';
import type { Color } from '../functions/Color';

/** Reihenfolge muss zu den B_*-Konstanten im Shader passen. */
export interface TerrainPalette {
  biomeLo: Color[];
  biomeHi: Color[];
  waterRamp: [number, number, number][];
  surf: [number, number, number];
  resourceColors: Color[];
  resourceScale: number;
  /** Aus RESOURCE_RULES, bereits auf Indizes abgebildet. Erste passende gewinnt. */
  resourceRules: { biome: number; type: number; threshold: number; yield: number }[];
}

/** Platz für Ressourcen-Regeln im Shader - muss zu den Array-Längen dort passen. */
const MAX_RESOURCE_RULES = 8;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader lässt sich nicht übersetzen:\n${log}`);
  }
  return shader;
}

/**
 * Regler der Geländeerzeugung als Uniforms. Braucht jedes Programm, das
 * TERRAIN_COMMON einbindet - also auch der EntityRenderer, der Gebäude auf die
 * Geländehöhe setzt. Die Permutations-Textur liegt auf Einheit 0.
 */
export function uploadTerrainParams(
    gl: WebGL2RenderingContext,
    location: (name: string) => WebGLUniformLocation | null,
) {
  const p = TERRAIN_PARAMS;
  const f = (name: string, value: number) => gl.uniform1f(location(name), value);

  gl.uniform1i(location('uGrad'), 0);
  f('uMapScale', p.mapScale);
  f('uWarpStrength', p.warpStrength);
  f('uDetailFrequency', p.detailFrequency);
  f('uDetailStrength', p.detailStrength);
  f('uMicroFrequency', p.microFrequency);
  f('uMicroStrength', p.microStrength);
  f('uMicroPersistence', p.microPersistence);
  f('uMicroMinSamples', p.microMinSamples);
  f('uFringeFrequency', p.fringeFrequency);
  f('uFringeStrength', p.fringeStrength);
  f('uRidgeStart', p.ridgeStart);
  f('uRidgeStrength', p.ridgeStrength);
  f('uShadeGain', p.shadeGain);
  f('uLapseRate', p.lapseRate);
  f('uDeepWaterLevel', p.deepWaterLevel);
  f('uSeaLevel', p.seaLevel);
  f('uShoreLevel', p.shoreLevel);
  f('uHillLevel', p.hillLevel);
  f('uPeakLevel', p.peakLevel);
  f('uSnowTemperature', p.snowTemperature);
  f('uTundraTemperature', p.tundraTemperature);
  f('uReliefHeight', p.reliefHeight);
  f('uReliefExponent', p.reliefExponent);
  f('uLowlandRelief', p.lowlandRelief);
  f('uMountainFoot', p.mountainFoot);
  gl.uniform1i(location('uMicroOctaves'), p.microOctaves);
}

/** Ein Rechteck in absoluten Cache-Texeln (Boden-Koordinaten * pixelsPerTile). */
interface TexelRect {
  u: number;
  v: number;
  width: number;
  height: number;
}

/**
 * So viele Texel darf das Befüllen je Bild höchstens kosten. Ein Bild voll
 * Geländeerzeugung (~4 Mio. Pixel) kostete auf einem M1 rund 180 ms - ein
 * Viertel davon hält die Bildrate beim Zoomen noch flüssig genug, und das
 * Fenster ist nach wenigen Bildern vollständig.
 */
const FILL_BUDGET = 1_000_000;
/**
 * Budget für alles außerhalb des Bildes - Vorrat-Blase und der Bereich unter
 * dem Bildrand -, solange im Bild noch etwas fehlt. Klein, damit es das
 * Verschieben nicht ausbremst. Ist das Bild vollständig, bekommt der
 * Hintergrund das volle Budget.
 */
const BACKGROUND_BUDGET = 250_000;


/** Rand um den Bildschirm, damit beim Verschieben nichts Ungefülltes ins Bild rutscht. */
const CACHE_MARGIN = 64;

function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader-Programm lässt sich nicht linken:\n${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Zwei Durchgänge:
 *
 * 1. Befüllen: Die teure Geländeerzeugung schreibt Farben in einen Cache -
 *    eine Textur in Boden-Koordinaten, ein Texel je Geräte-Pixel. Das Fenster
 *    wandert mit der Kamera als Ringpuffer; neu berechnet werden nur Texel,
 *    die hineinkommen. Beim Zoomen gilt der Cache nicht mehr (Detailstufe und
 *    Auflösung hängen am Zoom) und wird über ein paar Bilder neu befüllt.
 * 2. Anzeigen: Das Gitter wird auf Geländehöhe gehoben und liest nur noch aus
 *    dem Cache. Dazu kommen die Overlays, die sich je Bild ändern.
 */
export class TerrainRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private fillProgram: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private fillVao: WebGLVertexArrayObject;
  private indexBuffer: WebGLBuffer;
  /** Abmessungen des Gitters, für das der Index-Puffer gerade gebaut ist. */
  private gridColumns = 0;
  private gridRows = 0;
  private indexCount = 0;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private fillUniforms = new Map<string, WebGLUniformLocation | null>();

  private cache: WebGLTexture;
  private framebuffer: WebGLFramebuffer;
  private cacheWidth = 0;
  private cacheHeight = 0;
  /** Wofür der Cache-Inhalt gilt. Ändert sich das, ist alles ungültig. */
  private cacheKey = '';
  /** Absolute Texel-Ecke des aktuellen Fensters, oder null wenn leer. */
  private window: { u: number; v: number } | null = null;
  /** Noch zu befüllende Bereiche im Bild, dringendste zuerst. */
  private pending: TexelRect[] = [];
  /** Noch zu befüllende Bereiche unter dem Bildrand. */
  private background: TexelRect[] = [];

  constructor(canvas: HTMLCanvasElement, seed: string, palette: TerrainPalette) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt');
    this.gl = gl;

    this.program = link(gl, VERTEX_SOURCE, DISPLAY_FRAGMENT_SOURCE);
    this.fillProgram = link(gl, FILL_VERTEX_SOURCE, FILL_FRAGMENT_SOURCE);

    // Die Eckpunkte des Gitters kommen aus gl_VertexID, es gibt also keinen
    // Vertex-Puffer - nur die Indizes. Der eigene VAO hält die Index-Bindung
    // getrennt vom EntityRenderer, der auf demselben Context zeichnet.
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    // Ein Dreieck, das über die ganze Textur hinausragt - der Scissor
    // schneidet den Bereich aus, der gerade befüllt wird.
    this.fillVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.fillVao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.fillProgram, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.cache = gl.createTexture()!;
    this.framebuffer = gl.createFramebuffer()!;

    this.uploadPermutations(seed);

    gl.useProgram(this.program);
    uploadTerrainParams(gl, (name) => this.location(name));
    gl.uniform1i(this.location('uCache'), 1);

    gl.useProgram(this.fillProgram);
    uploadTerrainParams(gl, (name) => this.fillLocation(name));
    // Zwei Geräte-Pixel: entspricht der Zellgröße, gegen die Mikro-Detail und
    // Farbtextur ursprünglich abgestimmt wurden.
    gl.uniform1f(this.fillLocation('uDetailPixels'), 2);
    this.uploadPalette(palette);
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name)!;
  }

  private fillLocation(name: string): WebGLUniformLocation | null {
    if (!this.fillUniforms.has(name)) {
      this.fillUniforms.set(name, this.gl.getUniformLocation(this.fillProgram, name));
    }
    return this.fillUniforms.get(name)!;
  }

  /**
   * Lädt genau die Permutationstabellen, die die TypeScript-Fassung benutzt.
   * Damit beschreiben Shader und CPU dieselbe Welt - sonst würde die Anzeige
   * unter dem Mauszeiger etwas anderes behaupten als das Bild zeigt.
   */
  private uploadPermutations(seed: string) {
    const gl = this.gl;
    const layers = NOISE_LAYERS.length;
    const data = new Uint8Array(256 * 256 * layers);
    NOISE_LAYERS.forEach((suffix, layer) => {
      data.set(new SimplexNoise(seed + suffix).gradientTable(), layer * 256 * 256);
    });

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8UI, 256, 256, layers, 0,
        gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private uploadPalette(palette: TerrainPalette) {
    const gl = this.gl;
    const flat = (rgb: [number, number, number][]) =>
      new Float32Array(rgb.flatMap(([r, g, b]) => [r / 255, g / 255, b / 255]));

    gl.uniform3fv(this.fillLocation('uBiomeLo[0]'), flat(palette.biomeLo.map((c) => c.toRGB())));
    gl.uniform3fv(this.fillLocation('uBiomeHi[0]'), flat(palette.biomeHi.map((c) => c.toRGB())));
    gl.uniform3fv(this.fillLocation('uWaterRamp[0]'), flat(palette.waterRamp));
    gl.uniform3fv(this.fillLocation('uSurf'), flat([palette.surf]));
    gl.uniform3fv(this.fillLocation('uResourceColor[0]'),
        flat(palette.resourceColors.map((c) => c.toRGB())));
    gl.uniform1f(this.fillLocation('uResourceScale'), palette.resourceScale);

    const rules = palette.resourceRules;
    if (rules.length > MAX_RESOURCE_RULES) {
      throw new Error(
          `Der Shader fasst ${MAX_RESOURCE_RULES} Ressourcen-Regeln, übergeben wurden ${rules.length}`);
    }
    gl.uniform1i(this.fillLocation('uResourceRuleCount'), rules.length);
    gl.uniform1iv(this.fillLocation('uResourceRuleBiome[0]'),
        new Int32Array(rules.map((r) => r.biome)));
    gl.uniform1iv(this.fillLocation('uResourceRuleType[0]'),
        new Int32Array(rules.map((r) => r.type)));
    gl.uniform1fv(this.fillLocation('uResourceRuleThreshold[0]'),
        new Float32Array(rules.map((r) => r.threshold)));
    gl.uniform1fv(this.fillLocation('uResourceRuleYield[0]'),
        new Float32Array(rules.map((r) => r.yield)));
  }

  /** Nur für Tests: 0 = Bild, 1 = Höhe, 2 = Hangneigung. */
  debugMode = 0;

  /** Markiertes Tile in Weltkoordinaten, oder null. */
  hoverTile: { x: number; y: number } | null = null;
  /** Ausschnitt der Hauptansicht in Geräte-Pixeln dieses Canvas - nur für die Minimap. */
  viewRect: { x: number; y: number; width: number; height: number } | null = null;
  /** Mittelpunktmarke zeichnen - nur für die Minimap. */
  centerDot = false;
  /** Kantenlänge einer Gitterzelle in Geräte-Pixeln. Flach reicht ein grobes Gitter. */
  cellPixels = 4;
  /**
   * Vorrat-Blase um den Bildschirm, in Geräte-Pixeln je Seite. Sie wird im
   * Hintergrund vorausberechnet, damit beim Verschieben fertiges Gelände ins
   * Bild rückt statt frisch zu berechnendes. 512 Pixel reichen bei normalem
   * Scrolltempo für eine gute halbe Sekunde; größer ginge schnell in den
   * Speicher, weil die Textur in beide Richtungen wächst.
   */
  bubblePixels = 512;

  /**
   * Zellgröße in u/v-Einheiten. Nie feiner als ein Achtel Tile: so kleine
   * Formen hat das Relief nicht, und bei starkem Zoom würden aus vier Pixeln
   * sonst fast eine Million Eckpunkte.
   */
  private cellSize(camera: GpuCamera): number {
    return Math.max(this.cellPixels / camera.pixelsPerTile, 1 / 8);
  }

  /** Derselbe Context wird vom EntityRenderer mitbenutzt. */
  get context(): WebGL2RenderingContext {
    return this.gl;
  }

  /** Zwei Dreiecke je Zelle, zeilenweise - passt zu gl_VertexID im Vertex-Shader. */
  private ensureGrid(columns: number, rows: number) {
    if (columns === this.gridColumns && rows === this.gridRows) return;
    const gl = this.gl;
    const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
    let o = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < columns - 1; c++) {
        const i = r * columns + c;
        indices[o++] = i;
        indices[o++] = i + 1;
        indices[o++] = i + columns;
        indices[o++] = i + 1;
        indices[o++] = i + columns + 1;
        indices[o++] = i + columns;
      }
    }
    gl.bindVertexArray(this.vao);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.gridColumns = columns;
    this.gridRows = rows;
    this.indexCount = indices.length;
  }

  /** Legt die Cache-Textur in neuer Größe an. Der Inhalt ist danach ungültig. */
  private allocateCache(width: number, height: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cache);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.cache, 0);
    // Noch nicht befüllte Texel in der Hintergrundfarbe statt Speicherresten.
    gl.clearColor(0.05, 0.08, 0.14, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.cacheWidth = width;
    this.cacheHeight = height;
  }

  /**
   * Schiebt das Cache-Fenster zur Kamera und merkt vor, was neu hineinkommt.
   * Beim Verschieben sind das zwei schmale Streifen an den Rändern.
   */
  private updateCache(camera: GpuCamera) {
    const gl = this.gl;
    const { width, height } = gl.canvas;
    const ppt = camera.pixelsPerTile;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    // Unten ragt Gelände um den höchsten Gipfel ins Bild, dessen Fuß noch
    // unter dem Bildrand liegt - das muss mit in den Cache.
    const reach = Math.ceil(camera.reliefScale * Z_SCREEN * MAX_RELIEF * ppt);
    const margin = CACHE_MARGIN + Math.ceil(this.cellSize(camera) * ppt);
    // Unten überlappen Blase und Gipfel-Reichweite - es zählt die größere.
    const cacheWidth = Math.min(width + 2 * (margin + this.bubblePixels), max);
    const cacheHeight = Math.min(height + 2 * margin + this.bubblePixels + Math.max(this.bubblePixels, reach), max);
    // Bei sehr großem Bildschirm kann die Texturgrenze die Blase auffressen.
    const bubbleU = Math.max(0, Math.floor((cacheWidth - width) / 2) - margin);
    const bubbleV = Math.max(0, Math.min(this.bubblePixels, cacheHeight - height - 2 * margin));

    const key = `${ppt}|${camera.reliefScale}|${this.debugMode}`;
    if (cacheWidth !== this.cacheWidth || cacheHeight !== this.cacheHeight) {
      this.allocateCache(cacheWidth, cacheHeight);
      this.window = null;
    }
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.window = null;
      // Debug-Werte sind gepackte Zahlen - die dürfen nicht interpoliert werden.
      const filter = this.debugMode ? gl.NEAREST : gl.LINEAR;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.cache);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.activeTexture(gl.TEXTURE0);
    }

    const u = Math.floor((camera.centerX - camera.centerY) * ppt - width / 2 - margin - bubbleU);
    const v = Math.floor((camera.centerX + camera.centerY) / 2 * ppt - height / 2 - margin - bubbleV);
    const next: TexelRect = { u, v, width: cacheWidth, height: cacheHeight };

    // Dringend ist nur, was im Bild liegt (plus schmaler Rand). Alles andere -
    // die Blase und der Bereich unter dem Bildrand, der nur für von unten
    // hereinragende Gipfel da ist - läuft im Hintergrund, nächstgelegenes zuerst.
    const visible = {
      u: u + bubbleU,
      v: v + bubbleV,
      width: width + 2 * margin,
      height: height + 2 * margin,
    };
    const split = (rects: TexelRect[]) => {
      const urgent: TexelRect[] = [];
      const rest: TexelRect[] = [];
      for (const r of rects) {
        const inside = intersect(r, visible);
        if (inside) urgent.push(inside);
        rest.push(...subtract(r, visible));
      }
      return { urgent, rest };
    };
    const byDistance = (rects: TexelRect[]) =>
      rects.sort((a, b) => distance(a, visible) - distance(b, visible));

    const old = this.window;
    if (!old) {
      // Alles neu - von oben nach unten, der sichtbare Teil zuerst.
      const { urgent, rest } = split([next]);
      this.pending = urgent;
      this.background = byDistance(rest);
    } else if (old.u !== u || old.v !== v) {
      const strips: TexelRect[] = [];
      const du = u - old.u;
      const dv = v - old.v;
      if (du !== 0) {
        const w = Math.min(Math.abs(du), cacheWidth);
        strips.push({ u: du > 0 ? u + cacheWidth - w : u, v, width: w, height: cacheHeight });
      }
      if (dv !== 0) {
        const h = Math.min(Math.abs(dv), cacheHeight);
        strips.push({ u, v: dv > 0 ? v + cacheHeight - h : v, width: cacheWidth, height: h });
      }
      // Was aus dem Fenster gefallen ist, braucht niemand mehr. Was noch
      // nicht berechnet ist und jetzt ins Bild rückt, wird dringend.
      const waiting = [...strips, ...this.pending, ...this.background]
          .map((r) => intersect(r, next))
          .filter((r): r is TexelRect => r !== null);
      const { urgent, rest } = split(waiting);
      this.pending = urgent;
      this.background = byDistance(rest);
    }
    this.window = { u, v };
  }

  /** Arbeitet die Warteliste ab, bis das Budget für dieses Bild aufgebraucht ist. */
  private fillPending(camera: GpuCamera) {
    if ((this.pending.length === 0 && this.background.length === 0) || !this.window) return;
    const gl = this.gl;
    const win = this.window;
    const ppt = camera.pixelsPerTile;
    const W = this.cacheWidth;
    const H = this.cacheHeight;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(this.fillProgram);
    gl.bindVertexArray(this.fillVao);

    const f = (name: string) => this.fillLocation(name);
    gl.uniform1f(f('uPixelsPerTile'), ppt);
    gl.uniform1f(f('uReliefScale'), camera.reliefScale);
    gl.uniform1i(f('uDebug'), this.debugMode);
    gl.uniform2f(f('uWindowStart'), win.u / ppt, win.v / ppt);
    gl.uniform2f(f('uWindowMod'), mod(win.u, W), mod(win.v, H));
    gl.uniform2f(f('uCacheSize'), W, H);

    const spent = this.drain(this.pending, FILL_BUDGET);
    // Ist das Bild fertig, füllt der Rest des Budgets die Blase auf.
    this.drain(this.background, this.pending.length > 0
        ? BACKGROUND_BUDGET
        : Math.max(BACKGROUND_BUDGET, FILL_BUDGET - spent));

    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Befüllt Bereiche vom Anfang der Liste, bis das Budget aufgebraucht ist. */
  private drain(queue: TexelRect[], budget: number): number {
    const initial = budget;
    while (budget > 0 && queue.length > 0) {
      const rect = queue[0];
      // Zu groß fürs Restbudget: nur die oberen Zeilen, der Rest bleibt stehen.
      const rows = Math.min(rect.height, Math.max(1, Math.floor(budget / rect.width)));
      this.fillRect({ ...rect, height: rows });
      budget -= rows * rect.width;
      if (rows === rect.height) queue.shift();
      else queue[0] = { ...rect, v: rect.v + rows, height: rect.height - rows };
    }
    return initial - budget;
  }

  /** Zeichnet ein absolutes Rechteck in den Ringpuffer - über den Rand hinweg in bis zu vier Teilen. */
  private fillRect(rect: TexelRect) {
    const gl = this.gl;
    const W = this.cacheWidth;
    const H = this.cacheHeight;
    const pieces = (start: number, length: number, size: number): [number, number][] => {
      const s = mod(start, size);
      const first = Math.min(length, size - s);
      return first < length ? [[s, first], [0, length - first]] : [[s, first]];
    };
    for (const [x, w] of pieces(rect.u, rect.width, W)) {
      for (const [y, h] of pieces(rect.v, rect.height, H)) {
        gl.scissor(x, y, w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
  }

  render(camera: GpuCamera) {
    const gl = this.gl;

    this.updateCache(camera);
    this.fillPending(camera);

    const { width, height } = gl.canvas;

    // Gitter in Boden-Koordinaten (u, v), einmal über den ganzen Bildschirm.
    // Unten ragt es um den höchsten Gipfel hinaus: Gelände, dessen Fuß unter
    // dem Bildrand liegt, kann bis ins Bild hineinragen.
    const cell = this.cellSize(camera);
    const halfU = width / 2 / camera.pixelsPerTile;
    const halfV = height / 2 / camera.pixelsPerTile;
    const reach = camera.reliefScale * Z_SCREEN * MAX_RELIEF;
    const camU = camera.centerX - camera.centerY;
    const camV = (camera.centerX + camera.centerY) / 2;

    // Am Weltraster ausgerichtet, damit die Eckpunkte beim Verschieben an
    // derselben Weltstelle bleiben.
    const u0 = Math.floor((camU - halfU) / cell) * cell;
    const v0 = Math.floor((camV - halfV) / cell) * cell;
    const columns = Math.ceil(2 * halfU / cell) + 2;
    const rows = Math.ceil((2 * halfV + reach) / cell) + 2;
    this.ensureGrid(columns, rows);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.clearColor(0.05, 0.08, 0.14, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cache);
    gl.activeTexture(gl.TEXTURE0);

    const ppt = camera.pixelsPerTile;
    const win = this.window!;
    setCameraUniforms(gl, (name) => this.location(name), camera);
    gl.uniform2f(this.location('uWindowStart'), win.u / ppt, win.v / ppt);
    gl.uniform2f(this.location('uWindowMod'), mod(win.u, this.cacheWidth), mod(win.v, this.cacheHeight));
    gl.uniform2f(this.location('uCacheSize'), this.cacheWidth, this.cacheHeight);
    gl.uniform2f(this.location('uGridOrigin'), u0, v0);
    gl.uniform1f(this.location('uGridCell'), cell);
    gl.uniform1i(this.location('uGridColumns'), columns);

    gl.uniform1f(this.location('uHoverActive'), this.hoverTile ? 1 : 0);
    if (this.hoverTile) {
      gl.uniform2f(this.location('uHoverTile'), this.hoverTile.x, this.hoverTile.y);
    }
    const rect = this.viewRect;
    gl.uniform1f(this.location('uViewRectActive'), rect ? 1 : 0);
    gl.uniform1f(this.location('uCenterDot'), this.centerDot ? 1 : 0);
    if (rect) {
      gl.uniform4f(this.location('uViewRect'), rect.x, rect.y, rect.width, rect.height);
    }

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
}

/** a ohne b - bis zu vier Rechtecke: Streifen oben und unten, dazwischen links und rechts. */
function subtract(a: TexelRect, b: TexelRect): TexelRect[] {
  const cut = intersect(a, b);
  if (!cut) return [a];
  const out: TexelRect[] = [];
  const aBottom = a.v + a.height;
  const cutBottom = cut.v + cut.height;
  if (cut.v > a.v) out.push({ u: a.u, v: a.v, width: a.width, height: cut.v - a.v });
  if (cutBottom < aBottom) out.push({ u: a.u, v: cutBottom, width: a.width, height: aBottom - cutBottom });
  if (cut.u > a.u) out.push({ u: a.u, v: cut.v, width: cut.u - a.u, height: cut.height });
  const aRight = a.u + a.width;
  const cutRight = cut.u + cut.width;
  if (cutRight < aRight) out.push({ u: cutRight, v: cut.v, width: aRight - cutRight, height: cut.height });
  return out;
}

/** Abstand in Texeln zwischen zwei Rechtecken, 0 wenn sie sich berühren. */
function distance(a: TexelRect, b: TexelRect): number {
  const du = Math.max(0, b.u - (a.u + a.width), a.u - (b.u + b.width));
  const dv = Math.max(0, b.v - (a.v + a.height), a.v - (b.v + b.height));
  return Math.max(du, dv);
}

function intersect(a: TexelRect, b: TexelRect): TexelRect | null {
  const u = Math.max(a.u, b.u);
  const v = Math.max(a.v, b.v);
  const width = Math.min(a.u + a.width, b.u + b.width) - u;
  const height = Math.min(a.v + a.height, b.v + b.height) - v;
  return width > 0 && height > 0 ? { u, v, width, height } : null;
}
