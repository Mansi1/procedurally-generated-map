// terrainRenderer.ts
// WebGL2-Aufbau für den Gelände-Shader: Programm, Permutations-Textur und die
// Uniforms aus TERRAIN_PARAMS. Gezeichnet wird ein bildschirmfüllendes Dreieck;
// die gesamte Geländeerzeugung passiert im Fragment-Shader.

import { NOISE_LAYERS, SimplexNoise, TERRAIN_PARAMS } from '../noise';
import { FRAGMENT_SOURCE, VERTEX_SOURCE } from './terrainShader';
import type { Color } from '../functions/Color';

/** Reihenfolge muss zu den B_*-Konstanten im Shader passen. */
export interface TerrainPalette {
  biomeLo: Color[];
  biomeHi: Color[];
  waterRamp: [number, number, number][];
  surf: [number, number, number];
  resourceColors: Color[];
  resourceScale: number;
}

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

export class TerrainRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(canvas: HTMLCanvasElement, seed: string, palette: TerrainPalette) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt');
    this.gl = gl;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Shader-Programm lässt sich nicht linken:\n${gl.getProgramInfoLog(this.program)}`);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.useProgram(this.program);

    // Ein Dreieck, das über das ganze Bild hinausragt - spart den zweiten
    // Dreiecksstreifen und die Naht auf der Diagonalen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uploadPermutations(seed);
    this.uploadParams();
    this.uploadPalette(palette);
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name)!;
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
    gl.uniform1i(this.location('uGrad'), 0);
  }

  private uploadParams() {
    const gl = this.gl;
    const p = TERRAIN_PARAMS;
    const f = (name: string, value: number) => gl.uniform1f(this.location(name), value);

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
    gl.uniform1i(this.location('uMicroOctaves'), p.microOctaves);
    // Zwei Geräte-Pixel: entspricht der Zellgröße, gegen die Mikro-Detail und
    // Farbtextur ursprünglich abgestimmt wurden.
    f('uDetailPixels', 2);
  }

  private uploadPalette(palette: TerrainPalette) {
    const gl = this.gl;
    const flat = (rgb: [number, number, number][]) =>
      new Float32Array(rgb.flatMap(([r, g, b]) => [r / 255, g / 255, b / 255]));

    gl.uniform3fv(this.location('uBiomeLo[0]'), flat(palette.biomeLo.map((c) => c.toRGB())));
    gl.uniform3fv(this.location('uBiomeHi[0]'), flat(palette.biomeHi.map((c) => c.toRGB())));
    gl.uniform3fv(this.location('uWaterRamp[0]'), flat(palette.waterRamp));
    gl.uniform3fv(this.location('uSurf'), flat([palette.surf]));
    gl.uniform3fv(this.location('uResourceColor[0]'),
        flat(palette.resourceColors.map((c) => c.toRGB())));
    gl.uniform1f(this.location('uResourceScale'), palette.resourceScale);
  }

  /**
   * @param originTileX Welt-Tile am linken oberen Pixel
   * @param tilesPerPixel Abtastschritt in Welt-Tiles je Geräte-Pixel
   */
  /** Nur für Tests: 0 = Bild, 1 = Höhe, 2 = Hangneigung. */
  debugMode = 0;

  /** Markiertes Tile in Weltkoordinaten, oder null. */
  hoverTile: { x: number; y: number } | null = null;
  /** Ausschnitt der Hauptansicht in Welt-Tiles - nur für die Minimap. */
  viewRect: { x: number; y: number; width: number; height: number } | null = null;
  /** Mittelpunktmarke zeichnen - nur für die Minimap. */
  centerDot = false;

  render(originTileX: number, originTileY: number, tilesPerPixel: number) {
    const gl = this.gl;
    const { width, height } = gl.canvas;

    gl.useProgram(this.program);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(this.location('uResolution'), width, height);
    gl.uniform2f(this.location('uOrigin'), originTileX, originTileY);
    gl.uniform1f(this.location('uTilesPerPixel'), tilesPerPixel);
    gl.uniform1i(this.location('uDebug'), this.debugMode);

    gl.uniform1f(this.location('uHoverActive'), this.hoverTile ? 1 : 0);
    if (this.hoverTile) {
      gl.uniform2f(this.location('uHoverTile'), this.hoverTile.x, this.hoverTile.y);
    }
    const rect = this.viewRect;
    gl.uniform1f(this.location('uViewRectActive'), rect ? 1 : 0);
    gl.uniform1f(this.location('uCenterDot'), this.centerDot && rect ? 1 : 0);
    if (rect) {
      gl.uniform4f(this.location('uViewRect'), rect.x, rect.y, rect.width, rect.height);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
