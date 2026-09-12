// terrainShader.ts
// GLSL-Portierung der Geländeerzeugung aus noise.ts und der Einfärbung aus
// map.ts. Der Shader ist die Bildquelle; die TypeScript-Fassung bleibt für die
// Tile-Anzeige unter dem Mauszeiger bestehen. Beide lesen dieselben Regler
// (TERRAIN_PARAMS) und dieselben Permutationstabellen, damit sie dieselbe Welt
// beschreiben.

export const VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;

out vec4 fragColor;

uniform vec2  uResolution;
uniform vec2  uOrigin;         // Welt-Tile am linken oberen Pixel
uniform float uTilesPerPixel;  // Abtastschritt in Welt-Tiles je Geraetepixel
// Fertige Gradienten-Indizes je Gitterzelle, eine Ebene je Rauschquelle.
uniform highp usampler2DArray uGrad;

uniform float uMapScale;
uniform float uWarpStrength;
uniform float uDetailFrequency;
uniform float uDetailStrength;
uniform float uMicroFrequency;
uniform float uMicroStrength;
uniform float uMicroPersistence;
uniform int   uMicroOctaves;
uniform float uMicroMinSamples;
uniform float uFringeFrequency;
uniform float uFringeStrength;
uniform float uRidgeStart;
uniform float uRidgeStrength;
uniform float uShadeGain;
uniform float uLapseRate;
uniform float uDeepWaterLevel;
uniform float uSeaLevel;
uniform float uShoreLevel;
uniform float uHillLevel;
uniform float uPeakLevel;
uniform float uSnowTemperature;
uniform float uTundraTemperature;
uniform float uResourceScale;
/**
 * Bezugsgröße für Feindetail und Farbtextur, in Geräte-Pixeln. Abgetastet wird
 * je Pixel, aber Mikro-Oktaven und Farbrauschen richten sich bewusst nach einer
 * etwas gröberen Marke - sonst werden sie mit steigender Pixeldichte immer
 * feiner und die Biom-Ränder fangen an zu grieseln.
 */
uniform float uDetailPixels;
// Nur für den Abgleich mit der CPU-Fassung: 1 = Höhe, 2 = Hangneigung,
// jeweils als 16-Bit-Wert über R und G gepackt.
uniform int uDebug;

// Overlays. Beides in Welt-Tiles, damit sie unabhaengig vom Zoom sitzen.
uniform vec2  uHoverTile;      // markiertes Tile, uHoverActive < 0.5 blendet aus
uniform float uHoverActive;
uniform vec4  uViewRect;       // Ausschnitt der Hauptansicht (x, y, Breite, Hoehe)
uniform float uViewRectActive;
uniform float uCenterDot;      // Mittelpunktmarke der Minimap

uniform vec3 uBiomeLo[8];
uniform vec3 uBiomeHi[8];
uniform vec3 uWaterRamp[4];
uniform vec3 uSurf;
uniform vec3 uResourceColor[5];

// Ebenen in der Permutations-Textur (Reihenfolge = NOISE_LAYERS)
const int L_HEIGHT = 0;
const int L_RELIEF = 1;
const int L_MICRO = 2;
const int L_FRINGE = 3;
const int L_MOIST = 4;
const int L_TEMP = 5;
const int L_WARP = 6;
const int L_RIDGE = 7;
const int L_DETAIL = 8;
const int L_RESOURCE = 9;

// Biome (Reihenfolge = TILE_TYPE_GRADIENT)
const int B_DEEP_WATER = 0;
const int B_WATER = 1;
const int B_BEACH = 2;
const int B_DESERT = 3;
const int B_GRASS = 4;
const int B_FOREST = 5;
const int B_MOUNTAIN = 6;
const int B_SNOW = 7;

const float F2 = 0.3660254037844386;
const float G2 = 0.21132486540518713;
const float SIMPLEX_SD = 0.44;

const float GRAD_X[12] = float[12](1., -1., 1., -1., 1., -1., 1., -1., 0., 0., 0., 0.);
const float GRAD_Y[12] = float[12](1., 1., -1., -1., 0., 0., 0., 0., 1., -1., 1., -1.);

