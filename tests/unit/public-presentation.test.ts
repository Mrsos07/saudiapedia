import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Children, createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhotoCredit, EntryCard } from '../../src/components/encyclopedia';
import { decodePublicArticle } from '../../src/collections/public-articles';
import { readCMSEntries, type CMSReader } from '../../src/lib/cms';
import { articleMetadata, safeCanonicalURL } from '../../src/lib/article-metadata';
import { brand, pageMetadata, siteUrl } from '../../src/lib/site';
import type { Locale } from '../../src/lib/encyclopedia';

const media = {
  id: 7, published: true, url: '/api/media/file/approved.webp',
  attribution: 'Example creator — https://example.org/source',
  license: 'Example license — https://example.org/license',
};

function document(locale: Locale, overrides: Record<string, unknown> = {}) {
  return {
    id: locale === 'ar' ? 1 : 2, locale, translationKey: 'presentation-test',
    section: 'people', slug: 'test-person', title: `${locale} title`, summary: `${locale} summary`,
    category: `${locale} category`, _status: 'published', reviewStatus: 'approved',
    body: [{ heading: 'Heading', text: 'Text' }],
    sources: [{ title: 'Source', url: 'https://example.org/source' }],
    ...overrides,
  };
}

async function entry(ar: Record<string, unknown> = {}, en = ar) {
  const reader: CMSReader = { find: async () => ({
    docs: [document('ar', ar), document('en', en)], hasNextPage: false,
  }) };
  return (await readCMSEntries(reader))[0];
}

test('optional SEO and credits preserve legacy public entries and static fallback credits', async () => {
  const legacy = await entry();
  assert.equal(legacy.imageCredit, undefined);
  assert.equal(legacy.image, '/images/diriyah.jpg');
  for (const locale of ['ar', 'en'] as const) {
    assert.deepEqual(articleMetadata(legacy, locale), pageMetadata(
      locale, legacy.title[locale], legacy.summary[locale], '/people/test-person', false,
    ));
  }
  const empty = await entry({ seoTitle: '  ', seoDescription: null, canonicalURL: '', noIndex: null });
  assert.deepEqual(articleMetadata(empty, 'en'), articleMetadata(legacy, 'en'));
  const oldMedia = await entry({ image: { id: 7, published: true, url: media.url }, imageAlt: 'Photo' });
  assert.equal(oldMedia.image, media.url);
  assert.equal(oldMedia.imageCredit, undefined);
  assert.equal(renderToStaticMarkup(createElement(PhotoCredit, { image: media.url, locale: 'en' })), '');
  const fallback = renderToStaticMarkup(createElement(PhotoCredit, {
    image: legacy.image, locale: 'en', credit: { attribution: 'Must not replace static attribution' },
  }));
  assert.match(fallback, /Petrovic-Njegos/);
  assert.doesNotMatch(fallback, /Must not replace/);
});

test('public media credits survive decoding and render visibly on cards in both languages', async () => {
  const published = await entry({ image: { ...media, privateNotes: 'DO NOT LEAK' }, imageAlt: 'Photo' });
  assert.deepEqual(published.imageCredit, { attribution: media.attribution, license: media.license });
  assert.equal(published.image, media.url);
  assert.doesNotMatch(JSON.stringify(published), /DO NOT LEAK/);
  for (const locale of ['ar', 'en'] as const) {
    const credit = renderToStaticMarkup(createElement(PhotoCredit, {
      image: published.image, locale, credit: published.imageCredit,
    }));
    assert.match(credit, /Example creator — /);
    assert.match(credit, /href="https:\/\/example\.org\/source"/);
    assert.match(credit, /Example license — /);
    assert.match(credit, /href="https:\/\/example\.org\/license"/);
    assert.ok(credit.includes(locale === 'ar' ? 'نسبة الصورة:' : 'Image attribution:'));
    assert.ok(credit.includes(locale === 'ar' ? 'الترخيص:' : 'License:'));
    // Inspect actual card children: plain Node does not apply Next's next/image interop.
    const card = EntryCard({ entry: published, locale });
    const children = Children.toArray(card.props.children);
    const creditChild = children.find(child => isValidElement(child) && child.type === PhotoCredit);
    assert.ok(creditChild);
    assert.equal(renderToStaticMarkup(creditChild), credit);
    const imageLink = children[0];
    assert.ok(isValidElement<{ children: ReactNode }>(imageLink));
    const image = Children.toArray(imageLink.props.children)[0];
    assert.ok(isValidElement<{ src: string; unoptimized: boolean }>(image));
    assert.equal(image.props.src, media.url);
    assert.equal(image.props.unoptimized, true);
  }
});

test('legacy partial media credits show only supplied attribution or license', async () => {
  for (const fields of [{ attribution: 'Creator', license: null }, { attribution: null, license: 'License text' }]) {
    const result = await entry({ image: { ...media, ...fields }, imageAlt: 'Photo' });
    const html = renderToStaticMarkup(createElement(PhotoCredit, {
      image: result.image, locale: 'en', credit: result.imageCredit,
    }));
    assert.equal(html.includes('Image attribution:'), fields.attribution !== null);
    assert.equal(html.includes('License:'), fields.license !== null);
    assert.doesNotMatch(html, /undefined|null| · /);
  }
});

