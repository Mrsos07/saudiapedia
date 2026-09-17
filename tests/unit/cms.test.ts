import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import type { PayloadRequest } from 'payload';
import { cmsConfigured, getCMSEntries, mergePair, readCMSEntries, type CMSReader } from '../../src/lib/cms';
import { decodePublicArticle } from '../../src/collections/public-articles';
import { readPairedArticles } from '../../src/collections/Articles';
import { publishedArticleWhere } from '../../src/collections/access';
import { GET } from '../../src/app/(payload)/api/[...slug]/route';

test('only fully empty CMS configuration permits demo; partial and weak settings fail before imports', async () => {
  const originalURL = process.env.DATABASE_URL;
  const originalSecret = process.env.PAYLOAD_SECRET;
  try {
    for (const [url, secret] of [['', ''], ['   ', '   ']]) {
      process.env.DATABASE_URL = url;
      process.env.PAYLOAD_SECRET = secret;
      assert.equal(cmsConfigured(), false);
      assert.equal(await getCMSEntries(), null);
      const response = await GET(new Request('http://localhost/api/articles'), { params: Promise.resolve({ slug: ['articles'] }) });
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    }
    for (const [url, secret] of [['   ', 'test-only'], ['postgresql://unused.invalid/test', '']]) {
      process.env.DATABASE_URL = url;
      process.env.PAYLOAD_SECRET = secret;
      assert.throws(cmsConfigured, /Incomplete CMS configuration/);
      await assert.rejects(getCMSEntries(), /Incomplete CMS configuration/);
    }
    process.env.DATABASE_URL = 'postgresql://unused.invalid/test';
    process.env.PAYLOAD_SECRET = 'test-only-not-a-real-secret';
    assert.throws(cmsConfigured, /at least 32 random characters/);
    await assert.rejects(getCMSEntries(), /at least 32 random characters/);
    process.env.PAYLOAD_SECRET = 'test-only-not-a-real-secret-32-characters';
    assert.equal(cmsConfigured(), true);
    // Never initialize a real adapter in unit tests.
  } finally {
    if (originalURL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalURL;
    if (originalSecret === undefined) delete process.env.PAYLOAD_SECRET;
    else process.env.PAYLOAD_SECRET = originalSecret;
  }
});

function article(locale: 'ar' | 'en', overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: locale === 'ar' ? 1 : 2, locale, translationKey: 'pair-one', section: 'people', slug: 'sample-person',
    title: locale === 'ar' ? 'عنوان تجريبي' : 'Test title', summary: 'Summary', category: 'Category',
    _status: 'published', reviewStatus: 'approved',
    body: [{ heading: 'Heading', text: 'Text' }], sources: [{ title: 'Reference', url: 'https://example.org/reference' }],
    ...overrides,
  };
}

function reader(pages: unknown[][], inspect?: (options: Parameters<CMSReader['find']>[0]) => void): CMSReader {
  return { find: async (options) => {
    inspect?.(options);
    const page = options.page ?? 1;
    return { docs: pages[page - 1] ?? [], hasNextPage: page < pages.length };
  } };
}

test('public reader validates access flags, pagination and pairing across page boundaries', async () => {
  const pages: number[] = [];
  const entries = await readCMSEntries(reader([[article('en')], [article('ar')]], (options) => {
    assert.equal(options.collection, 'articles');
    assert.equal(options.overrideAccess, false);
    assert.equal(options.user, null);
    assert.equal(options.draft, false);
    assert.equal(options.depth, 1);
    assert.equal(options.limit, 100);
    assert.deepEqual(options.where, publishedArticleWhere);
    pages.push(options.page ?? 1);
  }));
  assert.deepEqual(pages, [1, 2]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title.en, 'Test title');
  assert.deepEqual(await readCMSEntries(reader([[article('ar')]])), []);
  assert.deepEqual(await readCMSEntries(reader([[]])), []);
});

