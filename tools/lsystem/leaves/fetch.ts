// Lädt die Blattfotos (sources.ts) von Wikimedia Commons, stellt sie frei und
// schreibt img/<name>.png, img/<name>-grey.png, leaves.json und CREDITS.md.
// Aufruf: npx vite-node tools/lsystem/leaves/fetch.ts [name ...]
// Die Downloads liegen in .cache/ und werden nur einmal geholt. Braucht Chrome (tools/ui/browser.mjs).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../ui/browser.mjs';
import { processLeaf } from './process.ts';
import { LEAF_SOURCES, type LeafName, type LeafSource } from './sources.ts';
import type { LeafData } from './data.ts';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const CACHE = join(DIR, '.cache'), IMG = join(DIR, 'img'), JSON_FILE = join(DIR, 'leaves.json');
/** Wikimedia bittet um einen erkennbaren User-Agent. */
const HEADERS = { 'User-Agent': 'procedurally-generated-map tools/lsystem (https://github.com/)' };
const TEXTURE_HEIGHT = 256;
/** Pause zwischen Anfragen und erste Wartezeit nach "zu viele Anfragen". */
const PAUSE_MS = 1500;
const RETRIES = 6;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch mit Pause davor; bei 429/5xx wiederholen, jedes Mal doppelt so lange warten. */
async function politeFetch(url: URL | string): Promise<Response> {
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

const isLeafName = (name: string): name is LeafName => Object.hasOwn(LEAF_SOURCES, name);

/** Vorschaubild (1024 px breit) von Commons, zwischengespeichert. */
async function download(source: LeafSource): Promise<Buffer> {
  const cached = join(CACHE, source.file.replace(/[^\w.-]+/g, '_'));
  if (existsSync(cached)) return readFileSync(cached);
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({
    action: 'query', titles: `File:${source.file}`, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '1024', format: 'json',
  }).toString();
  const info = await (await politeFetch(api)).json() as {
    query: { pages: Record<string, { imageinfo?: { thumburl: string }[] }> };
  };
  const url = Object.values(info.query.pages)[0]?.imageinfo?.[0]?.thumburl;
  if (!url) throw new Error(`Nicht auf Commons gefunden: ${source.file}`);
  const bytes = Buffer.from(await (await politeFetch(url)).arrayBuffer());
  writeFileSync(cached, bytes);
  return bytes;
}

const fromDataUrl = (url: string) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
const mime = (file: string) => (/\.png$/i.test(file) ? 'image/png' : 'image/jpeg');

function credits(): string {
  const rows = Object.entries(LEAF_SOURCES).map(([name, s]) => {
    const page = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(s.file.replace(/ /g, '_'))}`;
    return `| ${name} | [${s.file}](${page}) | ${s.author} | ${s.license} |`;
  });
  return `# Blattbilder - Quellen und Lizenzen

Alle Bilder stammen von Wikimedia Commons. tools/lsystem/leaves/fetch.ts hat sie
freigestellt, gedreht, verkleinert und in Graustufen umgerechnet (img/*-grey.png).
Die bearbeiteten Fassungen stehen unter derselben Lizenz wie das Original.

| Name | Datei | Urheber | Lizenz |
| --- | --- | --- | --- |
${rows.join('\n')}
`;
}

const requested = process.argv.slice(2);
const unknown = requested.filter((n) => !isLeafName(n));
if (unknown.length) throw new Error(`Unbekannt: ${unknown.join(', ')}`);
const names = requested.length ? requested.filter(isLeafName) : (Object.keys(LEAF_SOURCES) as LeafName[]);

mkdirSync(CACHE, { recursive: true });
mkdirSync(IMG, { recursive: true });
const data: Partial<Record<LeafName, LeafData>> = existsSync(JSON_FILE) ? JSON.parse(readFileSync(JSON_FILE, 'utf8')) : {};

const browser = await launch();
try {
  const page = await browser.newPage();
  for (const name of names) {
    const source: LeafSource = LEAF_SOURCES[name];
    const bytes = await download(source);
    const result = await page.evaluate(processLeaf, {
      image: `data:${mime(source.file)};base64,${bytes.toString('base64')}`,
      rotate: source.rotate, tolerance: source.tolerance ?? 60, crop: source.crop ?? [0, 0, 0, 0], size: TEXTURE_HEIGHT,
    });
    writeFileSync(join(IMG, `${name}.png`), fromDataUrl(result.color));
    writeFileSync(join(IMG, `${name}-grey.png`), fromDataUrl(result.grey));
    const round = (v: number) => Math.round(v * 1000) / 1000;
    data[name] = {
      tone: source.tone,
      outline: result.outline.map(([x, y]) => [round(x), round(y)]),
      x0: round(result.x0), x1: round(result.x1),
      average: [round(result.average[0]), round(result.average[1]), round(result.average[2])],
    };
    console.log(`${name}: ${result.outline.length} Umrisspunkte, Breite ${(result.x1 - result.x0).toFixed(2)}`);
  }
} finally {
  await browser.close();
}
// Sortiert wie sources.ts, damit sich die Datei beim erneuten Erzeugen nicht umordnet.
const ordered = Object.fromEntries(Object.keys(LEAF_SOURCES).flatMap((n) => (isLeafName(n) && data[n] ? [[n, data[n]]] : [])));
writeFileSync(JSON_FILE, `${JSON.stringify(ordered, null, 1)}\n`);
writeFileSync(join(DIR, 'CREDITS.md'), credits());
