import assert from 'node:assert/strict';
import test from 'node:test';
import { APIError, type CollectionConfig, type PayloadRequest } from 'payload';
import { Sections, enforceSectionSlugImmutable, protectReferencedSection } from '../../src/collections/Sections';
import { roles } from '../../src/collections/access';
import { navigationLabel, publicNavigation, sectionName } from '../../src/lib/site';
import { withSubsections } from '../../src/lib/subsections';
import type { Entry } from '../../src/lib/encyclopedia';
import { readSections } from '../../src/lib/sections';

test('public navigation includes CMS sections and merges legacy biography listings without mutating input', () => {
  const input = [
    { slug: 'history', name: { ar: 'التاريخ', en: 'History' } },
    { slug: 'people', name: { ar: 'اسم قديم', en: 'Old label' } },
    { slug: 'rulers', name: { ar: 'الحكام', en: 'Rulers' } },
    { slug: 'notable-figures', name: { ar: 'الشخصيات', en: 'People' } },
    { slug: 'nature', name: { ar: 'البيئة والطبيعة', en: 'Nature & Environment' } },
    { slug: 'economy', name: { ar: 'الاقتصاد والتنمية', en: 'Economy & Development' } },
    { slug: 'tourism', name: { ar: 'السياحة والمعالم', en: 'Tourism & Landmarks' } },
  ];
  const before = structuredClone(input);
  const result = publicNavigation(input);
  assert.deepEqual(result.map(item => item.path), ['history', 'notable-figures', 'nature', 'economy', 'tourism']);
  assert.deepEqual(result[1], { path: 'notable-figures', ar: 'اسم قديم', en: 'Old label' }, 'the first biography section names the merged entry');
  assert.deepEqual(result[2], { path: 'nature', ar: 'البيئة والطبيعة', en: 'Nature & Environment' });
  assert.deepEqual(input, before);
  assert.deepEqual(publicNavigation([]), []);
});

test('header, footer and section titles use the names managed in the CMS, in CMS order', () => {
  const sections = [
    { slug: 'regions', name: { ar: 'المناطق', en: 'Regions' } },
    { slug: 'history', name: { ar: 'تاريخ المملكة', en: 'Saudi history' } },
    { slug: 'people', name: { ar: 'الشخصيات', en: 'People' } },
    { slug: 'new-section', name: { ar: 'قسم جديد', en: 'New section' } },
  ];
  const items = publicNavigation(sections);
  assert.deepEqual(items.map(item => navigationLabel(item, 'ar')), ['المناطق', 'تاريخ المملكة', 'الشخصيات', 'قسم جديد']);
  assert.deepEqual(items.map(item => navigationLabel(item, 'en')), ['Regions', 'Saudi history', 'People', 'New section']);
  assert.deepEqual(sectionName('notable-figures', sections), { ar: 'الشخصيات', en: 'People' });
  assert.deepEqual(sectionName('history', sections), { ar: 'تاريخ المملكة', en: 'Saudi history' });
  assert.deepEqual(sectionName('heritage', sections), { ar: 'التراث', en: 'Heritage' }, 'fixed fallback when the CMS has no such section');
  assert.equal(sectionName('unknown', sections), undefined);
});

test('header dropdowns list a section\'s subsections like its filter tabs (rulers first, only when more than one)', () => {
  const entry = (section: string, slug: string, category: string, kind?: 'ruler' | 'notable', parentKey?: string) => ({
    section, slug, key: slug, kind, parentKey, category: { ar: category, en: `${category}-en` },
  }) as unknown as Entry;
  const entries = [
    entry('people', 'talal', 'الفن', 'notable'), entry('people', 'king', 'ملوك', 'ruler'), entry('people', 'imam', 'أئمة', 'notable'),
    entry('heritage', 'a', 'موقع'), entry('heritage', 'b', 'موقع'),
    entry('regions', 'riyadh', 'منطقة'), entry('regions', 'kharj', 'محافظة', undefined, 'riyadh'),
  ];
  const nav = withSubsections([{ path: 'notable-figures', ar: 'ش', en: 'P' }, { path: 'heritage', ar: 'ت', en: 'H' }, { path: 'regions', ar: 'م', en: 'R' }], entries, 'ar');
  assert.deepEqual(nav[0].subsections, ['ملوك', 'الفن', 'أئمة']);
  assert.equal(nav[1].subsections, undefined, 'a single subsection needs no dropdown');
  assert.equal(nav[2].subsections, undefined, 'children listed inside their parent hub are not subsections');
  assert.deepEqual(withSubsections([{ path: 'notable-figures', ar: 'ش', en: 'P' }], entries, 'en')[0].subsections, ['ملوك-en', 'الفن-en', 'أئمة-en']);
});