test('runtime decoder rejects malformed or nonpublic documents before array access', async () => {
  const bad: unknown[] = [null, [], 42, article('ar', { locale: 'fr' }), article('ar', { section: '../other' }),
    article('ar', { body: null }), article('ar', { body: [null] }), article('ar', { body: [] }),
    article('ar', { facts: [3] }), article('ar', { sources: {} }), article('ar', { title: '' }),
    article('ar', { sources: [{ title: 'Bad', url: 'https://user:secret@example.org' }] }),
    article('ar', { _status: 'draft' }), article('ar', { reviewStatus: 'draft' }),
    article('ar', { image: { published: true, url: 42 } }), article('ar', { imageAlt: 42 }),
  ];
  for (const doc of bad) {
    assert.throws(() => decodePublicArticle(doc), /invalid approved article/);
    await assert.rejects(readCMSEntries(reader([[doc]])), /invalid approved article/);
  }
});

test('inconsistent canonical pairs fail without silently overwriting or returning demo', async () => {
  for (const override of [
    { section: 'history' }, { slug: 'different' }, { translationKey: 'different' }, { period: '1932' }, { kind: 'ruler' },
    { facts: [{ label: 'Label', value: 'Value' }] },
    { body: [{ heading: 'One', text: 'Text' }, { heading: 'Two', text: 'Text' }] },
    { sources: [{ title: 'Other', url: 'https://example.org/other' }] }, { image: 99 },
  ]) {
    await assert.rejects(readCMSEntries(reader([[article('ar'), article('en', override)]])), /inconsistent bilingual/);
  }
  assert.equal(mergePair(decodePublicArticle(article('ar')), decodePublicArticle(article('en', { translationKey: 'other' }))), null);
  await assert.rejects(readCMSEntries(reader([[article('ar'), article('ar', { id: 3 }), article('en')]])), /inconsistent bilingual/);
  await assert.rejects(readCMSEntries(reader([[article('ar'), article('en'),
    article('ar', { id: 3, translationKey: 'second' }), article('en', { id: 4, translationKey: 'second' })]])), /inconsistent bilingual/);
  const failure = new Error('Database read failed');
  await assert.rejects(readCMSEntries({ find: async () => { throw failure; } }), (error: unknown) => error === failure);
});

test('images require the same released asset and bilingual alt; fallback describes Diriyah honestly', async () => {
  const media = { id: 7, published: true, url: '/api/media/file/photo.webp' };
  const run = async (ar: Record<string, unknown>, en = ar) =>
    (await readCMSEntries(reader([[article('ar', ar), article('en', en)]])))[0];
  assert.equal((await run({ image: media, imageAlt: 'Actual image description' })).image, media.url);
  for (const url of ['https://bucket.example.org/photo.webp', 'https://bucket.example.org/api/media/file/photo.webp',
    '/api/media/file/photo.webp?token=secret', '/api/media/file/photo.webp#fragment', 'https://[', 'javascript:alert(1)']) {
    const entry = await run({ image: { ...media, url }, imageAlt: 'Person title' });
    assert.equal(entry.image, '/images/diriyah.jpg');
    assert.match(entry.imageAlt.en, /Diriyah.*not a portrait/);
    assert.match(entry.imageAlt.ar, /الدرعية/);
  }
  for (const image of [null, 7, { ...media, published: false }, media]) {
    const entry = await run({ image });
    assert.equal(entry.image, '/images/diriyah.jpg');
    assert.notEqual(entry.imageAlt.en, entry.title.en);
  }
  await assert.rejects(run({ image: media, imageAlt: 'Photo' }, { image: { ...media, id: 8 }, imageAlt: 'Photo' }), /inconsistent bilingual/);
  await assert.rejects(run({ image: media, imageAlt: 'Photo' }, { image: { ...media, url: '/api/media/file/other.webp' }, imageAlt: 'Photo' }), /inconsistent bilingual/);
});

