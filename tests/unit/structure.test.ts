import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { PayloadRequest } from 'payload';
import { richTextPlain, safeExternalURL, sanitizeRichText } from '../../src/lib/rich-text';
import { RichText } from '../../src/components/rich-text';
import { decodePublicArticle } from '../../src/collections/public-articles';
import { mergePair } from '../../src/lib/cms';
import { ancestors, children, descendants, hubBlocks, relatedEntries, siblings } from '../../src/lib/structure';
import { completeBodyRow } from '../../src/collections/Articles';
import { validateStructureRelations } from '../../src/collections/structure-relations';
import { effectiveMethod } from '../../src/lib/public-cache';
import type { Entry } from '../../src/lib/encyclopedia';

const text = (value: string, format = 0) => ({ type: 'text', text: value, format });
const root = (...children: unknown[]) => ({ root: { type: 'root', children } });
const para = (...children: unknown[]) => ({ type: 'paragraph', children });

test('rich text keeps only safe structure: no HTML, scripts, styles or unsafe URLs', () => {
  const nodes = sanitizeRichText(root(
    para(text('Bold', 1), text(' plain'), { type: 'linebreak' }),
    { type: 'heading', tag: 'h1', children: [text('Heading')] },
    { type: 'list', listType: 'number', children: [{ type: 'listitem', children: [text('One')] }, text('stray')] },
    para({ type: 'link', fields: { linkType: 'custom', url: 'javascript:alert(1)' }, children: [text('evil')] }),
    para({ type: 'link', fields: { linkType: 'custom', url: 'https://user:pw@example.org/' }, children: [text('creds')] }),
    para({ type: 'link', fields: { linkType: 'custom', url: 'https://example.org/a b' }, children: [text('space')] }),
    para({ type: 'link', fields: { linkType: 'custom', url: 'https://example.org/page' }, children: [text('ok')] }),
    { type: 'html', html: '<img src=x onerror=alert(1)>', children: [text('inner')] },
    { type: 'upload', value: { url: '/api/media/file/private.webp' } },
  ))!;
  const html = renderToStaticMarkup(createElement(RichText, { nodes, locale: 'en' }));
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<h3><span>Heading<\/span><\/h3>/, 'only h3/h4 headings; h1 is demoted');
  assert.doesNotMatch(html, /<h1|<h2/);
  assert.match(html, /<ol><li>/);
  assert.doesNotMatch(html, /stray/, 'lists contain list items only');
  assert.doesNotMatch(html, /javascript:|onerror|<img|private\.webp|user:pw|a b/);
  assert.match(html, /evil/, 'an unsafe link keeps its words');
  assert.match(html, /<a href="https:\/\/example\.org\/page" target="_blank" rel="noreferrer"><span>ok<\/span><\/a>/);
  assert.match(html, /inner/);
  assert.equal(safeExternalURL('ftp://example.org'), undefined);
  assert.equal(sanitizeRichText({ root: {} }), undefined);
  assert.equal(sanitizeRichText(root(para())), undefined, 'empty paragraphs are not content');
  assert.equal(richTextPlain(nodes).startsWith('Bold plain'), true);
});

test('internal links resolve only when the target was populated by a public read', () => {
  const internal = (doc: unknown) => sanitizeRichText(root(para({ type: 'link', fields: { linkType: 'internal', doc }, children: [text('Masmak')] })))!;
  const published = internal({ relationTo: 'articles', value: { section: 'heritage', slug: 'masmak-fortress', body: [{ secret: 'draft' }] } });
  const html = renderToStaticMarkup(createElement(RichText, { nodes: published, locale: 'ar' }));
  assert.match(html, /href="\/ar\/heritage\/masmak-fortress"/);
  assert.doesNotMatch(JSON.stringify(published), /secret|draft/, 'populated documents are reduced to section and slug');
  for (const doc of [{ relationTo: 'articles', value: 42 }, { relationTo: 'articles', value: { section: '../admin', slug: 'x' } }, null]) {
    assert.doesNotMatch(renderToStaticMarkup(createElement(RichText, { nodes: internal(doc), locale: 'ar' })), /<a /);
  }
});

