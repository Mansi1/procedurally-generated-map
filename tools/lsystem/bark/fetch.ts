// Lädt die Rinden-Texturen (sources.ts): Poly Haven direkt (CC0), die Birke
// über die Wikimedia-API. Verkleinert auf 512 px, quadratisch, die Birke 2x2
// gespiegelt gekachelt. Schreibt img/<name>.jpg, textures.json und CREDITS.md.
// Aufruf: npx vite-node tools/lsystem/bark/fetch.ts [name ...]
// Downloads bleiben in .cache/. Braucht Chrome (tools/ui/browser.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../ui/browser.mjs';
import { BARK_SOURCES, type BarkName, type BarkSource } from './sources.ts';
import type { BarkData } from './data.ts';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const CACHE = join(DIR, '.cache'), IMG = join(DIR, 'img'), JSON_FILE = join(DIR, 'textures.json');
const HEADERS = { 'User-Agent': 'procedurally-generated-map tools/lsystem' };
const SIZE = 512;
const PAUSE_MS = 1000;
const RETRIES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch mit Pause davor; bei 429/5xx wiederholen, jedes Mal doppelt so lange warten. */
async function politeFetch(url: string): Promise<Response> {
  for (let attempt = 0, wait = PAUSE_MS; ; attempt++, wait *= 2) {
    await sleep(attempt ? wait : PAUSE_MS);
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res;
    if ((res.status !== 429 && res.status < 500) || attempt === RETRIES) {
      throw new Error(`${res.status} ${res.statusText} beim Laden von ${url}`);
    }
    console.log(`  ${res.status}, neuer Versuch in ${wait / 1000} s`);
  }
}

const json = async <T>(url: string): Promise<T> => (await politeFetch(url)).json() as Promise<T>;

/** Foto und Urheber holen, Download in .cache/ nur einmal. */
async function download(name: BarkName, source: BarkSource): Promise<{ bytes: Buffer; author: string }> {
  const cached = join(CACHE, `${name}.jpg`), authorFile = join(CACHE, `${name}.author.txt`);
  if (existsSync(cached) && existsSync(authorFile)) {
    return { bytes: readFileSync(cached), author: readFileSync(authorFile, 'utf8') };
  }
  let url: string, author: string;
  if (source.source === 'polyhaven') {
    const files = await json<{ Diffuse?: Record<string, { jpg?: { url: string } }> }>(`https://api.polyhaven.com/files/${source.file}`);
    const found = files.Diffuse?.['1k']?.jpg?.url;
    if (!found) throw new Error(`Kein 1k-Diffuse-JPG für ${source.file}`);
    url = found;
    const info = await json<{ authors?: Record<string, string> }>(`https://api.polyhaven.com/info/${source.file}`);
    author = Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven';
  } else {
    const api = new URL('https://commons.wikimedia.org/w/api.php');
    api.search = new URLSearchParams({
      action: 'query', titles: `File:${source.file}`, prop: 'imageinfo',
      iiprop: 'url|extmetadata', iiurlwidth: '1200', format: 'json',
    }).toString();
    const info = await json<{ query: { pages: Record<string, { imageinfo?: { thumburl: string; extmetadata?: { Artist?: { value: string } } }[] }> } }>(api.href);
    const ii = Object.values(info.query.pages)[0]?.imageinfo?.[0];
    if (!ii) throw new Error(`Nicht auf Commons gefunden: ${source.file}`);
    url = ii.thumburl;
    author = (ii.extmetadata?.Artist?.value ?? 'unbekannt').replace(/<[^>]+>/g, '').trim();
  }
  const bytes = Buffer.from(await (await politeFetch(url)).arrayBuffer());
  writeFileSync(cached, bytes);
  writeFileSync(authorFile, author);
  return { bytes, author };
}

/** Läuft im Browser: mittig quadratisch zuschneiden, ggf. 2x2 spiegeln, auf size skalieren. */
async function processBark({ image, mirror, size }: { image: string; mirror: boolean; size: number }) {
  const img = new Image();
  img.src = image;
  await img.decode();
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    // 2x2, jede zweite Kopie gespiegelt - so treffen sich an allen Kanten gleiche Pixel.
    const h = size / 2;
    for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      ctx.save();
      ctx.translate(fx > 0 ? 0 : size, fy > 0 ? 0 : size);
      ctx.scale(fx, fy);
      ctx.drawImage(img, sx, sy, s, s, 0, 0, h, h);
      ctx.restore();
    }
  } else {
    ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  }
  const d = ctx.getImageData(0, 0, size, size).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < size * size; i++) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; }
  const n = size * size * 255;
  return { jpeg: c.toDataURL('image/jpeg', 0.87), average: [r / n, g / n, b / n] as [number, number, number] };
}

const isBarkName = (n: string): n is BarkName => Object.hasOwn(BARK_SOURCES, n);
const requested = process.argv.slice(2);
const unknown = requested.filter((n) => !isBarkName(n));
if (unknown.length) throw new Error(`Unbekannt: ${unknown.join(', ')}`);
const names = requested.length ? requested.filter(isBarkName) : (Object.keys(BARK_SOURCES) as BarkName[]);

mkdirSync(CACHE, { recursive: true });
mkdirSync(IMG, { recursive: true });
const round = (v: number) => Math.round(v * 1000) / 1000;
const data: Partial<Record<BarkName, BarkData>> = existsSync(JSON_FILE) ? JSON.parse(readFileSync(JSON_FILE, 'utf8')) : {};

const browser = await launch();
try {
  const page = await browser.newPage();
  for (const name of names) {
    const source: BarkSource = BARK_SOURCES[name];
    const { bytes, author } = await download(name, source);
    const result = await page.evaluate(processBark, {
      image: `data:image/jpeg;base64,${bytes.toString('base64')}`, mirror: source.mirror ?? false, size: SIZE,
    });
    writeFileSync(join(IMG, `${name}.jpg`), Buffer.from(result.jpeg.slice(result.jpeg.indexOf(',') + 1), 'base64'));
    data[name] = { average: [round(result.average[0]), round(result.average[1]), round(result.average[2])], author };
    console.log(`${name}: ${source.file} (${author})`);
  }
} finally {
  await browser.close();
}
const ordered = Object.fromEntries(Object.keys(BARK_SOURCES).flatMap((n) => (isBarkName(n) && data[n] ? [[n, data[n]]] : [])));
writeFileSync(JSON_FILE, `${JSON.stringify(ordered, null, 1)}\n`);

const rows = (Object.entries(BARK_SOURCES) as [BarkName, BarkSource][]).map(([name, s]) => {
  const link = s.source === 'polyhaven'
    ? `[${s.file}](https://polyhaven.com/a/${s.file})`
    : `[${s.file}](https://commons.wikimedia.org/wiki/File:${encodeURIComponent(s.file.replace(/ /g, '_'))})`;
  return `| ${name} | ${link} | ${data[name]?.author ?? ''} | ${s.license} |`;
});
writeFileSync(join(DIR, 'CREDITS.md'), `# Rinden-Texturen - Quellen und Lizenzen

Poly-Haven-Texturen sind CC0. Die Birke stammt von Wikimedia Commons (CC BY-SA 4.0):
bei Weitergabe Urheber nennen; die bearbeitete Fassung (zugeschnitten, gespiegelt
gekachelt, verkleinert) steht unter derselben Lizenz.

| Name | Quelle | Urheber | Lizenz |
| --- | --- | --- | --- |
${rows.join('\n')}
`);
