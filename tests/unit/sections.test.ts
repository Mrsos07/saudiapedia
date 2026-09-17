import assert from 'node:assert/strict';
import test from 'node:test';
import { APIError, type CollectionConfig, type PayloadRequest } from 'payload';
import { Sections, enforceSectionSlugImmutable, protectReferencedSection } from '../../src/collections/Sections';
import { roles } from '../../src/collections/access';
import { navigationLabel, publicNavigation } from '../../src/lib/site';

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
  assert.deepEqual(result[1], { path: 'notable-figures', ar: 'شخصيات بارزة', en: 'Notable figures' });
  assert.deepEqual(result[2], { path: 'nature', ar: 'البيئة والطبيعة', en: 'Nature & Environment' });
  assert.deepEqual(input, before);
  assert.deepEqual(publicNavigation([]), []);
});

test('header labels are compact in both languages without changing full names or routes', () => {
  const sections = [
    { slug: 'history', name: { ar: 'التاريخ', en: 'History' } },
    { slug: 'regions', name: { ar: 'الجغرافيا والمناطق', en: 'Regions' } },
    { slug: 'people', name: { ar: 'شخصيات بارزة', en: 'Notable figures' } },
    { slug: 'heritage', name: { ar: 'التراث', en: 'Heritage' } },
    { slug: 'economy', name: { ar: 'الاقتصاد والتنمية', en: 'Economy & Development' } },
    { slug: 'nature', name: { ar: 'البيئة والطبيعة', en: 'Nature & Environment' } },
    { slug: 'tourism', name: { ar: 'السياحة والمعالم', en: 'Tourism & Landmarks' } },
  ];
  const items = publicNavigation(sections);
  const before = structuredClone(items);
  assert.deepEqual(items.map(item => navigationLabel(item, 'ar')), ['التاريخ', 'المناطق', 'الشخصيات', 'التراث', 'الاقتصاد', 'الطبيعة', 'السياحة']);
  assert.deepEqual(items.map(item => navigationLabel(item, 'en')), ['History', 'Regions', 'People', 'Heritage', 'Economy', 'Nature', 'Tourism']);
  assert.deepEqual(items, before);
  const custom = { path: 'custom', ar: 'قسم مخصص', en: 'Custom section' };
  assert.equal(navigationLabel(custom, 'ar'), custom.ar);
  assert.equal(navigationLabel(custom, 'en'), custom.en);
});

test('public navigation omits invalid and reserved slugs instead of linking outside encyclopedia sections', () => {
  const input = ['../admin', 'search', 'privacy', 'credits', 'about', 'editorial-policy', 'geography', 'valid-section'].map(slug => ({ slug, name: { ar: 'قسم', en: 'Section' } }));
  assert.deepEqual(publicNavigation(input).map(item => item.path), ['valid-section']);
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