test('citation markers in rich text link to existing sources only', () => {
  const nodes = sanitizeRichText(root(para(text('Fact. [1][2] and [9]'))))!;
  const html = renderToStaticMarkup(createElement(RichText, { nodes, locale: 'en', sourceCount: 2 }));
  assert.equal(html.match(/class="inline-citation"/g)?.length, 2);
  assert.match(html, /href="#source-2"/);
  assert.match(html, /\[9\]/);
  assert.doesNotMatch(html, /#source-9/);
});

test('rich text is bounded against oversized or deeply nested documents', () => {
  let deep: Record<string, unknown> = text('leaf');
  for (let i = 0; i < 40; i += 1) deep = { type: 'quote', children: [deep] };
  assert.doesNotMatch(JSON.stringify(sanitizeRichText(root(deep)) ?? []), /leaf/);
  const wide = sanitizeRichText(root(...Array.from({ length: 8000 }, () => para(text('x')))))!;
  assert.ok(wide.length <= 5000);
});

test('a body row is complete with a heading and either plain or formatted text', () => {
  assert.equal(completeBodyRow({ heading: 'H', text: 'T' }), true);
  assert.equal(completeBodyRow({ heading: 'H', text: '', content: root(para(text('Rich'))) }), true);
  assert.equal(completeBodyRow({ heading: 'H', text: '', content: root(para()) }), false);
  assert.equal(completeBodyRow({ heading: '', text: 'T' }), false);
});

const doc = (locale: 'ar' | 'en', id: number, extra: Record<string, unknown> = {}) => ({
  id, locale, _status: 'published', reviewStatus: 'approved', translationKey: 'gov', section: 'regions', slug: 'diriyah-governorate',
  title: 'T', summary: 'S', category: 'C', body: [{ heading: 'H', text: '', role: 'history', content: root(para(text(`${locale} text`))) }],
  sources: [{ title: 'S', url: 'https://example.org/s' }], ...extra,
});

test('public decoding exposes structure only from populated (public) targets', () => {
  const article = decodePublicArticle(doc('ar', 1, {
    entityType: 'governorate', siteType: 'museum', parent: { id: 9, translationKey: 'riyadh' },
    related: [{ id: 3, translationKey: 'turaif' }, 77, { id: 3, translationKey: 'turaif' }],
  }));
  assert.equal(article.entityType, 'governorate');
  assert.equal(article.siteType, undefined, 'site type applies to sites only');
  assert.equal(article.parentKey, 'riyadh');
  assert.deepEqual(article.relatedKeys, ['turaif'], 'unpopulated IDs (not public) and duplicates are dropped');
  assert.equal(article.body[0].role, 'history');
  assert.equal(article.body[0].content?.length, 1);
  const unknown = decodePublicArticle(doc('ar', 2, { entityType: 'planet', parent: 9, body: [{ heading: 'H', text: 'Plain', role: 'bogus' }] }));
  assert.equal(unknown.entityType, undefined);
  assert.equal(unknown.parentKey, undefined);
  assert.equal(unknown.body[0].role, undefined);
  assert.throws(() => decodePublicArticle(doc('ar', 3, { body: [{ heading: 'H', text: '', content: root(para()) }] })), /invalid approved article/);
});

test('translation structure mismatches drop the link instead of hiding the pair', () => {
  const ar = decodePublicArticle(doc('ar', 1, { entityType: 'governorate', parent: { id: 9, translationKey: 'riyadh' }, related: [{ id: 3, translationKey: 'turaif' }, { id: 4, translationKey: 'masmak' }] }));
  const en = decodePublicArticle(doc('en', 2, { entityType: 'city', parent: { id: 10, translationKey: 'makkah' }, related: [{ id: 5, translationKey: 'turaif' }] }));
  const entry = mergePair(ar, en)!;
  assert.ok(entry, 'the pair stays public');
  assert.equal(entry.key, 'gov');
  assert.equal(entry.entityType, undefined);
  assert.equal(entry.parentKey, undefined);
  assert.deepEqual(entry.relatedKeys, ['turaif']);
  assert.equal(entry.body[0].content?.ar?.length, 1);
  assert.equal(entry.body[0].content?.en?.length, 1);
});

const entry = (key: string, extra: Partial<Entry> = {}): Entry => ({
  key, slug: key, section: 'regions', title: { ar: key, en: key }, summary: { ar: 's', en: 's' }, category: { ar: 'c', en: 'c' },
  image: '/images/diriyah.jpg', imageAlt: { ar: 'a', en: 'a' }, facts: [], body: [], sources: [], status: 'published', ...extra,
});

test('hierarchy helpers follow published parents and stop at cycles and missing links', () => {
  const region = entry('riyadh', { entityType: 'region' });
  const city = entry('riyadh-city', { entityType: 'city', parentKey: 'riyadh' });
  const gov = entry('diriyah', { entityType: 'governorate', parentKey: 'riyadh' });
  const site = entry('masmak', { entityType: 'site', siteType: 'historical', parentKey: 'riyadh-city' });
  const orphan = entry('orphan', { parentKey: 'unpublished' });
  const loopA = entry('loop-a', { parentKey: 'loop-b' });
  const loopB = entry('loop-b', { parentKey: 'loop-a' });
  const all = [region, city, gov, site, orphan, loopA, loopB];
  assert.deepEqual(ancestors(site, all).map(item => item.key), ['riyadh', 'riyadh-city']);
  assert.deepEqual(ancestors(orphan, all), []);
  assert.deepEqual(ancestors(loopA, all).map(item => item.key), ['loop-b'], 'a cycle terminates');
  assert.deepEqual(children(region, all).map(item => item.key), ['riyadh-city', 'diriyah']);
  assert.deepEqual(descendants(region, all).map(item => item.key), ['riyadh-city', 'diriyah', 'masmak']);
  assert.deepEqual(siblings(gov, all).map(item => item.key), ['riyadh-city', 'diriyah']);
});

test('relations are shown in both directions and automatic lists follow their matching sections', () => {
  const region = entry('riyadh', { entityType: 'region', relatedKeys: ['state-1'], body: [
    { heading: { ar: 'نظرة', en: 'Overview' }, text: { ar: 't', en: 't' }, role: 'overview' },
    { heading: { ar: 'التاريخ', en: 'History' }, text: { ar: 't', en: 't' }, role: 'history' },
    { heading: { ar: 'أخرى', en: 'Other' }, text: { ar: 't', en: 't' } },
  ] });
  const king = entry('king', { section: 'people', kind: 'ruler', relatedKeys: ['riyadh'] });
  const state = entry('state-1', { section: 'history', entityType: 'event' });
  const gov = entry('diriyah', { entityType: 'governorate', parentKey: 'riyadh' });
  const museum = entry('museum', { entityType: 'site', siteType: 'museum', parentKey: 'diriyah' });
  const mosque = entry('mosque', { entityType: 'site', siteType: 'religious', parentKey: 'diriyah' });
  const all = [region, king, state, gov, museum, mosque];
  assert.deepEqual(relatedEntries(region, all).map(item => item.key).sort(), ['king', 'state-1'], 'backlink from the king appears on the region');
  assert.deepEqual(relatedEntries(king, all).map(item => item.key), ['riyadh']);
  const blocks = hubBlocks(region, all);
  assert.deepEqual(blocks.map(block => block.id), ['section-0', 'auto-places', 'section-1', 'auto-antiquities', 'auto-people', 'section-2', 'auto-religious', 'auto-topics']);
  assert.deepEqual(blocks.find(block => block.id === 'auto-places')!.auto!.entries.map(item => item.key), ['diriyah']);
  assert.deepEqual(blocks.find(block => block.id === 'auto-people')!.auto!.entries.map(item => item.key), ['king']);
  assert.deepEqual(hubBlocks(entry('plain', { body: region.body }), all).map(block => block.id), ['section-0', 'section-1', 'section-2'], 'unstructured articles are unchanged');
});

type Hook = typeof validateStructureRelations;
const hookArgs = (data: Record<string, unknown>, originalDoc: Record<string, unknown> | undefined, docs: Record<string, { locale: string; parent?: number | null }>) => ({
  data, originalDoc, operation: 'update', collection: {} as never, context: {},
  req: { user: { id: 1, collection: 'users', role: 'administrator' }, payload: { findByID: async ({ id }: { id: string }) => {
    const found = docs[id];
    if (!found) throw new Error('Not Found');
    return found;
  } } } as unknown as PayloadRequest,
}) as unknown as Parameters<Hook>[0];

test('parent and related links must stay in one language, acyclic and shallow', async () => {
  const docs = { 1: { locale: 'ar', parent: null }, 2: { locale: 'ar', parent: 1 }, 3: { locale: 'en', parent: null }, 4: { locale: 'ar', parent: 5 }, 5: { locale: 'ar', parent: 4 } };
  await validateStructureRelations(hookArgs({ parent: 2, related: [1] }, { id: 9, locale: 'ar' }, docs));
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ parent: 9 }, { id: 9, locale: 'ar' }, docs))), /cycle/);
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ parent: 1 }, { id: 2, locale: 'ar' }, { ...docs, 1: { locale: 'ar', parent: 2 } }))), /cycle/);
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ parent: 3 }, { id: 9, locale: 'ar' }, docs))), /same language/);
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ parent: 4 }, { id: 9, locale: 'ar' }, docs))), /cycle/);
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ related: [3] }, { id: 9, locale: 'ar' }, docs))), /same language/);
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ related: [9] }, { id: 9, locale: 'ar' }, docs))), /itself/);
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ related: [1, 1] }, { id: 9, locale: 'ar' }, docs))), /Duplicate/);
  const deep = { 11: { locale: 'ar', parent: 12 }, 12: { locale: 'ar', parent: 13 }, 13: { locale: 'ar', parent: 14 }, 14: { locale: 'ar', parent: 15 }, 15: { locale: 'ar', parent: null } };
  await assert.rejects(Promise.resolve(validateStructureRelations(hookArgs({ parent: 11 }, { id: 9, locale: 'ar' }, deep))), /deeper/);
});

