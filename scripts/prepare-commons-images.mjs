// Downloads the selected Wikimedia Commons photographs, converts them to CMS-ready WebP files and
// writes a manifest with the full attribution for each file. Nothing is uploaded.
//   node scripts/prepare-commons-images.mjs <picks.json> <candidatesRoot> <outDir>
// picks.json: { "section/slug": ["out" | "out:<route>", candidateNumber], ... } from commons-candidates.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [picksFile, root, outDir] = process.argv.slice(2);
if (!picksFile || !root || !outDir) throw new Error('Usage: prepare-commons-images.mjs <picks.json> <candidatesRoot> <outDir>');
mkdirSync(outDir, { recursive: true });
const USER_AGENT = 'KingdomEncyclopediaBot/1.0 (https://saudiknowledge.com; editorial image research)';
const batch = JSON.parse(readFileSync('docs/editorial-batches/images-20260929.json', 'utf8'));
const picks = JSON.parse(readFileSync(picksFile, 'utf8'));
const sets = {};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const manifest = {};

for (const [route, [source, number]] of Object.entries(picks)) {
  const [dir, from] = source.split(':');
  sets[dir] ??= JSON.parse(readFileSync(path.join(root, dir, 'candidates.json'), 'utf8'));
  const candidate = sets[dir][from ?? route][number - 1];
  // API-provided 2400px derivative (originals are frequently rate-limited).
  const info = await (await fetch(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', titles: candidate.title, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '2400' })}`, { headers: { 'User-Agent': USER_AGENT } })).json();
  const url = info.query.pages[0].imageinfo[0].thumburl ?? info.query.pages[0].imageinfo[0].url;
  let bytes = null;
  for (let attempt = 0; attempt < 5 && !bytes; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) bytes = Buffer.from(await response.arrayBuffer()); else await sleep(3000 * (attempt + 1));
  }
  if (!bytes) throw new Error(`Download failed: ${candidate.title}`);
  const name = `${batch.images[route].filename}.webp`;
  const { width, height, size } = await sharp(bytes).rotate().resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(path.join(outDir, name));
  const title = candidate.title.replace(/^File:/, '');
  const licenseUrl = candidate.licenseUrl ?? (/^cc0/i.test(candidate.license) ? 'https://creativecommons.org/publicdomain/zero/1.0/' : null);
  manifest[route] = {
    file: name, width, height, bytes: size, commonsTitle: title, commonsPage: candidate.page, downloaded: url,
    artist: candidate.artist || candidate.credit || 'Unknown', license: candidate.license, licenseUrl, date: candidate.date,
    attribution: `${title.replace(/\.[a-z]+$/i, '')} — ${candidate.artist || candidate.credit || 'Unknown author'}, via Wikimedia Commons, ${candidate.license}. Source: ${candidate.page}${licenseUrl ? ` ; license: ${licenseUrl}` : ''} . CMS derivative: converted to WebP at quality 85; proportionally resized within 2400 × 2400 without enlargement where needed. / نسخة CMS: تحويل إلى WebP بجودة 85 وتصغير تناسبي عند الحاجة ضمن 2400 × 2400 دون تكبير.`,
    licenseLabel: `${candidate.license}${licenseUrl ? ` — ${licenseUrl}` : ''}`,
  };
  console.log(route, name, `${width}x${height}`, Math.round(size / 1024) + ' KiB', candidate.license);
  await sleep(800);
}
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
