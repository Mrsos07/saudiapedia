import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, request } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const origin = 'http://localhost:3000';
const mode = process.argv[2];
const batchName = process.argv[3] ?? 'saudi-kings';
const discovery = batchName === 'discovery-20260916';
const regional = batchName === 'regions-20260917';
const illustrated = discovery || regional;
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

function articleData(topic, locale, existing) {
  const text = topic[locale];
  const data = {
    section: topic.section, slug: topic.slug, translationKey: topic.translationKey, locale,
    kind: topic.kind ?? null, period: topic.period ?? null, featured: Boolean(topic.featured),
    title: text.title, summary: text.summary, category: text.category, imageAlt: text.imageAlt,
    facts: text.facts, body: text.body, sources: text.sources,
    seoTitle: text.seoTitle, seoDescription: text.seoDescription, noIndex: !regional,
  };
  if (regional && existing) {
    for (const key of ['imageAlt', 'period', 'kind', 'featured']) data[key] = existing[key] ?? (key === 'featured' ? false : null);
  }
  return data;
}

function matchesArticle(doc, expected) {
  return Object.entries(expected).every(([key, value]) => JSON.stringify(canonical(doc[key])) === JSON.stringify(canonical(value)));
}

function checkArticle(doc, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(canonical(doc[key]), canonical(value), `Article field conflict: ${key}`);
}