int gradIndex(int layer, int ii, int jj) {
  return int(texelFetch(uGrad, ivec3(ii & 255, jj & 255, layer), 0).r);
}

// 1:1 die noise2D aus noise.ts
float snoise(int layer, vec2 v) {
  float s = (v.x + v.y) * F2;
  float fi = floor(v.x + s);
  float fj = floor(v.y + s);
  float t = (fi + fj) * G2;
  float x0 = v.x - (fi - t);
  float y0 = v.y - (fj - t);

  float i1 = x0 > y0 ? 1.0 : 0.0;
  float j1 = x0 > y0 ? 0.0 : 1.0;

  float x1 = x0 - i1 + G2;
  float y1 = y0 - j1 + G2;
  float x2 = x0 - 1.0 + 2.0 * G2;
  float y2 = y0 - 1.0 + 2.0 * G2;

  int ii = int(fi) & 255;
  int jj = int(fj) & 255;
  int gi0 = gradIndex(layer, ii, jj);
  int gi1 = gradIndex(layer, ii + int(i1), jj + int(j1));
  int gi2 = gradIndex(layer, ii + 1, jj + 1);

  float n = 0.0;
  float t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0.0) { t0 *= t0; n += t0 * t0 * (GRAD_X[gi0] * x0 + GRAD_Y[gi0] * y0); }
  float t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0.0) { t1 *= t1; n += t1 * t1 * (GRAD_X[gi1] * x1 + GRAD_Y[gi1] * y1); }
  float t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0.0) { t2 *= t2; n += t2 * t2 * (GRAD_X[gi2] * x2 + GRAD_Y[gi2] * y2); }
  return 70.0 * n;
}

// FractalNoise.raw: auf Standardabweichung 1 normiert
float fbmRaw(int layer, vec2 p, int octaves, float persistence) {
  float total = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float sumSq = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    total += snoise(layer, p * frequency) * amplitude;
    sumSq += amplitude * amplitude;
    amplitude *= persistence;
    frequency *= 2.0;
  }
  return total / (SIMPLEX_SD * sqrt(sumSq));
}

// FractalNoise.noise2D: weich auf -1..1 begrenzt
float fbm(int layer, vec2 p, int octaves, float persistence) {
  return tanh(fbmRaw(layer, p, octaves, persistence) * 0.85);
}

// RidgedNoise.noise2D, 0..1
float ridgedNoise(vec2 p, int octaves, float persistence) {
  float total = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  float maxValue = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(snoise(L_RIDGE, p * frequency));
    total += n * n * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2.0;
  }
  return total / maxValue;
}

float microDetail(vec2 n, float step) {
  float total = 0.0;
  float frequency = uMicroFrequency;
  float amplitude = uMicroStrength;
  for (int i = 0; i < 8; i++) {
    if (i >= uMicroOctaves) break;
    float samples = 1.0 / (frequency * uMapScale * step);
    if (samples < uMicroMinSamples) break;
    float fade = min(1.0, (samples - uMicroMinSamples) / uMicroMinSamples);
    total += snoise(L_MICRO, n * frequency) * amplitude * fade;
    frequency *= 2.0;
    amplitude *= uMicroPersistence;
  }
  return total;
}

float elevation(vec2 n, float step) {
  float wx = fbmRaw(L_WARP, n + vec2(5.2, 1.3), 2, 0.5);
  float wy = fbmRaw(L_WARP, n + vec2(-3.7, 8.1), 2, 0.5);
  vec2 w = n + vec2(wx, wy) * uWarpStrength;

  float base = fbmRaw(L_HEIGHT, w, 4, 0.5);
  float coarse = tanh(base * 0.85);

  // Unter Wasser wird das Feindetail ausgeblendet (smoothstep == s*s*(3-2s))
  float weight = smoothstep(0.0, 1.0,
      (coarse - uDeepWaterLevel) / (uShoreLevel - uDeepWaterLevel));

  float fine = fbmRaw(L_RELIEF, n * uDetailFrequency, 4, 0.5) * uDetailStrength;
  fine += microDetail(n, step);

  float land = tanh((base + fine * weight) * 0.85);
  if (land <= uRidgeStart) return land;

  float t = (land - uRidgeStart) / (1.0 - uRidgeStart);
  float ridge = ridgedNoise(w * 2.2, 4, 0.5);
  return min(1.0, land + t * t * (ridge - 0.35) * uRidgeStrength);
}

