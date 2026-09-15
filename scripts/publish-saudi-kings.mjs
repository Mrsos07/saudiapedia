import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, request } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://localhost:3000';
const mode = process.argv[2];
const locales = ['ar', 'en'];
let stage = 'validating the approved batch';
let browser;
let anonymous;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'id').sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

function articleData(topic, locale) {
  const text = topic[locale];
  return {
    section: topic.section, slug: topic.slug, translationKey: topic.translationKey, locale,
    kind: topic.kind, period: topic.period, featured: Boolean(topic.featured),
    title: text.title, summary: text.summary, category: text.category, imageAlt: text.imageAlt,
    facts: text.facts, body: text.body, sources: text.sources,
    seoTitle: text.seoTitle, seoDescription: text.seoDescription, noIndex: true,
  };
}

function checkArticle(doc, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(canonical(doc[key]), canonical(value), `Article field conflict: ${key}`);
}

async function json(client, route, options = {}) {
  const response = await client.fetch(`${origin}/api/${route}`, { ...options, headers: { Origin: origin }, timeout: 60000 });
  assert.ok(response.ok(), `CMS HTTP ${response.status()}`);
  return response.json();
}

async function lookup(client, collection, fields) {
  const query = new URLSearchParams({ limit: '100', depth: '0', draft: 'false' });
  fields.forEach(([field, value], index) => query.set(`where[or][${index}][${field}][equals]`, value));
  const result = await json(client, `${collection}?${query}`);
  assert.ok(!result.hasNextPage, 'Unexpected duplicate inventory');
  return result.docs;
}