test('the article editor exposes no uploads, embeds, HTML or custom blocks', async () => {
  const source = await readFile('src/collections/article-editor.ts', 'utf8');
  const imports = source.slice(source.indexOf('{') + 1, source.indexOf('}'));
  assert.doesNotMatch(imports, /Upload|Relationship|Blocks|HTML|Code|Embed|Table|EXPERIMENTAL/i);
  assert.match(source, /LinkFeature\(\{ enabledCollections: \['articles'\]/);
  const map = await readFile('src/app/(payload)/admin/importMap.ts', 'utf8');
  for (const feature of ['Paragraph', 'Heading', 'Bold', 'Italic', 'Underline', 'UnorderedList', 'OrderedList', 'Blockquote', 'Link', 'FixedToolbar', 'InlineToolbar']) {
    assert.match(map, new RegExp(`'@payloadcms/richtext-lexical/client#${feature}FeatureClient'`));
  }
  assert.equal(effectiveMethod('POST', { headers: new Headers({ 'X-Payload-HTTP-Method-Override': 'GET' }) }), 'GET');
});

test('the structure migration only adds nullable columns, enums, keys and indexes', async () => {
  const migration = await readFile('src/collections/migrations/20260928_111843_entity_structure_rich_text.ts', 'utf8');
  const up = migration.slice(migration.indexOf('export async function up'), migration.indexOf('export async function down'));
  // "ON DELETE set null/cascade" is a foreign-key rule, not a data change; remove it before checking.
  const statements = up.replace(/ON DELETE (set null|cascade) ON UPDATE no action/g, '');
  assert.doesNotMatch(statements, /DROP|DELETE|TRUNCATE|ALTER COLUMN|NOT NULL|RENAME|UPDATE /i);
  assert.equal(up.match(/ADD COLUMN/g)?.length, 12);
});
