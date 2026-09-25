# Vorschläge

Ideen, die beim Umbau der Landschaft (Branch `feat/landscape-reshape`,
September 2026) aufkamen - was erledigt ist, was offen ist und was verworfen
wurde. Die übrigen offenen Punkte des Projekts stehen in docs/OFFEN.md.

## Herauszoomen ohne FPS zu verlieren

Beim Herauszoomen wächst die sichtbare Fläche quadratisch. Bäume, Sträucher
und Felsen werden bis 4 px je Tile gezeichnet (`RESOURCE_OBJECTS_MIN_ZOOM`),
und seit jeder Wald Holz trägt, sind es doppelt so viele Bäume.

| Idee | Stand | Aufwand |
|---|---|---|
| Feste Puffer für Vorkommen | **erledigt** (`2b9473a`) | - |
| Weit draußen keine Baum-Modelle, der Boden malt den Wald | offen, als Nächstes | klein |
| Billboards für mittlere Entfernung | offen | mittel |
| Grenzen: weniger weit herauszoomen, Nebel am Rand | offen | sehr klein |
| Geringere Pixeldichte weit draußen | **verworfen** - zu pixelig | - |

- **Feste Puffer (erledigt):** Unberührte Bäume, Felsen und Sträucher liegen
  je Region (64 x 64 Tiles) in einem festen Puffer auf der Grafikkarte
  (`world/resources.ts`, `gl/entityRenderer.ts`). Bild für Bild laufen nur
  noch angefasste Tiles und die Auswahl. Der Gewinn ist noch nicht gemessen:
  `npm run dev`, ganz herauszoomen, FPS im Entwickler-Panel mit `main`
  vergleichen.
- **Boden malt den Wald:** Der Gelände-Shader hat schon einen Waldboden mit
  gemalten Kronen (`forestTexture`, `forestProp`). Unter etwa 8-12 px je
  Tile die Baum-Modelle ausblenden und den gemalten Wald voll einblenden -
  auf diese Entfernung kaum zu unterscheiden, und die teuerste Last fällt
  weg. So machen es viele Strategiespiele.
- **Billboards:** Zwischen nah (3D-Modell) und fern (gemalter Boden) jeder
  Baum als flaches Bild aus zwei Dreiecken, vorgerendert aus dem Modell -
  `tools/ui/icons.mjs` rendert Modelle schon zu Bildern.
- **Grenzen:** Weniger weit herauszoomen lassen oder am Rand Nebel bzw.
  Wolken wie in AoE. Ändert, wie sich das Spiel anfühlt.
- **Geringere Pixeldichte (verworfen):** Weit draußen mit weniger Pixeln
  rendern und hochskalieren - war zu pixelig. Eine feinere Variante wäre,
  nur das Gelände in geringerer Auflösung zu rendern und die Objekte scharf
  darüber; dafür bräuchte es einen eigenen Framebuffer mit Tiefenpuffer.

## Landschaft

- **Waldrand angleichen:** Der Shader blendet Waldboden schon ab Feuchte
  0,02 ein, die Spiel-Logik zählt ein Tile erst ab 0,1 als Wald
  (`classify()` in `noise.ts`). An jedem Waldrand liegt deshalb ein schmaler
  Saum Waldboden ohne Bäume. Wirkt wie ein natürlicher Waldrand; stört er,
  den Übergang im Shader (`smoothstep(0.02, 0.18, moisture)`) an die Logik
  angleichen.
- **Beeren-Gruppen natürlicher verteilen:** Die Gruppen liegen in einem
  Raster aus Zellen von 12 Tiles und wirken dadurch recht gleichmäßig. Das
  Raster ließe sich auflockern (versetzte Zellen, schwankender Abstand).
  Menge und Dichte: `chance` und `cell` in `RESOURCE_RULES` (`map.ts`).
- **Noch flachere Wiesen:** `LOWLAND_RELIEF` (jetzt 2) und `LOWLAND_SHADE`
  (jetzt 0,35) in `noise.ts` - kleinere Werte machen das Flachland ebener.
- **Ruhigere Berghänge:** Die Streifen an Hängen sind echte Grate und
  Rinnen (Warp- und Grat-Rauschen), keine Bodenwellen. Glätten hieße, die
  Form der Berge zu ändern - das verschiebt Gelände und damit Biome.

## Oberfläche

- **Baumenü im Stil der Minimap (verworfen):** Tafel in Anthrazit, Knöpfe
  mit Bronze- und Goldkanten wie die AoE4-Minimap - wieder rückgängig
  gemacht.

## Sonst

- **Branch übernehmen:** `feat/landscape-reshape` (Wald, Beeren,
  flacheres Flachland, feste Puffer) ist nicht gepusht und nicht in `main`.
- **Rauchtest:** Seit den Gelände-Änderungen landen seine Klicks auf
  anderen Tiles - er steckt 2 statt 3 Feldstücke ab und baut 4 statt 5
  Gebäude. Er läuft weiter durch; wer feste Zahlen erwartet, passt ihn an.
- **Clips über Blender bearbeiten:** Export-Einstellungen finden, bei denen
  die Animationen gleich bleiben - steht in docs/OFFEN.md.