void climate(vec2 n, float height, out float moisture, out float temperature) {
  float fringeX = fbmRaw(L_FRINGE, n * uFringeFrequency, 2, 0.5);
  float fringeY = fbmRaw(L_FRINGE, n * uFringeFrequency + vec2(31.7, -12.4), 2, 0.5);

  moisture = fbm(L_MOIST, n * 0.6 + 1000.0, 4, 0.55) + fringeX * uFringeStrength;
  float raw = fbm(L_TEMP, n * 0.35 - 1000.0, 3, 0.5) + fringeY * uFringeStrength;
  temperature = raw - max(0.0, height) * uLapseRate;
}

int classify(float height, float moisture, float temperature) {
  if (height < uDeepWaterLevel) return B_DEEP_WATER;
  if (height < uSeaLevel) return B_WATER;
  if (height < uShoreLevel) return B_BEACH;
  if (height > uPeakLevel) return temperature < uSnowTemperature ? B_SNOW : B_MOUNTAIN;
  if (height > uHillLevel) return B_MOUNTAIN;
  if (temperature < uTundraTemperature) return B_SNOW;
  if (temperature > 0.25 && moisture < -0.1) return B_DESERT;
  if (moisture > 0.1) return B_FOREST;
  return B_GRASS;
}

// Höhen-Band eines Bioms - Gegenstück zu heightBand() in map.ts
vec2 heightBand(int biome) {
  if (biome == B_DEEP_WATER) return vec2(-1.0, uDeepWaterLevel);
  if (biome == B_WATER) return vec2(uDeepWaterLevel, uSeaLevel);
  if (biome == B_BEACH) return vec2(uSeaLevel, uShoreLevel);
  if (biome == B_MOUNTAIN) return vec2(uHillLevel, 1.0);
  if (biome == B_SNOW) return vec2(uPeakLevel, 1.0);
  return vec2(uShoreLevel, uHillLevel);
}

// Ressourcen - Gegenstück zu generateResources() in map.ts.
// x = Typ (0 keine, 1 Holz, 2 Gold, 3 Stein, 4 Beeren), y = Menge 0..100
vec2 resourceAt(vec2 tile, int biome) {
  float r = fbm(L_RESOURCE, tile * uResourceScale, 2, 0.5);
  if (biome == B_FOREST && r > 0.15) return vec2(1.0, floor((r + 1.0) * 50.0));
  if (biome == B_MOUNTAIN && r > 0.25) {
    return vec2(r > 0.86 ? 2.0 : 3.0, floor((r + 1.0) * 40.0));
  }
  if (biome == B_GRASS && r > 0.62) return vec2(4.0, floor((r + 1.0) * 30.0));
  return vec2(0.0, 0.0);
}

