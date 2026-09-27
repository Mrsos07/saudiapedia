// Replaces one king's portrait in the CMS without touching article text, IDs, URLs or associations.
// Validate offline:  node scripts/replace-king-image.mjs --validate king-fahd
// Apply (operator signs in as administrator in a fresh Edge window):
//                    node scripts/replace-king-image.mjs --replace king-fahd [--port=3000]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, request } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const [mode, slug] = process.argv.slice(2);
const port = process.argv.find(arg => arg.startsWith('--port='))?.slice(7) ?? '3000';
const origin = `http://localhost:${port}`;
const locales = ['ar', 'en'];
const protectedFields = ['id', 'translationKey', 'slug', 'section', 'locale', 'kind', 'period', 'featured', 'title', 'summary', 'category',
  'facts', 'body', 'sources', 'seoTitle', 'seoDescription', 'canonicalURL', 'noIndex', 'authors', 'categoryRef', 'createdAt'];
let stage = 'validating the approved portrait';
let browser;
let anonymous;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'id').sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

async function json(client, route, options = {}) {
  const response = await client.fetch(`${origin}/api/${route}`, { ...options, headers: { Origin: origin }, timeout: 60000 });
  if (!response.ok()) console.error(JSON.stringify({ method: options.method ?? 'GET', route: route.split('?')[0], status: response.status() }));
  assert.ok(response.ok(), `CMS HTTP ${response.status()}`);
  return response.json();
}

async function lookup(client, collection, field, value) {
  const query = new URLSearchParams({ limit: '100', depth: '0', draft: 'false', [`where[${field}][equals]`]: value });
  const result = await json(client, `${collection}?${query}`);
  assert.ok(!result.hasNextPage, 'Unexpected duplicate inventory');
  return result.docs;
}

