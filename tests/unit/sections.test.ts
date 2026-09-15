import assert from 'node:assert/strict';
import test from 'node:test';
import { APIError, type CollectionConfig, type PayloadRequest } from 'payload';
import { Sections, enforceSectionSlugImmutable, protectReferencedSection } from '../../src/collections/Sections';
import { roles } from '../../src/collections/access';

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
