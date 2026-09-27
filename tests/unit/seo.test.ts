import assert from 'node:assert/strict';
import test from 'node:test';
import { entryAlternates, indexableEntry } from '../../src/lib/article-metadata';
import { mergePair } from '../../src/lib/cms';
import { decodePublicArticle } from '../../src/collections/public-articles';
import { entries, type Entry } from '../../src/lib/encyclopedia';
import { languageAlternates, siteUrl } from '../../src/lib/site';
import { article, breadcrumbs, collectionPage, organization, serializeGraph, website } from '../../src/lib/structured-data';

const king: Entry = { ...entries.find(entry => entry.slug === 'king-fahd')!, status: 'published', seo: { ar: {}, en: {} }, datePublished: '2026-09-15T10:00:00.000Z', dateModified: '2026-09-27T12:00:00.000Z' };

test('article schema carries the Google Article fields the CMS can support truthfully', () => {
  const url = `${siteUrl}/ar/people/king-fahd`;
  const node = article(king, 'ar', url);
  assert.equal(node['@type'], 'Article');
  assert.equal(node.headline, king.title.ar);
  assert.equal(node.mainEntityOfPage, url);
  assert.equal(node.inLanguage, 'ar');
  assert.equal(node.datePublished, '2026-09-15T10:00:00.000Z');
  assert.equal(node.dateModified, '2026-09-27T12:00:00.000Z');
  assert.deepEqual(node.image, [{ '@type': 'ImageObject', url: `${siteUrl}/images/kings/king-fahd.webp`, caption: king.imageAlt.ar }]);
  assert.deepEqual(node.author, { '@id': `${siteUrl}/#organization` });
  assert.deepEqual(node.publisher, { '@id': `${siteUrl}/#organization` });
  assert.deepEqual(node.about, { '@type': 'Person', name: king.title.ar });
  assert.deepEqual(node.citation, king.sources.map(source => source.url));
  const undated = article({ ...king, datePublished: undefined, dateModified: undefined }, 'en', url);
  assert.equal('datePublished' in undated || 'dateModified' in undated, false, 'dates are omitted, never invented');
  const region = entries.find(entry => entry.section === 'regions')!;
  assert.deepEqual(article(region, 'en', url).about, { '@type': 'Place', name: region.title.en });
});

test('site-level schema identifies the organization, bilingual website search and breadcrumbs', () => {
  const org = organization();
  assert.equal(org['@type'], 'Organization');
  assert.equal(org.url, siteUrl);
  assert.equal((org.logo as { url: string }).url, `${siteUrl}/brand/saudi-map-logo.svg`);
  const site = website('en');
  assert.equal(site.url, `${siteUrl}/en`);
  assert.equal((site.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate, `${siteUrl}/en/search?q={search_term_string}`);
  const trail = breadcrumbs([{ name: 'Home', path: '/en' }, { name: 'Regions', path: '/en/regions' }]);
  assert.deepEqual(trail.itemListElement, [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/en` },
    { '@type': 'ListItem', position: 2, name: 'Regions', item: `${siteUrl}/en/regions` },
  ]);
  const listing = collectionPage('en', 'Regions', 'Regions.', '/en/regions', [king], entry => `/en/${entry.section}/${entry.slug}`);
  assert.equal((listing.mainEntity as { numberOfItems: number }).numberOfItems, 1);
});

test('serialized JSON-LD is valid JSON and cannot break out of its script element', () => {
  const hostile = { ...king, title: { ar: '</script><script>alert(1)</script>', en: 'x' } } as Entry;
  const text = serializeGraph([article(hostile, 'ar', `${siteUrl}/ar/people/king-fahd`)]);
  assert.doesNotMatch(text, /<\/?script/i);
  const parsed = JSON.parse(text) as { '@context': string; '@graph': { headline: string }[] };
  assert.equal(parsed['@context'], 'https://schema.org');
  assert.equal(parsed['@graph'][0].headline, '</script><script>alert(1)</script>');
});

test('the sitemap lists only published, indexable, self-canonical translations with matching hreflang', () => {
  assert.equal(indexableEntry(king, 'ar'), true);
  assert.equal(indexableEntry({ ...king, status: 'editorial-preview' }, 'ar'), false);
  const noindexArabic = { ...king, seo: { ar: { noIndex: true }, en: {} } };
  assert.equal(indexableEntry(noindexArabic, 'ar'), false);
  assert.deepEqual(entryAlternates(noindexArabic), { en: `${siteUrl}/en/people/king-fahd`, 'x-default': `${siteUrl}/en/people/king-fahd` });
  const elsewhere = { ...king, seo: { ar: { canonicalURL: 'https://example.org/original' }, en: { canonicalURL: `${siteUrl}/en/people/king-fahd` } } };
  assert.equal(indexableEntry(elsewhere, 'ar'), false);
  assert.equal(indexableEntry(elsewhere, 'en'), true);
  assert.deepEqual(entryAlternates(king), {
    ar: `${siteUrl}/ar/people/king-fahd`, en: `${siteUrl}/en/people/king-fahd`, 'x-default': `${siteUrl}/ar/people/king-fahd`,
  });
  assert.deepEqual(languageAlternates('/regions'), { ar: `${siteUrl}/ar/regions`, en: `${siteUrl}/en/regions`, 'x-default': `${siteUrl}/ar/regions` });
});

test('CMS timestamps become pair dates; malformed timestamps are dropped without failing the article', () => {
  const doc = (locale: 'ar' | 'en', id: number, createdAt: unknown, updatedAt: unknown) => ({
    id, locale, _status: 'published', reviewStatus: 'approved', translationKey: 'key', section: 'people', slug: 'person',
    title: 'T', summary: 'S', category: 'C', body: [{ heading: 'H', text: 'B' }], sources: [{ title: 'S', url: 'https://example.org/s' }],
    createdAt, updatedAt,
  });
  const ar = decodePublicArticle(doc('ar', 1, '2026-09-10T08:00:00.000Z', '2026-09-20T08:00:00.000Z'));
  const en = decodePublicArticle(doc('en', 2, '2026-09-11T08:00:00.000Z', '2026-09-25T08:00:00.000Z'));
  const merged = mergePair(ar, en)!;
  assert.equal(merged.datePublished, '2026-09-10T08:00:00.000Z');
  assert.equal(merged.dateModified, '2026-09-25T08:00:00.000Z');
  const broken = decodePublicArticle(doc('ar', 3, 'not a date', 42));
  assert.equal('createdAt' in broken || 'updatedAt' in broken, false);
});