try {
  assert.ok(['--validate', '--replace'].includes(mode), 'Use --validate or explicitly authorize the replacement with --replace');
  assert.match(port, /^\d{4,5}$/);
  const { topics } = JSON.parse(await readFile(path.join(root, 'docs/editorial-batches/saudi-kings.json'), 'utf8'));
  const topic = topics.find(item => item.slug === slug);
  assert.ok(topic && topic.kind === 'ruler' && topic.section === 'people', 'Name a king from the approved batch');
  for (const locale of locales) assert.equal(topic[locale].imageAlt, topic.image[locale === 'ar' ? 'altAr' : 'altEn'], 'Batch alt text must match the image record');
  const buffer = await readFile(path.join(root, 'public/images/kings', `${slug}.webp`));
  assert.ok(buffer.length <= 10 * 1024 * 1024);
  const metadata = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.pages ?? 1, 1);
  await sharp(buffer, { limitInputPixels: 40000000 }).stats();
  const media = {
    alt: topic.image.altAr,
    attribution: `${topic.image.attribution} Uploaded derivative: converted to WebP at quality 85 and proportionally resized within 1000 × 1200 without enlargement; CMS re-encodes to WebP at quality 85. Card and hero display may crop to fit; no retouching. / الصورة المرفوعة: تحويل إلى WebP وتصغير تناسبي ضمن 1000 × 1200 دون تكبير؛ يعيد CMS ترميزها إلى WebP. قد يقتطع عرض البطاقة أو رأس المقال أطراف الصورة، دون تنقيح.`,
    license: `${topic.image.license} — ${topic.image.licenseUrl}`,
  };
  console.log(`Validated ${slug}: ${metadata.width} × ${metadata.height} WebP, ${buffer.length} bytes, bilingual alt text and credit.`);

  if (mode === '--replace') {
    stage = 'opening a fresh browser for administrator sign-in';
    browser = await chromium.launch({ channel: 'msedge', headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    stage = 'waiting for the operator to sign in as an administrator';
    console.log('Sign in in the opened browser. Credentials and session tokens are never printed or saved by this script.');
    let signedIn = false;
    for (let attempt = 0; attempt < 600 && !signedIn; attempt++) {
      const response = await context.request.get(`${origin}/api/users/me`, { headers: { Origin: origin }, timeout: 60000 });
      if (response.ok()) {
        const { user } = await response.json();
        assert.ok(!user || user.role === 'administrator', 'An administrator account is required');
        signedIn = user?.role === 'administrator';
      }
      if (!signedIn) await delay(2000);
    }
    assert.ok(signedIn, 'Administrator sign-in timed out');
    console.log('Administrator session confirmed; beginning preflight checks.');
    await page.goto('about:blank');
    const client = context.request;

    stage = 'preflight: both published translations must exist unchanged and share one image';
    const originals = await lookup(client, 'articles', 'translationKey', topic.translationKey);
    assert.equal(originals.length, 2, 'Exactly two translations are required');
    for (const locale of locales) {
      const doc = originals.find(item => item.locale === locale);
      assert.ok(doc, `Missing ${locale} translation`);
      assert.equal(doc.slug, slug);
      assert.equal(doc.section, topic.section);
      assert.equal(doc._status, 'published');
      assert.equal(doc.reviewStatus, 'approved');
      for (const field of ['title', 'summary', 'category', 'facts', 'body', 'sources']) {
        assert.ok(same(doc[field], topic[locale][field]), `Stored ${locale} ${field} differs from the batch; refusing to overwrite editorial changes`);
      }
    }
    assert.equal(originals[0].image, originals[1].image, 'Translation images conflict');
    const previousImage = originals[0].image;

    stage = 'uploading or reusing the approved portrait';
    const assets = await lookup(client, 'media', 'attribution', media.attribution);
    assert.ok(assets.length <= 1, 'Duplicate media requires operator review');
    let asset = assets[0];
    if (asset) {
      for (const [key, value] of Object.entries(media)) assert.equal(asset[key], value, 'Existing media conflicts with the approved record');
    } else {
      asset = (await json(client, 'media', { method: 'POST', multipart: {
        _payload: JSON.stringify({ ...media, published: false }),
        file: { name: `${slug}.webp`, mimeType: 'image/webp', buffer },
      } })).doc;
      console.log(JSON.stringify({ slug, mediaCreated: asset.id }));
    }
    assert.notEqual(asset.id, undefined);
    if (!asset.published) await json(client, `media/${asset.id}`, { method: 'PATCH', data: { published: true } });

    stage = 'switching both translations to the new portrait';
    const pending = [];
    for (const locale of locales) {
      const doc = originals.find(item => item.locale === locale);
      const latest = await json(client, `articles/${doc.id}?depth=0&draft=false`);
      assert.equal(latest.updatedAt, doc.updatedAt, 'Concurrent editorial change; refusing to overwrite');
      if (latest.image === asset.id && latest.imageAlt === topic[locale].imageAlt) continue;
      pending.push({ doc, data: { image: asset.id, imageAlt: topic[locale].imageAlt, reviewStatus: 'approved', _status: 'published' } });
    }
    // Sent together so the public pair is mismatched for as short a time as possible.
    await Promise.all(pending.map(({ doc, data }) => json(client, `articles/${doc.id}?depth=0`, { method: 'PATCH', data })));
    for (const locale of locales) {
      const original = originals.find(item => item.locale === locale);
      const stored = await json(client, `articles/${original.id}?depth=0&draft=false`);
      for (const field of protectedFields) assert.ok(same(stored[field], original[field]), `Protected field changed: ${field}`);
      assert.equal(stored.image, asset.id);
      assert.equal(stored.imageAlt, topic[locale].imageAlt);
      assert.equal(stored._status, 'published');
      assert.equal(stored.reviewStatus, 'approved');
    }
    console.log(JSON.stringify({ slug, articles: originals.map(doc => doc.id), media: asset.id, previousMedia: previousImage, previousMediaRetained: true }));

    stage = 'verifying anonymous access to both translations and the new portrait';
    anonymous = await request.newContext();
    const docs = await lookup(anonymous, 'articles', 'translationKey', topic.translationKey);
    assert.equal(docs.length, 2);
    for (const doc of docs) {
      assert.equal(doc.image, asset.id);
      assert.equal(doc.imageAlt, topic[doc.locale].imageAlt);
    }
    const publicAsset = await json(anonymous, `media/${asset.id}?depth=0`);
    assert.equal(publicAsset.published, true);
    const url = new URL(publicAsset.url, origin);
    assert.equal(url.origin, origin);
    assert.ok(url.pathname.startsWith('/api/media/file/'));
    const response = await anonymous.get(url.href);
    assert.equal(response.status(), 200);
    assert.ok(response.headers()['content-type'].startsWith('image/webp'));
    await sharp(await response.body()).stats();
    console.log(`Verified: both ${slug} translations publicly use media ${asset.id}. Previous media ${previousImage} was not deleted or changed.`);
    await page.goto(`${origin}/ar/people/${slug}`, { waitUntil: 'domcontentloaded' });
  }
} catch {
  console.error(`Operation stopped while ${stage}. No records were deleted. Successful writes are retained; reruns check existing content before proceeding.`);
  process.exitCode = 1;
} finally {
  await anonymous?.dispose();
  await browser?.close();
}