test('public navigation omits invalid and reserved slugs instead of linking outside encyclopedia sections', () => {
  const input = ['../admin', 'search', 'privacy', 'credits', 'about', 'editorial-policy', 'geography', 'valid-section'].map(slug => ({ slug, name: { ar: 'قسم', en: 'Section' } }));
  assert.deepEqual(publicNavigation(input).map(item => item.path), ['valid-section']);
});

test('section loading paginates safely instead of losing sections beyond the public result limit', async () => {
  const pages: number[] = [];
  const result = await readSections({ find: async options => {
    assert.equal(options.overrideAccess, false);
    assert.equal(options.user, null);
    assert.equal(options.depth, 0);
    assert.equal(options.limit, 100);
    assert.deepEqual(options.sort, ['order', 'id']);
    pages.push(options.page!);
    return { docs: [{ slug: `section-${options.page}`, nameAr: 'قسم', nameEn: 'Section', order: options.page }], hasNextPage: options.page === 1 };
  } });
  assert.deepEqual(pages, [1, 2]);
  assert.deepEqual(result.map(section => section.slug), ['section-1', 'section-2']);
});

function field(collection: CollectionConfig, name: string) {
  const result = collection.fields.find((item) => 'name' in item && item.name === name);
  assert.ok(result, `Missing ${name} field`);
  return result;
}

test('sections are publicly readable, staff can edit labels, only administrators create/delete', async () => {
  for (const user of [null, { id: 1, collection: 'users', role: 'visitor' },
    ...roles.map((role) => ({ id: 1, collection: 'users', role }))]) {
    const req = { user } as unknown as PayloadRequest;
    const staff = user?.collection === 'users' && roles.some((role) => role === user.role);
    const admin = user?.collection === 'users' && user.role === 'administrator';
    assert.equal(await Sections.access?.read?.({ req } as never), true);
    assert.equal(await Sections.access?.create?.({ req } as never), admin);
    assert.equal(await Sections.access?.update?.({ req } as never), staff);
    assert.equal(await Sections.access?.delete?.({ req } as never), admin);
  }
  const slug = field(Sections, 'slug');
  assert.equal(slug.type, 'text');
  assert.ok('required' in slug && slug.required);
  assert.ok('unique' in slug && slug.unique);
  for (const name of ['nameAr', 'nameEn']) {
    const nameField = field(Sections, name);
    assert.equal(nameField.type, 'text');
    assert.ok('required' in nameField && nameField.required);
  }
});

test('a section slug cannot be changed after creation', async () => {
  const original = { id: 1, slug: 'history' };
  const result = await enforceSectionSlugImmutable({
    data: { slug: 'history' }, originalDoc: original, operation: 'update', context: {}, collection: Sections,
  } as never);
  assert.deepEqual(result, { slug: 'history' });
  // The hook throws synchronously; the call must happen inside the callback
  // passed to assert.throws/rejects, not as an already-evaluated argument.
  assert.throws(() => enforceSectionSlugImmutable({
    data: { slug: 'renamed' }, originalDoc: original, operation: 'update', context: {}, collection: Sections,
  } as never), (error: unknown) => error instanceof APIError && error.status === 400);
});

test('section deletion fails closed if reference lookup fails', async () => {
  const failure = new Error('Simulated lookup failure');
  const req = { user: { id: 1, collection: 'users', role: 'administrator' }, payload: {
    findByID: async () => { throw failure; }, count: async () => { throw new Error('Must not continue'); },
  } } as unknown as PayloadRequest;
  await assert.rejects(protectReferencedSection({ id: 1, req, context: {}, collection: Sections } as never), error => error === failure);
});

test('deleting a section referenced by articles or categories is rejected; unreferenced/missing sections are not', async () => {
  function request(slug: string | null, articleCount: number, categoryCount: number): PayloadRequest {
    return {
      user: { id: 1, collection: 'users', role: 'administrator' },
      payload: {
        findByID: async () => (slug === null ? null : { id: 1, slug }),
        count: async ({ collection }: { collection: string }) =>
          ({ totalDocs: collection === 'articles' ? articleCount : categoryCount }),
      },
    } as unknown as PayloadRequest;
  }
  await assert.rejects(protectReferencedSection({ id: 1, req: request('history', 1, 0), context: {}, collection: Sections } as never),
    (error: unknown) => error instanceof APIError && error.status === 409);
  await assert.rejects(protectReferencedSection({ id: 1, req: request('history', 0, 1), context: {}, collection: Sections } as never),
    (error: unknown) => error instanceof APIError && error.status === 409);
  await protectReferencedSection({ id: 1, req: request('history', 0, 0), context: {}, collection: Sections } as never);
  await protectReferencedSection({ id: 1, req: request(null, 0, 0), context: {}, collection: Sections } as never);
});