type AdapterOptions = Parameters<PayloadRequest['payload']['db']['find']>[0];
function anonymous(find: (options: AdapterOptions) => Promise<{ docs: unknown[]; hasNextPage: boolean }>): PayloadRequest {
  // Minimal typed double, not a real PayloadRequest or database adapter.
  return { user: null, context: { skipPairCheck: true }, payload: { db: { find } } } as unknown as PayloadRequest;
}

test('anonymous access uses a nonrecursive fixed adapter query and denies orphan/mismatched IDs', async () => {
  for (const docs of [[], [article('ar')], [article('ar'), article('en', { slug: 'different' })],
    [article('ar'), article('en', { translationKey: 'other' })], [article('ar'), article('en', { image: 7 })],
    [article('ar', { categoryRef: 1 }), article('en', { categoryRef: 2 })],
    [article('ar', { authors: [3, 4] }), article('en', { authors: [4, 3] })]]) {
    assert.deepEqual(await readPairedArticles({ req: anonymous(async () => ({ docs, hasNextPage: false })) }),
      { and: [publishedArticleWhere, { id: { in: [] } }] });
  }
  const seen: number[] = [];
  const req = anonymous(async (options) => {
    assert.equal(options.req, req);
    assert.equal(options.collection, 'articles');
    assert.deepEqual(options.where, publishedArticleWhere);
    assert.equal(options.versions, undefined);
    assert.equal(options.draftsEnabled, false);
    assert.equal(options.joins, false);
    assert.equal(options.select?.body, true);
    seen.push(options.page ?? 1);
    return { docs: [article(options.page === 1 ? 'ar' : 'en')], hasNextPage: options.page === 1 };
  });
  assert.deepEqual(await readPairedArticles({ req }), { and: [publishedArticleWhere, { id: { in: [1, 2] } }] });
  assert.deepEqual(seen, [1, 2]);
  await assert.rejects(async () => readPairedArticles({ req: anonymous(async () => { throw new Error('Adapter failure'); }) }), /Adapter failure/);
});

test('anonymous pair decisions are not cached; staff reads bypass pair discovery', async () => {
  let docs = [article('ar'), article('en')];
  const req = anonymous(async () => ({ docs, hasNextPage: false }));
  assert.deepEqual(await readPairedArticles({ req }), { and: [publishedArticleWhere, { id: { in: [1, 2] } }] });
  docs = [article('ar')];
  assert.deepEqual(await readPairedArticles({ req }), { and: [publishedArticleWhere, { id: { in: [] } }] });
  for (const role of ['administrator', 'reviewer', 'editor', 'translator']) {
    const staff = { user: { id: 1, collection: 'users', role } } as unknown as PayloadRequest;
    assert.equal(await readPairedArticles({ req: staff }), true);
  }
});

test('admin imports base CSS and one supplied Zain stylesheet, and all admin metadata is noindex', async () => {
  const root = new URL('../../src/app/(payload)/', import.meta.url);
  const [layout, css, page] = await Promise.all([
    readFile(new URL('layout.tsx', root), 'utf8'), readFile(new URL('admin.css', root), 'utf8'),
    readFile(new URL('admin/[[...segments]]/page.tsx', root), 'utf8'),
  ]);
  assert.match(layout, /import '@payloadcms\/next\/css'/);
  assert.match(layout, /import '\.\/admin.css'/);
  assert.equal(layout.includes('fonts.googleapis.com'), false);
  assert.equal(css.match(/@import/g)?.length, 1);
  assert.ok(css.includes('https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap'));
  assert.match(css, /--font-body: 'Zain', sans-serif/);
  assert.match(css, /button,[\s\S]*input,[\s\S]*select,[\s\S]*textarea/);
  assert.match(layout, /robots: \{ index: false, follow: false \}/);
  assert.equal(page.match(/robots: \{ index: false, follow: false \}/g)?.length, 2);
});