try {
  assert.ok(['--validate', '--publish'].includes(mode), 'Use --validate or explicitly authorize publication with --publish');
  const { topics } = JSON.parse(await readFile(path.join(root, 'docs/editorial-batches/saudi-kings.json'), 'utf8'));
  assert.equal(topics.length, 7);
  assert.equal(new Set(topics.map(topic => topic.slug)).size, 7);
  assert.equal(new Set(topics.map(topic => topic.translationKey)).size, 7);
  const prepared = [];
  for (const topic of topics) {
    assert.equal(topic.section, 'people');
    assert.equal(topic.kind, 'ruler');
    assert.match(topic.slug, /^king-[a-z]+$/);
    for (const locale of locales) {
      const text = topic[locale];
      for (const field of ['title', 'summary', 'category', 'imageAlt', 'seoTitle', 'seoDescription']) assert.ok(text[field]?.trim());
      assert.ok(text.seoTitle.length <= 70 && text.seoDescription.length <= 160);
      assert.ok(text.body.length >= 5 && text.facts.length >= 5 && text.sources.length >= 2);
      for (const row of text.body) assert.ok(row.heading.trim() && row.text.trim());
      for (const row of text.facts) assert.ok(row.label.trim() && row.value.trim());
      for (const source of text.sources) {
        const url = new URL(source.url);
        assert.ok(source.title.trim() && url.protocol === 'https:' && !url.username && !url.password);
      }
    }
    for (const field of ['facts', 'body', 'sources']) assert.equal(topic.ar[field].length, topic.en[field].length);
    assert.deepEqual(topic.ar.sources.map(source => source.url), topic.en.sources.map(source => source.url));
    const buffer = await readFile(path.join(root, 'public/images/kings', `${topic.slug}.webp`));
    assert.ok(buffer.length <= 10 * 1024 * 1024);
    const metadata = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
    assert.equal(metadata.format, 'webp');
    await sharp(buffer, { limitInputPixels: 40000000 }).stats();
    const media = {
      alt: topic.image.altAr,
      attribution: `${topic.image.attribution} Uploaded derivative: converted to WebP at quality 85 and proportionally resized within 1000 × 1200 without enlargement; CMS re-encodes to WebP at quality 85. Card and hero display may crop to fit; no retouching. / الصورة المرفوعة: تحويل إلى WebP وتصغير تناسبي ضمن 1000 × 1200 دون تكبير؛ يعيد CMS ترميزها إلى WebP. قد يقتطع عرض البطاقة أو رأس المقال أطراف الصورة، دون تنقيح.`,
      license: `${topic.image.license} — ${topic.image.licenseUrl}`,
    };
    prepared.push({ topic, buffer, media, existing: [] });
  }
  console.log('Validated seven bilingual biographies and seven decoded portraits.');
  if (mode === '--publish') {
    stage = 'opening a fresh browser for administrator sign-in';
    browser = await chromium.launch({ channel: 'msedge', headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    stage = 'loading the local administration page';
    await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    stage = 'waiting for the operator to sign in as an administrator';
    console.log('Sign in in the opened browser. Credentials and session tokens are never printed or saved by this script.');
    let signedIn = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      const response = await context.request.get(`${origin}/api/users/me`, { headers: { Origin: origin }, timeout: 60000 });
      if (response.ok()) {
        const { user } = await response.json();
        if (user?.role === 'administrator') {
          console.log('Administrator session confirmed; beginning preflight checks.');
          signedIn = true;
          break;
        }
        assert.ok(!user, 'An administrator account is required');
      }
      await delay(2000);
    }
    assert.ok(signedIn, 'Administrator sign-in timed out');
    const client = context.request;
    stage = 'preflight checks; existing editorial content is never overwritten';
    const sections = await lookup(client, 'sections', [['slug', 'people']]);
    assert.equal(sections.length, 1, 'The stable people section must already exist');
    for (const item of prepared) {
      const { topic } = item;
      item.existing = await lookup(client, 'articles', [['translationKey', topic.translationKey], ['slug', topic.slug]]);
      assert.ok(item.existing.length <= 2);
      assert.equal(new Set(item.existing.map(doc => doc.locale)).size, item.existing.length);
      for (const doc of item.existing) {
        assert.ok(locales.includes(doc.locale));
        checkArticle(doc, articleData(topic, doc.locale));
      }
      assert.ok(new Set(item.existing.filter(doc => doc.image).map(doc => doc.image)).size <= 1, 'Translation images conflict');
    }
    const section = sections[0];
    if (section.nameAr !== 'شخصيات بارزة' || section.nameEn !== 'Notable figures') {
      await json(client, `sections/${section.id}`, { method: 'PATCH', data: { nameAr: 'شخصيات بارزة', nameEn: 'Notable figures' } });
    }
    for (const item of prepared) {
      const { topic, media, buffer, existing } = item;
      stage = `preparing ${topic.slug}`;
      const imageID = existing.find(doc => doc.image)?.image;
      const assets = imageID ? [await json(client, `media/${imageID}?depth=0`)]
        : await lookup(client, 'media', [['attribution', media.attribution]]);
      assert.ok(assets.length <= 1, 'Duplicate media requires operator review');
      let asset = assets[0];
      if (asset) {
        for (const [key, value] of Object.entries(media)) assert.equal(asset[key], value, 'Existing media conflicts with approved batch');
      } else {
        const result = await json(client, 'media', { method: 'POST', multipart: {
          _payload: JSON.stringify({ ...media, published: false }),
          file: { name: `${topic.slug}.webp`, mimeType: 'image/webp', buffer },
        } });
        asset = result.doc;
        console.log(JSON.stringify({ slug: topic.slug, mediaCreated: asset.id }));
      }
      const pair = [];
      for (const locale of locales) {
        const data = articleData(topic, locale);
        let doc = existing.find(doc => doc.locale === locale);
        if (!doc) {
          doc = (await json(client, 'articles', { method: 'POST', data: { ...data, image: asset.id, reviewStatus: 'draft', _status: 'draft' } })).doc;
          console.log(JSON.stringify({ slug: topic.slug, locale, draftCreated: doc.id }));
        } else if (!doc.image) {
          doc = (await json(client, `articles/${doc.id}`, { method: 'PATCH', data: { image: asset.id, reviewStatus: 'draft', _status: 'draft' } })).doc;
        }
        const stored = await json(client, `articles/${doc.id}?depth=0&draft=false`);
        checkArticle(stored, { ...data, image: asset.id });
        pair.push(stored);
      }
      assert.deepEqual(pair[0].authors ?? [], pair[1].authors ?? []);
      assert.equal(pair[0].categoryRef ?? null, pair[1].categoryRef ?? null);
      stage = `publishing the explicitly authorized ${topic.slug} pair and portrait`;
      if (!asset.published) await json(client, `media/${asset.id}`, { method: 'PATCH', data: { published: true } });
      for (const doc of pair) {
        if (doc.reviewStatus !== 'approved' || doc._status !== 'published') {
          await json(client, `articles/${doc.id}`, { method: 'PATCH', data: { reviewStatus: 'approved', _status: 'published' } });
        }
      }
      console.log(JSON.stringify({ slug: topic.slug, articles: pair.map(doc => doc.id), media: asset.id, published: true }));
    }
    stage = 'verifying anonymous access to all fourteen documents and seven images';
    anonymous = await request.newContext();
    for (const { topic } of prepared) {
      const docs = await lookup(anonymous, 'articles', [['translationKey', topic.translationKey]]);
      assert.equal(docs.length, 2);
      for (const locale of locales) {
        const doc = docs.find(doc => doc.locale === locale);
        assert.ok(doc);
        checkArticle(doc, articleData(topic, locale));
        assert.equal(doc.reviewStatus, 'approved');
        assert.equal(doc._status, 'published');
      }
      assert.equal(docs[0].image, docs[1].image);
      const asset = await json(anonymous, `media/${docs[0].image}?depth=0`);
      assert.equal(asset.published, true);
      const url = new URL(asset.url, origin);
      assert.equal(url.origin, origin);
      assert.ok(url.pathname.startsWith('/api/media/file/'));
      const response = await anonymous.get(url.href);
      assert.equal(response.status(), 200);
      assert.ok(response.headers()['content-type'].startsWith('image/webp'));
      await sharp(await response.body()).stats();
    }
    console.log('Verified: 14 approved published articles, 7 publicly accessible decoded portraits. Indexing settings unchanged.');
    await page.goto(`${origin}/ar/notable-figures`);
  }
} catch {
  console.error(`Operation stopped while ${stage}. No records were deleted. Successful writes are retained; reruns check existing content before proceeding.`);
  process.exitCode = 1;
} finally {
  await anonymous?.dispose();
  await browser?.close();
}