async function json(client, route, options = {}) {
  const response = await client.fetch(`${origin}/api/${route}`, { ...options, headers: { Origin: origin }, timeout: 60000 });
  if (!response.ok()) console.error(JSON.stringify({ method: options.method ?? 'GET', route: route.split('?')[0], status: response.status() }));
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

async function illustration(theme) {
  const drawings = {
    mountains: '<circle cx="970" cy="150" r="75" fill="#bfa167"/><path d="M0 600 L270 140 L510 470 L730 170 L1200 620 V720 H0Z" fill="#738c77"/><path d="M0 650 L330 360 L550 610 L880 320 L1200 620 V720 H0Z" fill="#315d4b"/><path d="M0 680 Q400 590 740 665 T1200 640 V720 H0Z" fill="#bca880"/>',
    economy: '<circle cx="960" cy="190" r="90" fill="#b78b44"/><path d="M0 580 Q300 390 650 520 T1200 430 V720 H0Z" fill="#dfd2b7"/><rect x="220" y="330" width="140" height="260" rx="14" fill="#1e5745"/><rect x="400" y="230" width="140" height="360" rx="14" fill="#347763"/><rect x="580" y="130" width="140" height="460" rx="14" fill="#143d34"/><path d="M180 615 H920" stroke="#b78b44" stroke-width="8"/>',
    coast: '<rect y="280" width="1200" height="440" fill="#3c8a97"/><path d="M0 510 Q180 420 370 530 T770 520 T1200 490 V720 H0Z" fill="#246774"/><ellipse cx="370" cy="330" rx="210" ry="70" fill="#d8c795"/><ellipse cx="840" cy="460" rx="145" ry="48" fill="#ded1ac"/><path d="M210 315 Q370 190 510 315Z" fill="#42775d"/><circle cx="960" cy="140" r="65" fill="#c8a05c"/>',
    desert: '<circle cx="880" cy="180" r="85" fill="#c7a15c"/><path d="M0 470 Q230 180 620 430 T1200 290 V720 H0Z" fill="#dab97c"/><path d="M0 560 Q460 240 780 510 T1200 490 V720 H0Z" fill="#b7894e"/><path d="M0 650 Q360 510 700 650 T1200 590 V720 H0Z" fill="#8b673e"/>',
    culture: '<circle cx="940" cy="170" r="90" fill="#bca06c"/><rect x="180" y="200" width="540" height="360" rx="18" fill="#c4aa7f"/><path d="M260 560 V355 A75 75 0 0 1 150 0 V560Z" fill="#245344"/><path d="M460 560 V355 A75 75 0 0 1 150 0 V560Z" fill="#e5d8b9"/><rect x="775" y="335" width="75" height="225" rx="9" fill="#2f6b57"/><rect x="865" y="285" width="75" height="275" rx="9" fill="#547d67"/><path d="M130 590 H1030" stroke="#b78b44" stroke-width="10"/>',
  };
  assert.ok(Object.hasOwn(drawings, theme), 'Unknown illustration theme');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="1200" height="720" fill="#f1eadb"/>${drawings[theme]}</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}

try {
  assert.ok(['--validate', '--publish'].includes(mode), 'Use --validate or explicitly authorize publication with --publish');
  assert.ok(['saudi-kings', 'discovery-20260916', 'regions-20260917'].includes(batchName), 'Unsupported batch');
  const { topics, sections: batchSections = [], updateExisting = [], researchDate = '2026-09-16' } = JSON.parse(await readFile(path.join(root, 'docs/editorial-batches', `${batchName}.json`), 'utf8'));
  const count = regional ? 13 : discovery ? 6 : 7;
  if (regional) {
    assert.deepEqual(topics.map(topic => topic.slug), ['riyadh', 'makkah', 'madinah', 'qassim', 'eastern-province', 'asir', 'tabuk', 'hail', 'northern-borders', 'jazan', 'najran', 'bahah', 'jawf']);
    assert.deepEqual(updateExisting, ['riyadh', 'asir']);
    for (const locale of locales) {
      assert.equal(new Set(topics.map(topic => topic[locale].seoTitle)).size, 13);
      assert.equal(new Set(topics.map(topic => topic[locale].seoDescription)).size, 13);
    }
  }
  assert.equal(topics.length, count);
  assert.equal(new Set(topics.map(topic => topic.slug)).size, count);
  assert.equal(new Set(topics.map(topic => topic.translationKey)).size, count);
  if (discovery) {
    assert.deepEqual(batchSections.map(section => section.slug).sort(), ['economy', 'nature', 'tourism']);
    for (const section of batchSections) {
      assert.ok(section.nameAr.trim() && section.nameEn.trim() && Number.isFinite(section.order));
      assert.equal(topics.filter(topic => topic.section === section.slug).length, 2);
    }
  }
  const prepared = [];
  for (const topic of topics) {
    assert.ok(regional ? topic.section === 'regions' : discovery ? batchSections.some(section => section.slug === topic.section) : topic.section === 'people');
    assert.equal(topic.kind, illustrated ? undefined : 'ruler');
    assert.match(topic.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(topic.translationKey.length <= 160);
    if (illustrated) assert.equal(topic.image.type, 'illustration');
    for (const locale of locales) {
      const text = topic[locale];
      for (const field of ['title', 'summary', 'category', 'imageAlt', 'seoTitle', 'seoDescription']) assert.ok(text[field]?.trim());
      assert.ok(text.seoTitle.length <= 70 && text.seoDescription.length <= 160);
      assert.ok(text.body.length >= (illustrated ? 4 : 5) && text.facts.length >= (illustrated ? 4 : 5) && text.sources.length >= 2);
      for (const row of text.body) assert.ok(row.heading.trim() && row.text.trim());
      for (const row of text.facts) assert.ok(row.label.trim() && row.value.trim());
      for (const source of text.sources) {
        const url = new URL(source.url);
        assert.ok(source.title.trim() && url.protocol === 'https:' && !url.username && !url.password);
      }
    }
    for (const field of ['facts', 'body', 'sources']) assert.equal(topic.ar[field].length, topic.en[field].length);
    assert.deepEqual(topic.ar.sources.map(source => source.url), topic.en.sources.map(source => source.url));
    const buffer = illustrated ? await illustration(topic.image.theme)
      : await readFile(path.join(root, 'public/images/kings', `${topic.slug}.webp`));
    assert.ok(buffer.length <= 10 * 1024 * 1024);
    const metadata = await sharp(buffer, { limitInputPixels: 40000000 }).metadata();
    assert.equal(metadata.format, 'webp');
    await sharp(buffer, { limitInputPixels: 40000000 }).stats();
    const media = illustrated ? {
      alt: topic.ar.imageAlt,
      attribution: `Original programmatically generated illustration for Kingdom Encyclopedia (${topic.slug}), ${researchDate}. No third-party photographs, logos or source artwork used. WebP, 1200 × 720; display may crop to fit. / رسم توضيحي أصلي أُنشئ برمجيًا لموسوعة المملكة، دون استخدام صور أو شعارات أو رسوم من مصادر خارجية. ليس تصويرًا وثائقيًا.`,
      license: 'Original project illustration — for use in Kingdom Encyclopedia / رسم أصلي للمشروع — للاستخدام في موسوعة المملكة',
    } : {
      alt: topic.image.altAr,
      attribution: `${topic.image.attribution} Uploaded derivative: converted to WebP at quality 85 and proportionally resized within 1000 × 1200 without enlargement; CMS re-encodes to WebP at quality 85. Card and hero display may crop to fit; no retouching. / الصورة المرفوعة: تحويل إلى WebP وتصغير تناسبي ضمن 1000 × 1200 دون تكبير؛ يعيد CMS ترميزها إلى WebP. قد يقتطع عرض البطاقة أو رأس المقال أطراف الصورة، دون تنقيح.`,
      license: `${topic.image.license} — ${topic.image.licenseUrl}`,
    };
    prepared.push({ topic, buffer, media, existing: [], expected: {} });
  }
  console.log(`Validated ${count} bilingual topics and ${count} decoded images for ${batchName}.`);
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
    await page.goto('about:blank');
    const client = context.request;
    stage = 'preflight checks; updates are limited to explicitly authorized regional articles';
    const intendedSections = regional ? (await lookup(client, 'sections', [['slug', 'regions']])).map(({ slug, nameAr, nameEn }) => ({ slug, nameAr, nameEn }))
      : discovery ? batchSections : [{ slug: 'people', nameAr: 'شخصيات بارزة', nameEn: 'Notable figures' }];
    if (regional) assert.equal(intendedSections.length, 1, 'The existing regions section is required');
    const sectionStates = [];
    for (const section of intendedSections) {
      const docs = await lookup(client, 'sections', [['slug', section.slug]]);
      assert.ok(docs.length <= 1, 'Duplicate section');
      if (!discovery) assert.equal(docs.length, 1, 'The existing section must already be present');
      if (discovery && docs[0]) {
        assert.equal(docs[0].nameAr, section.nameAr, 'Existing section label conflict');
        assert.equal(docs[0].nameEn, section.nameEn, 'Existing section label conflict');
      }
      sectionStates.push({ intended: section, existing: docs[0] });
    }
    for (const item of prepared) {
      const { topic } = item;
      item.existing = await lookup(client, 'articles', [['translationKey', topic.translationKey], ['slug', topic.slug]]);
      assert.ok(item.existing.length <= 2);
      assert.equal(new Set(item.existing.map(doc => doc.locale)).size, item.existing.length);
      for (const doc of item.existing) {
        assert.ok(locales.includes(doc.locale));
        if (regional && updateExisting.includes(topic.slug)) {
          checkArticle(doc, { section: topic.section, slug: topic.slug, translationKey: topic.translationKey, _status: 'published', reviewStatus: 'approved' });
          assert.ok(doc.image && doc.imageAlt?.trim(), 'Existing region media must be preserved');
        } else checkArticle(doc, articleData(topic, doc.locale, doc));
      }
      assert.ok(new Set(item.existing.filter(doc => doc.image).map(doc => doc.image)).size <= 1, 'Translation images conflict');
      if (regional && item.existing.length === 2) {
        assert.deepEqual(item.existing[0].authors ?? [], item.existing[1].authors ?? []);
        assert.equal(item.existing[0].categoryRef ?? null, item.existing[1].categoryRef ?? null);
      }
    }
    for (const { intended, existing } of sectionStates) {
      if (!existing) {
        const result = await json(client, 'sections', { method: 'POST', data: intended });
        console.log(JSON.stringify({ sectionCreated: result.doc.id, slug: intended.slug }));
      } else if (!illustrated && (existing.nameAr !== intended.nameAr || existing.nameEn !== intended.nameEn)) {
        await json(client, `sections/${existing.id}`, { method: 'PATCH', data: { nameAr: intended.nameAr, nameEn: intended.nameEn } });
      }
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
        if (regional && updateExisting.includes(topic.slug) && imageID) assert.equal(asset.published, true, 'Existing region image must already be public');
        else for (const [key, value] of Object.entries(media)) assert.equal(asset[key], value, 'Existing media conflicts with approved batch');
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
        let doc = existing.find(doc => doc.locale === locale);
        const original = doc;
        const data = articleData(topic, locale, original);
        if (!doc) {
          doc = (await json(client, 'articles', { method: 'POST', data: { ...data, image: asset.id, reviewStatus: 'draft', _status: 'draft' } })).doc;
          console.log(JSON.stringify({ slug: topic.slug, locale, draftCreated: doc.id }));
        } else if (regional && updateExisting.includes(topic.slug) && !matchesArticle(doc, { ...data, image: asset.id })) {
          const latest = await json(client, `articles/${doc.id}?depth=0&draft=false`);
          assert.equal(latest.updatedAt, doc.updatedAt, 'Concurrent editorial change; refusing to overwrite');
          doc = (await json(client, `articles/${doc.id}?depth=0`, { method: 'PATCH', data: { ...data, image: asset.id, reviewStatus: 'approved', _status: 'published' } })).doc;
          console.log(JSON.stringify({ slug: topic.slug, locale, existingUpdated: doc.id }));
        } else if (!doc.image) {
          doc = (await json(client, `articles/${doc.id}`, { method: 'PATCH', data: { image: asset.id, reviewStatus: 'draft', _status: 'draft' } })).doc;
        }
        const stored = await json(client, `articles/${doc.id}?depth=0&draft=false`);
        item.expected[locale] = { ...data, image: asset.id };
        checkArticle(stored, item.expected[locale]);
        if (regional && original) {
          for (const key of ['id', 'translationKey', 'slug', 'section', 'locale', 'image', 'imageAlt', 'authors', 'categoryRef', 'canonicalURL', 'createdAt']) {
            assert.deepEqual(canonical(stored[key]), canonical(original[key]), `Protected field changed: ${key}`);
          }
        }
        pair.push(stored);
      }
      assert.deepEqual(pair[0].authors ?? [], pair[1].authors ?? []);
      assert.equal(pair[0].categoryRef ?? null, pair[1].categoryRef ?? null);
      stage = `publishing the explicitly authorized ${topic.slug} pair and image`;
      if (!asset.published) await json(client, `media/${asset.id}`, { method: 'PATCH', data: { published: true } });
      for (const doc of pair) {
        if (doc.reviewStatus !== 'approved' || doc._status !== 'published') {
          await json(client, `articles/${doc.id}`, { method: 'PATCH', data: { reviewStatus: 'approved', _status: 'published' } });
        }
      }
      console.log(JSON.stringify({ slug: topic.slug, articles: pair.map(doc => doc.id), media: asset.id, published: true }));
    }
    stage = 'verifying anonymous access to the sections, bilingual documents and images';
    anonymous = await request.newContext();
    for (const section of intendedSections) {
      const docs = await lookup(anonymous, 'sections', [['slug', section.slug]]);
      assert.equal(docs.length, 1);
      assert.equal(docs[0].nameAr, section.nameAr);
      assert.equal(docs[0].nameEn, section.nameEn);
    }
    for (const { topic, expected } of prepared) {
      const docs = await lookup(anonymous, 'articles', [['translationKey', topic.translationKey]]);
      assert.equal(docs.length, 2);
      for (const locale of locales) {
        const doc = docs.find(doc => doc.locale === locale);
        assert.ok(doc);
        checkArticle(doc, expected[locale]);
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
    console.log(`Verified: ${count * 2} approved published articles, ${count} publicly accessible decoded images. Site-wide indexing settings unchanged.`);
    await page.goto(`${origin}/ar/${regional ? 'regions' : discovery ? 'economy' : 'notable-figures'}`, { waitUntil: 'domcontentloaded' });
  }
} catch {
  console.error(`Operation stopped while ${stage}. No records were deleted. Successful writes are retained; reruns check existing content before proceeding.`);
  process.exitCode = 1;
} finally {
  await anonymous?.dispose();
  await browser?.close();
}