test('credits are inert text, not HTML, Markdown, or executable links', () => {
  const html = renderToStaticMarkup(createElement(PhotoCredit, {
    image: media.url, locale: 'en', credit: {
      attribution: '<script>alert(1)</script><img src=x onerror=alert(1)>',
      license: '[bad](javascript:alert(1)) data:text/html,test https://user:secret@example.org',
    },
  }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|<a\b|href=/);
});

test('private, unsafe, missing-alt, and unpopulated media do not propagate any credits', async () => {
  for (const image of [
    7, null, { ...media, published: false }, { ...media, published: undefined },
    { ...media, url: 'https://storage.example.org/private.webp' },
    { ...media, url: `${media.url}?token=secret` }, { ...media, url: `${media.url}#fragment` },
  ]) {
    const result = await entry({ image, imageAlt: 'Photo' });
    assert.equal(result.imageCredit, undefined);
    assert.equal(result.image, '/images/diriyah.jpg');
    assert.doesNotMatch(JSON.stringify(result), /Example creator|Example license|token=secret|storage.example/);
  }
  for (const imageAlt of [undefined, null, '', '   ']) {
    const result = await entry({ image: media, imageAlt: 'Photo' }, { image: media, imageAlt });
    assert.equal(result.imageCredit, undefined);
    assert.equal(result.image, '/images/diriyah.jpg');
  }
  const privateImage = decodePublicArticle(document('ar', { image: { ...media, published: false } })).image;
  assert.doesNotMatch(JSON.stringify(privateImage), /Example creator|Example license/);
  await assert.rejects(entry({ image: media, imageAlt: 'Photo' }, {
    image: { ...media, license: 'Changed license' }, imageAlt: 'Photo',
  }), /inconsistent bilingual/);
});

test('optional fields are type-checked without echoing malformed values', () => {
  for (const overrides of [
    { seoTitle: 42 }, { seoDescription: [] }, { canonicalURL: {} }, { noIndex: 'false' },
    { image: { ...media, attribution: {} } }, { image: { ...media, license: false } },
  ]) assert.throws(() => decodePublicArticle(document('ar', overrides)), /invalid approved article/);
});

test('canonical validation rejects unsafe and ambiguous URLs and accepts absolute public HTTP(S)', async () => {
  for (const value of [undefined, null, 42, '', '/en/people/test-person', '//example.org/page',
    'javascript:alert(1)', 'data:text/html,test', 'ftp://example.org/page', 'https://[',
    'https://user:secret@example.org/page', 'https://example.org/page?token=secret',
    'https://example.org/page#fragment', 'https://example.org/page?', 'https://example.org/page#',
    'https://example.org\\@evil.example/page', 'https://exa\nmple.org/page',
    'https://example.org/%0aheader', 'https://example.org/a b', '\nhttps://example.org/page',
  ]) {
    assert.equal(safeCanonicalURL(value), undefined);
    if (typeof value === 'string') {
      const result = await entry({ canonicalURL: value });
      assert.equal(result.seo?.en?.canonicalURL, undefined);
      assert.equal(articleMetadata(result, 'en').alternates?.canonical, `${siteUrl}/en/people/test-person`);
    }
  }
  assert.equal(safeCanonicalURL(' https://example.org/original '), 'https://example.org/original');
  assert.equal(safeCanonicalURL('http://example.org/original'), 'http://example.org/original');
});

test('locale SEO overrides reach standard and social metadata without changing hreflang or indexing gate', async () => {
  const original = process.env.SITE_INDEXABLE;
  try {
    const result = await entry({
      seoTitle: ' عنوان البحث ', seoDescription: ' وصف البحث ', canonicalURL: 'https://example.org/ar-original', noIndex: true,
    }, {
      seoTitle: ' Search title ', seoDescription: ' Search description ', canonicalURL: 'https://example.org/en-original', noIndex: false,
    });
    process.env.SITE_INDEXABLE = 'true';
    for (const locale of ['ar', 'en'] as const) {
      const metadata = articleMetadata(result, locale);
      const title = locale === 'ar' ? 'عنوان البحث' : 'Search title';
      const description = locale === 'ar' ? 'وصف البحث' : 'Search description';
      assert.equal(metadata.title, `${title} | ${brand[locale]}`);
      assert.equal(metadata.description, description);
      assert.equal(metadata.openGraph?.title, title);
      assert.equal(metadata.openGraph?.description, description);
      assert.equal(metadata.twitter?.title, title);
      assert.equal(metadata.twitter?.description, description);
      assert.equal(metadata.alternates?.canonical, `https://example.org/${locale}-original`);
      assert.equal(metadata.openGraph?.url, metadata.alternates?.canonical);
      assert.deepEqual(metadata.alternates?.languages, {
        ar: `${siteUrl}/ar/people/test-person`, en: `${siteUrl}/en/people/test-person`,
      });
      assert.deepEqual(metadata.robots, { index: locale === 'en', follow: true });
    }
    assert.deepEqual(articleMetadata({ ...result, status: 'editorial-preview' }, 'en').robots, { index: false, follow: true });
    for (const gate of ['', 'false']) {
      process.env.SITE_INDEXABLE = gate;
      assert.deepEqual(articleMetadata(result, 'en').robots, { index: false, follow: true });
    }
    delete process.env.SITE_INDEXABLE;
    assert.deepEqual(articleMetadata(result, 'en').robots, { index: false, follow: true });
  } finally {
    if (original === undefined) delete process.env.SITE_INDEXABLE;
    else process.env.SITE_INDEXABLE = original;
  }
});

test('article route consumes the tested metadata helper and credit without optimizing protected media', async () => {
  const route = await readFile(new URL('../../src/app/(public)/[locale]/[section]/[slug]/page.tsx', import.meta.url), 'utf8');
  assert.match(route, /return articleMetadata\(entry, locale\)/);
  assert.match(route, /<PhotoCredit[^>]+credit=\{entry.imageCredit\}/);
  assert.ok(route.includes("unoptimized={entry.image.startsWith('/api/')}"));
});