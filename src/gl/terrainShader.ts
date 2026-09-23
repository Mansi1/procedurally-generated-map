// terrainShader.ts
// GLSL-Portierung der Geländeerzeugung aus noise.ts und der Einfärbung aus
// map.ts. Der Shader ist die Bildquelle; die TypeScript-Fassung bleibt für die
// Tile-Anzeige unter dem Mauszeiger bestehen. Beide lesen dieselben Regler
// (TERRAIN_PARAMS) und dieselben Permutationstabellen, damit sie dieselbe Welt
// beschreiben.

import { PROJECT_GLSL } from './iso';

/**
 * Rauschen und Höhenfunktion. Steht im Vertex-Shader (Relief) und im
 * Fragment-Shader (Farbe) - dieselben Uniforms, dasselbe Gelände.
 * Auch der EntityRenderer bindet es ein, um Gebäude aufs Gelände zu setzen.
 */
export const TERRAIN_COMMON = `
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
uniform float uReliefHeight;
uniform float uReliefExponent;
uniform float uLowlandRelief;
uniform float uMountainFoot;

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
const int L_CLUSTER = 10;


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

// Hoehe ueber dem Meer in Tiles - Gegenstueck zu reliefZ() in noise.ts.
// Wasser ist flach.
float reliefZ(float h) {
  if (h <= uSeaLevel) return 0.0;
  float low = min(1.0, (h - uSeaLevel) / (uMountainFoot - uSeaLevel));
  float high = max(0.0, (h - uMountainFoot) / (1.0 - uMountainFoot));
  return uLowlandRelief * low + (uReliefHeight - uLowlandRelief) * pow(high, uReliefExponent);
}
`;

/**
 * Lage des Farb-Caches. Er liegt in Boden-Koordinaten (u, v), ein Texel je
 * Geraete-Pixel, und ist ein Ringpuffer: das Fenster wandert mit der Kamera,
 * Texel werden reihum wiederverwendet.
 */
const CACHE_GLSL = `
uniform vec2 uWindowStart;  // (u, v) der Fenster-Ecke
uniform vec2 uWindowMod;    // wo diese Ecke in der Textur liegt, in Texeln
uniform vec2 uCacheSize;    // Texturgroesse in Texeln
`;

/**
 * Das Gelände ist ein Gitter, das auf dem Bildschirm gleichmäßig liegt (in
 * Boden-Koordinaten u/v, siehe iso.ts). Jeder Eckpunkt wird ins Weltsystem
 * zurückgerechnet und um seine Höhe angehoben. Die Eckpunkte hängen am
 * Weltraster, nicht am Bildschirm - sonst würde das Relief beim Verschieben
 * der Kamera schwimmen.
 */
export const VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;

${TERRAIN_COMMON}
${PROJECT_GLSL}

uniform vec2  uGridOrigin;  // (u, v) des ersten Eckpunkts
uniform float uGridCell;    // Zellgroesse in u/v-Einheiten
uniform int   uGridColumns;
${CACHE_GLSL}

out vec2 vWorld;
out vec2 vCache;            // normierte Koordinate im Farb-Cache

