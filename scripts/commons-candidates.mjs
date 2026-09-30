// Finds freely licensed Wikimedia Commons photographs for articles and renders labelled contact
// sheets for visual review. Research only: nothing is uploaded or published.
//   node scripts/commons-candidates.mjs <queries.json> <outDir>
// queries.json: { "section/slug": ["search 1", "search 2"], ... }
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [queriesFile, outDir] = process.argv.slice(2);
if (!queriesFile || !outDir) throw new Error('Usage: commons-candidates.mjs <queries.json> <outDir>');
mkdirSync(outDir, { recursive: true });
const USER_AGENT = 'KingdomEncyclopediaBot/1.0 (https://saudiknowledge.com; editorial image research)';
const FREE = /^(CC BY(-SA)? [\d.]+|CC0|Public domain|PD[- ].*)/i;
const strip = html => String(html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(params) {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.status === 429) { await sleep(3000 * (attempt + 1)); continue; }
    return response.json();
  }
  throw new Error('Commons API rate limit');
}
async function thumb(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    await sleep(2500 * (attempt + 1));
  }
  return null;
}

const queries = JSON.parse(readFileSync(queriesFile, 'utf8'));
const result = {};
for (const [route, searches] of Object.entries(queries)) {
  const seen = new Map();
  for (const search of searches) {
    const data = await api({ action: 'query', generator: 'search', gsrsearch: `${search} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '480' });
    for (const page of data.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const license = strip(meta.LicenseShortName?.value);
      if (!info || !/image\/(jpeg|png|webp)/.test(info.mime) || info.width < 1200 || !FREE.test(license) || seen.has(page.title)) continue;
      seen.set(page.title, {
        title: page.title, page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`,
        width: info.width, height: info.height, license, licenseUrl: strip(meta.LicenseUrl?.value) || null,
        artist: strip(meta.Artist?.value).slice(0, 160), credit: strip(meta.Credit?.value).slice(0, 160),
        description: strip(meta.ImageDescription?.value).slice(0, 300), date: strip(meta.DateTimeOriginal?.value).slice(0, 40),
        thumb: info.thumburl, original: info.url,
      });
    }
    await sleep(400);
  }
  const candidates = [...seen.values()].slice(0, 8);
  result[route] = candidates;
  // Contact sheet: numbered tiles for visual review.
  const tiles = [];
  for (const [index, candidate] of candidates.entries()) {
    const bytes = await thumb(candidate.thumb);
    if (!bytes) continue;
    const image = await sharp(bytes).resize(360, 240, { fit: 'cover' }).toBuffer();
    const label = Buffer.from(`<svg width="360" height="34"><rect width="360" height="34" fill="#000" opacity="0.72"/><text x="10" y="23" font-size="18" font-family="Arial" fill="#fff">${index + 1}. ${candidate.license.replace(/[<&>]/g, '')} · ${candidate.width}px</text></svg>`);
    tiles.push({ input: await sharp(image).composite([{ input: label, top: 206, left: 0 }]).toBuffer(), index });
    await sleep(300);
  }
  if (tiles.length) {
    const columns = 4; const rows = Math.ceil(tiles.length / columns);
    const sheet = sharp({ create: { width: columns * 364, height: rows * 244 + 40, channels: 3, background: '#ffffff' } });
    const header = Buffer.from(`<svg width="${columns * 364}" height="40"><text x="10" y="28" font-size="22" font-family="Arial" fill="#000">${route}</text></svg>`);
    await sheet.composite([{ input: header, top: 0, left: 0 }, ...tiles.map((tile, position) => ({ input: tile.input, top: 40 + Math.floor(position / columns) * 244, left: (position % columns) * 364 }))])
      .jpeg({ quality: 70 }).toFile(path.join(outDir, `${route.replace('/', '__')}.jpg`));
  }
  console.log(route, candidates.length);
}
writeFileSync(path.join(outDir, 'candidates.json'), JSON.stringify(result, null, 2));
