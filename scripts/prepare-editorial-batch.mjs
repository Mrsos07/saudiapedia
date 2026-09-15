// Downloads/validates licensed research assets only. Never connects to the CMS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const batch = process.argv[2];
assert.ok(batch === undefined || ['saudi-states', 'saudi-kings'].includes(batch), 'Supported batches: saudi-states, saudi-kings');
const expectedCount = batch === 'saudi-states' ? 3 : batch === 'saudi-kings' ? 7 : 12;
const output = path.join(root, '.editorial-staging', ...(batch ? [batch] : []));
await mkdir(output, { recursive: true });
const portraits = batch === 'saudi-kings' ? path.join(root, 'public/images/kings') : null;
if (portraits) await mkdir(portraits, { recursive: true });
const topics = [];
for (const name of batch ? [`${batch}.json`] : ['initial-people-heritage.json', 'initial-history-regions.json']) {
  topics.push(...JSON.parse(await readFile(path.join(root, 'docs/editorial-batches', name), 'utf8')).topics);
}
assert.equal(topics.length, expectedCount);
assert.equal(new Set(topics.map(t => t.translationKey)).size, expectedCount);
const localImages = { 'first-saudi-state': 'diriyah.jpg', 'diriyah-history': 'diriyah.jpg', riyadh: 'riyadh.jpg', asir: 'mountains.jpg', 'alula-geography': 'desert.jpg' };
const prepared = [];
for (const topic of topics) {
  assert.match(topic.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  for (const locale of ['ar', 'en']) {
    const text = topic[locale];
    for (const field of ['title', 'summary', 'category', 'seoTitle', 'seoDescription', 'imageAlt']) assert.ok(text[field]?.trim());
    assert.ok(text.seoTitle.length <= 70 && text.seoDescription.length <= 160);
    for (const row of text.body) assert.ok(row.heading.trim() && row.text.trim());
    for (const row of text.facts) assert.ok(row.label.trim() && row.value.trim());
    assert.ok(text.sources.length);
    for (const source of text.sources) assert.ok(source.title.trim() && ['https:', 'http:'].includes(new URL(source.url).protocol));
  }
  for (const field of ['facts', 'body', 'sources']) assert.equal(topic.ar[field].length, topic.en[field].length);
  assert.deepEqual(topic.ar.sources.map(s => s.url), topic.en.sources.map(s => s.url));
  const fileName = `${topic.slug}.jpg`;
  let bytes;
  let actualDownloadURL = topic.image.downloadUrl;
  let wikimediaResize = false;
  if (localImages[topic.slug]) {
    bytes = await readFile(path.join(root, 'public/images', localImages[topic.slug]));
    actualDownloadURL = `local:public/images/${localImages[topic.slug]}`;
  } else {
    try {
      bytes = await readFile(path.join(output, fileName));
      try {
        const prior = JSON.parse(await readFile(path.join(output, `${fileName}.json`), 'utf8'));
        actualDownloadURL = prior.actualDownloadURL;
        wikimediaResize = prior.wikimediaResize;
      } catch { /* Previously downloaded original. */ }
    }
    catch {
      const url = new URL(topic.image.downloadUrl);
      assert.equal(url.protocol, 'https:');
      assert.ok(['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname));
      let response = await fetch(url, {
        headers: { 'User-Agent': 'KingdomEncyclopediaEditorial/0.1 (licensed research draft preparation)' },
        signal: AbortSignal.timeout(60000),
      });
      if (response.status === 429) {
        const title = decodeURIComponent(new URL(topic.image.sourceUrl).pathname.slice('/wiki/'.length));
        const api = new URL('https://commons.wikimedia.org/w/api.php');
        api.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: batch === 'saudi-kings' ? '960' : '1920', titles: title }).toString();
        const lookup = await fetch(api, { signal: AbortSignal.timeout(30000) });
        assert.ok(lookup.ok);
        const info = Object.values((await lookup.json()).query.pages)[0].imageinfo[0];
        const derivative = new URL(info.thumburl);
        assert.equal(derivative.protocol, 'https:');
        assert.equal(derivative.hostname, 'thumb.wikimedia.org');
        actualDownloadURL = derivative.href;
        wikimediaResize = true;
        response = await fetch(derivative, { signal: AbortSignal.timeout(60000) });
      }
      assert.equal(response.status, 200, `${topic.slug}: download HTTP ${response.status}`);
      assert.ok(response.headers.get('content-type')?.startsWith('image/'));
      bytes = Buffer.from(await response.arrayBuffer());
    }
  }
  assert.ok(bytes.length <= 10 * 1024 * 1024, `${topic.slug}: image exceeds 10 MiB`);
  const meta = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
  assert.equal(meta.format, 'jpeg');
  // Force full pixel decoding; metadata-only reads do not validate truncated files.
  await sharp(bytes, { limitInputPixels: 40000000 }).stats();
  if (portraits) {
    await sharp(bytes, { limitInputPixels: 40000000 })
      .resize({ width: 1000, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toFile(path.join(portraits, `${topic.slug}.webp`));
  }
  await writeFile(path.join(output, fileName), bytes);
  await writeFile(path.join(output, `${fileName}.json`), JSON.stringify({ actualDownloadURL, wikimediaResize }));
  const prior = topic.image.attribution
    .replace(/No (?:further )?changes made for this batch\./g, '')
    .replace(/Renamed locally; image unchanged\./g, 'Renamed locally.');
  const modifications = 'CMS derivative: converted to WebP at quality 85; proportionally resized within 2400 × 2400 without enlargement where needed. Card/hero display may crop to fit; original composition is not retouched. / نسخة CMS: تحويل إلى WebP بجودة 85 وتصغير تناسبي عند الحاجة ضمن 2400 × 2400 دون تكبير؛ قد يقتطع العرض داخل البطاقات أو رأس المقال أطراف الصورة، دون تنقيح محتواها.';
  prepared.push({
    ...topic, fileName,
    media: { alt: topic.image.altAr, attribution: `${prior.trim()} ${wikimediaResize ? 'Proportionally resized by Wikimedia. ' : ''}${modifications}`, license: `${topic.image.license} — ${topic.image.licenseUrl}`, published: false },
    file: { bytes: bytes.length, width: meta.width, height: meta.height, sha256: createHash('sha256').update(bytes).digest('hex'), actualDownloadURL },
  });
  console.log(JSON.stringify({ slug: topic.slug, fileName, bytes: bytes.length, width: meta.width, height: meta.height }));
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ topics: prepared }, null, 2));
console.log(`Prepared ${expectedCount} topics and ${expectedCount} validated JPEGs. No CMS writes.`);