void main() {
  float step = uTilesPerPixel;

  // Bildschirm -> Welt. gl_FragCoord zeigt auf die Pixelmitte (0.5, 1.5, ...),
  // deshalb das halbe Pixel abziehen - sonst liegt die ganze Karte um einen
  // halben Abtastschritt daneben. gl_FragCoord.y zaehlt von unten, die Welt
  // nach unten, also wird y zusaetzlich gespiegelt.
  vec2 pixel = vec2(gl_FragCoord.x - 0.5, uResolution.y - 0.5 - gl_FragCoord.y);
  vec2 tile = uOrigin + pixel * step;
  vec2 n = tile * uMapScale;

  float detailStep = step * uDetailPixels;
  float height = elevation(n, detailStep);

  float moisture;
  float temperature;
  climate(n, height, moisture, temperature);

  int biome = classify(height, moisture, temperature);
  float variation = (snoise(L_DETAIL, tile * 0.35 / detailStep) + 1.0) * 0.5;

  bool isWater = biome == B_DEEP_WATER || biome == B_WATER;
  vec3 color;

  if (isWater) {
    float depth = clamp(
        (uSeaLevel - height) / (uSeaLevel + 1.0) + (variation - 0.5) * 0.03, 0.0, 1.0);
    float pos = pow(depth, 0.7) * 3.0;
    int idx = int(min(2.0, floor(pos)));
    float raw = pos - float(idx);
    color = mix(uWaterRamp[idx], uWaterRamp[idx + 1], raw * raw * (3.0 - 2.0 * raw));

    float surf = pow(clamp(1.0 - depth / 0.16, 0.0, 1.0), 2.0) * 0.42;
    color = mix(color, uSurf, surf);
  } else {
    vec2 band = heightBand(biome);
    float rel = clamp((height - band.x) / max(band.y - band.x, 1e-6), 0.0, 1.0);
    float t = clamp(0.2 + rel * 0.62 + (variation - 0.5) * 0.3, 0.0, 1.0);
    color = mix(uBiomeLo[biome], uBiomeHi[biome], t);
  }

  // Hillshading. Die Nachbarhoehen werden bewusst eigens ausgewertet statt
  // ueber dFdx/dFdy: Bildschirm-Ableitungen gelten je 2x2-Block, die
  // Schattierung waere dann nur halb aufgeloest. Der GPU ist der dreifache
  // Aufwand egal, und so rechnet der Shader exakt dasselbe wie shadeFrom().
  float hRight = elevation((tile + vec2(step, 0.0)) * uMapScale, detailStep);
  float hDown = elevation((tile + vec2(0.0, step)) * uMapScale, detailStep);
  float shade = tanh(((height - hRight) + (height - hDown)) * uShadeGain / step);
  color *= 1.0 + shade * (isWater ? 0.08 : 0.42);

  vec2 res = resourceAt(tile, biome);
  if (res.x > 0.0) {
    float alpha = min(res.y / 100.0, 1.0) * 0.3;
    color = mix(color, uResourceColor[int(res.x)], alpha);
  }

  // Markiertes Tile: heller Rahmen mit dunklem Saum nach innen
  if (uHoverActive > 0.5) {
    vec2 d = tile - uHoverTile;
    if (d.x >= 0.0 && d.x < 1.0 && d.y >= 0.0 && d.y < 1.0) {
      float edge = min(min(d.x, 1.0 - d.x), min(d.y, 1.0 - d.y));
      if (edge < step) color = mix(color, vec3(1.0), 0.85);
      else if (edge < 3.0 * step) color = mix(color, vec3(0.0), 0.35);
    }
  }

  // Viewport-Rechteck der Minimap
  if (uViewRectActive > 0.5) {
    vec2 d = tile - uViewRect.xy;
    vec2 size = uViewRect.zw;
    bool inside = d.x >= 0.0 && d.y >= 0.0 && d.x < size.x && d.y < size.y;
    if (inside) {
      float edge = min(min(d.x, size.x - d.x), min(d.y, size.y - d.y));
      if (edge < step) color = mix(color, vec3(1.0), 0.9);
      else if (edge < 3.0 * step) color = mix(color, vec3(0.0), 0.35);
    }
  }

  if (uCenterDot > 0.5) {
    vec2 mid = uViewRect.xy + uViewRect.zw * 0.5;
    if (all(lessThan(abs(tile - mid), vec2(1.5 * step)))) {
      color = vec3(1.0, 0.867, 0.2);
    }
  }

  if (uDebug != 0) {
    float value = height;
    if (uDebug == 2) value = shade;
    // Zwischenstufen zum Eingrenzen von Abweichungen
    if (uDebug == 3) value = snoise(L_HEIGHT, n);
    if (uDebug == 4) value = fbmRaw(L_HEIGHT, n, 4, 0.5) * 0.25;
    if (uDebug == 5) value = fbmRaw(L_WARP, n + vec2(5.2, 1.3), 2, 0.5) * 0.25;
    if (uDebug == 6) value = fbmRaw(L_RELIEF, n * uDetailFrequency, 4, 0.5) * 0.25;
    if (uDebug == 7) value = ridgedNoise(n * 2.2, 4, 0.5) * 2.0 - 1.0;
    float u = clamp((value + 1.0) * 0.5, 0.0, 1.0) * 255.0;
    fragColor = vec4(floor(u) / 255.0, fract(u), 0.0, 1.0);
    return;
  }

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