void main() {
  int col = gl_VertexID % uGridColumns;
  int row = gl_VertexID / uGridColumns;
  vec2 g = uGridOrigin + vec2(float(col), float(row)) * uGridCell;
  vec2 world = groundToWorld(g);

  float z = 0.0;
  if (uReliefScale > 0.0) {
    // Mit der Zellgroesse als Abtastschritt: Feinoktaven, die das Gitter
    // nicht aufloesen kann, bleiben aus dem Relief heraus.
    z = reliefZ(elevation(world * uMapScale, uGridCell)) * uReliefScale;
  }
  vWorld = world;
  // Ringpuffer: Texturkoordinaten laufen ueber den Rand hinaus, REPEAT
  // faltet sie zurueck.
  vCache = ((g - uWindowStart) * uPixelsPerTile + uWindowMod) / uCacheSize;
  gl_Position = project(world, z);
}
`;

/** Vollbild-Dreieck für das Befüllen des Caches - begrenzt wird per Scissor. */
export const FILL_VERTEX_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * Die eigentliche Geländeerzeugung. Läuft nicht mehr je Bild, sondern nur für
 * Texel, die neu ins Fenster kommen - beim Verschieben ein schmaler Streifen,
 * beim Zoomen einmal das ganze Fenster.
 */
export const FILL_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;

out vec4 fragColor;

${TERRAIN_COMMON}
${PROJECT_GLSL}
${CACHE_GLSL}

uniform float uResourceScale;
// Ressourcen-Regeln aus RESOURCE_RULES (map.ts). Als Uniforms statt fest im
// Code, damit die Schwellen nur an einer Stelle stehen.
uniform int   uResourceRuleCount;
uniform int   uResourceRuleBiome[8];
uniform int   uResourceRuleType[8];
uniform float uResourceRuleThreshold[8];
uniform float uResourceRuleCluster[8];
uniform float uResourceRuleYield[8];
uniform float uResourceClusterScale;
uniform vec2  uResourceClusterOffset;
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

uniform vec3 uBiomeLo[8];
uniform vec3 uBiomeHi[8];
uniform vec3 uWaterRamp[4];
uniform vec3 uSurf;
uniform vec3 uResourceColor[5];


// Biome (Reihenfolge = TILE_TYPE_GRADIENT)
const int B_DEEP_WATER = 0;
const int B_WATER = 1;
const int B_BEACH = 2;
const int B_DESERT = 3;
const int B_GRASS = 4;
const int B_FOREST = 5;
const int B_MOUNTAIN = 6;
const int B_SNOW = 7;


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

// Ressourcen - Gegenstück zu resourceFromNoise() in map.ts. Erste passende
// Regel gewinnt, genau wie dort.
// x = Typ als Index in uResourceColor (0 = keine), y = Menge 0..100
vec2 resourceAt(vec2 tile, int biome) {
  float r = fbm(L_RESOURCE, tile * uResourceScale, 2, 0.5);
  for (int i = 0; i < 8; i++) {
    if (i >= uResourceRuleCount) break;
    if (uResourceRuleBiome[i] != biome || r <= uResourceRuleThreshold[i]) continue;
    // Häufchen: kleine Vorkommen statt ganzer Gegenden, je Regel woanders.
    if (uResourceRuleCluster[i] >= -1.0 &&
        snoise(L_CLUSTER, tile * uResourceClusterScale + float(i) * uResourceClusterOffset) <= uResourceRuleCluster[i]) continue;
    {
      return vec2(float(uResourceRuleType[i]), floor((r + 1.0) * uResourceRuleYield[i]));
    }
  }
  return vec2(0.0, 0.0);
}

void main() {
  // Welt-Tiles je Geraete-Pixel, waagerecht gemessen. Auf Haengen ist es
  // mehr, fuer Detailstufe und Schattierung reicht die Naeherung.
  float step = 1.0 / uPixelsPerTile;

  // Texel -> Boden -> Welt. Das Texel mit Index t steht fuer die absolute
  // Position, die im aktuellen Fenster auf t faellt.
  vec2 rel = mod(floor(gl_FragCoord.xy) - uWindowMod, uCacheSize);
  vec2 g = uWindowStart + (rel + 0.5) * step;
  vec2 tile = groundToWorld(g);
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

  // Licht auf das Relief. Die Hangneigung oben ist nur ein Schattierungs-
  // effekt der Hoehenwerte; hier zaehlt die Neigung der tatsaechlich
  // angehobenen Flaeche, damit Sonnen- und Schattenseiten der Berge zur
  // Geometrie passen. Licht von links oben im Bild, wie in AoE2.
  if (uReliefScale > 0.0 && !isWater) {
    float z = reliefZ(height);
    vec3 normal = normalize(vec3(
        (z - reliefZ(hRight)) / step,
        (z - reliefZ(hDown)) / step,
        1.0 / uReliefScale));
    const vec3 SUN = vec3(-0.45, 0.35, 0.82);
    float lambert = dot(normal, normalize(SUN)) / normalize(SUN).z;
    color *= clamp(mix(1.0, lambert, 0.85), 0.45, 1.3);
  }

  vec2 res = resourceAt(tile, biome);
  if (res.x > 0.0) {
    float alpha = min(res.y / 100.0, 1.0) * 0.3;
    color = mix(color, uResourceColor[int(res.x)], alpha);
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

/** Bild aus dem Cache plus die Overlays, die sich je Bild ändern. */
export const DISPLAY_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec2 vWorld;
in vec2 vCache;
out vec4 fragColor;

uniform sampler2D uCache;
uniform vec2  uResolution;
uniform float uPixelsPerTile;

// Overlays. Das Tile in Welt-Tiles, das Rechteck in Geraete-Pixeln.
uniform vec2  uHoverTile;      // markiertes Tile, uHoverActive < 0.5 blendet aus
uniform float uHoverActive;
uniform vec4  uViewRect;       // Ausschnitt der Hauptansicht (x, y, Breite, Hoehe), Pixel ab links oben
uniform float uViewRectActive;
uniform float uCenterDot;      // Mittelpunktmarke der Minimap

void main() {
  float step = 1.0 / uPixelsPerTile;
  vec2 tile = vWorld;
  vec3 color = texture(uCache, vCache).rgb;

  // Markiertes Tile: heller Rahmen mit dunklem Saum nach innen
  if (uHoverActive > 0.5) {
    vec2 d = tile - uHoverTile;
    if (d.x >= 0.0 && d.x < 1.0 && d.y >= 0.0 && d.y < 1.0) {
      float edge = min(min(d.x, 1.0 - d.x), min(d.y, 1.0 - d.y));
      if (edge < step) color = mix(color, vec3(1.0), 0.85);
      else if (edge < 3.0 * step) color = mix(color, vec3(0.0), 0.35);
    }
  }

  // Viewport-Rechteck und Mittelpunkt der Minimap, in Geraete-Pixeln
  vec2 pixel = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  if (uViewRectActive > 0.5) {
    vec2 d = pixel - uViewRect.xy;
    vec2 size = uViewRect.zw;
    bool inside = d.x >= 0.0 && d.y >= 0.0 && d.x < size.x && d.y < size.y;
    if (inside) {
      float edge = min(min(d.x, size.x - d.x), min(d.y, size.y - d.y));
      if (edge < 1.0) color = mix(color, vec3(1.0), 0.9);
      else if (edge < 3.0) color = mix(color, vec3(0.0), 0.35);
    }
  }

  if (uCenterDot > 0.5 && all(lessThan(abs(pixel - uResolution * 0.5), vec2(2.0)))) {
    color = vec3(1.0, 0.867, 0.2);
  }

  fragColor = vec4(color, 1.0);
}
`;
