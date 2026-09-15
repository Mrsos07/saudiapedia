import assert from 'node:assert/strict';
import test from 'node:test';
import { APIError, type CollectionConfig, type PayloadRequest } from 'payload';
import { Categories, enforceCategorySection, protectReferencedCategory } from '../../src/collections/Categories';
import { Authors, protectReferencedAuthor } from '../../src/collections/Authors';
import { roles } from '../../src/collections/access';
import {
  MAX_ARTICLE_AUTHORS, canonicalRelationshipID, canonicalRelationshipIDs,
  sameEditorialRelations, validateEditorialRelations, type EditorialArticleDocument,
} from '../../src/collections/editorial-relations';

type LookupOptions = Parameters<PayloadRequest['payload']['findByID']>[0];
type RelationArgs = Parameters<typeof validateEditorialRelations>[0];
type SectionArgs = Parameters<typeof enforceCategorySection>[0];
type Document = Partial<EditorialArticleDocument>;

function request(
  lookup: (options: LookupOptions) => Promise<unknown> = async () => { assert.fail('Unexpected category lookup'); },
  count: (options: unknown) => Promise<{ totalDocs: number }> = async () => ({ totalDocs: 1 }),
): PayloadRequest {
  // Only the request members consumed by these hooks are mocked; no Payload boot or DB.
  const mock = {
    user: { id: 42, collection: 'users', role: 'editor' },
    payload: { findByID: lookup, count },
  };
  return mock as unknown as PayloadRequest;
}

async function validate(data?: Document, originalDoc?: EditorialArticleDocument, req = request()): Promise<unknown> {
  return validateEditorialRelations({
    data, originalDoc, req, context: {}, operation: originalDoc ? 'update' : 'create',
    collection: { slug: 'articles' },
  } as unknown as RelationArgs);
}

async function categoryChange(
  data: SectionArgs['data'], originalDoc?: SectionArgs['originalDoc'],
  count: (options: unknown) => Promise<{ totalDocs: number }> = async () => ({ totalDocs: 1 }),
): Promise<unknown> {
  return enforceCategorySection({
    data, originalDoc, req: request(undefined, count), context: {}, collection: Categories,
    operation: originalDoc ? 'update' : 'create',
  } as unknown as SectionArgs);
}

function field(collection: CollectionConfig, name: string) {
  const result = collection.fields.find((item) => 'name' in item && item.name === name);
  assert.ok(result, `Missing ${name} field`);
  return result;
}

test('collections are staff-only for read/create/update, administrator-only for delete, and authors are not login accounts', async () => {
  for (const collection of [Categories, Authors]) {
    assert.deepEqual(collection.admin?.group, { ar: 'المحتوى', en: 'Content' });
    assert.equal(collection.admin?.useAsTitle, 'nameAr');
    for (const user of [null, { id: 1, collection: 'users', role: 'visitor' },
      { id: 1, collection: 'authors', role: 'administrator' },
      ...roles.map((role) => ({ id: 1, collection: 'users', role }))]) {
      const req = { user } as unknown as PayloadRequest;
      const staff = user?.collection === 'users' && roles.some((role) => role === user.role);
      const admin = user?.collection === 'users' && user.role === 'administrator';
      for (const operation of ['read', 'create', 'update', 'delete'] as const) {
        const access = collection.access?.[operation];
        assert.ok(access);
        assert.equal(await access({ req }), operation === 'delete' ? admin : staff);
      }
    }
    for (const name of ['nameAr', 'nameEn']) {
      const nameField = field(collection, name);
      assert.equal(nameField.type, 'text');
      assert.ok('required' in nameField && nameField.required);
      assert.ok('label' in nameField && typeof nameField.label === 'object');
    }
    assert.equal(collection.fields.some((item) => item.type === 'join'), false);
  }
  assert.equal(Authors.auth, false);
  assert.equal(Authors.fields.some((item) => 'name' in item && ['email', 'password', 'role'].includes(item.name)), false);
  for (const [collection, names] of [
    [Categories, ['descriptionAr', 'descriptionEn']], [Authors, ['bioAr', 'bioEn']],
  ] as const) {
    for (const name of names) {
      const optional = field(collection, name);
      assert.equal(optional.type, 'textarea');
      assert.ok(!('required' in optional) || !optional.required);
    }
  }
});

test('categories reference sections by slug (validated against the sections collection), and section is immutable after creation', async () => {
  const section = field(Categories, 'section');
  assert.equal(section.type, 'text');
  assert.equal(section.required, true);
  assert.ok(Categories.hooks?.beforeChange?.includes(enforceCategorySection));
  const original = { id: 1, section: 'history' };
  assert.deepEqual(await categoryChange({ section: 'history' }), { section: 'history' });
  assert.deepEqual(await categoryChange({}, original), {});
  assert.deepEqual(await categoryChange({ section: 'history' }, original), { section: 'history' });
  // Changing to a different value after creation is always rejected, regardless of validity.
  await assert.rejects(categoryChange({ section: 'regions' }, original), { status: 400 });
  for (const section of [null, '']) {
    await assert.rejects(categoryChange({ section }), { status: 400 });
  }
  // A nonempty section that does not exist in the sections collection is rejected.
  await assert.rejects(categoryChange({ section: 'nonexistent' }, undefined, async () => ({ totalDocs: 0 })), { status: 400 });
});

test('deleting a category or author referenced by existing articles is rejected; unreferenced ones are not', async () => {
  for (const [protect, where] of [
    [protectReferencedCategory, 'categoryRef'], [protectReferencedAuthor, 'authors'],
  ] as const) {
    const req = (count: number) => ({
      user: { id: 1, collection: 'users', role: 'administrator' },
      payload: { count: async (options: { where?: Record<string, unknown> }) => {
        assert.deepEqual(options.where, { [where]: { equals: 7 } });
        return { totalDocs: count };
      } },
    }) as unknown as PayloadRequest;
    await assert.rejects(protect({ id: 7, req: req(1), context: {}, collection: Categories } as never),
      (error: unknown) => error instanceof APIError && error.status === 409);
    await protect({ id: 7, req: req(0), context: {}, collection: Categories } as never);
  }
});

test('canonical identities equate scalar/populated IDs without comparing private document contents', () => {
  assert.equal(canonicalRelationshipID(7), '7');
  assert.equal(canonicalRelationshipID({ id: '7', nameAr: 'اختبار فقط' }), '7');
  assert.equal(canonicalRelationshipID('fixture-id'), 'fixture-id');
  assert.equal(canonicalRelationshipID(0), '0');
  assert.equal(canonicalRelationshipID(null), null);
  assert.equal(canonicalRelationshipID(undefined), null);
  assert.deepEqual(canonicalRelationshipIDs([1, { id: '2' }, 'fixture-id']), ['1', '2', 'fixture-id']);
  assert.deepEqual(canonicalRelationshipIDs([1, 1]), ['1', '1']);
  assert.deepEqual(canonicalRelationshipIDs(null), []);
  assert.deepEqual(canonicalRelationshipIDs(undefined), []);
});

test('malformed scalar and list relationships throw APIError without leaking input', () => {
  for (const value of ['', ' ', true, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1,
    [], {}, { id: null }, { id: { id: 1 } }, { relationTo: 'categories', value: 1 }]) {
    assert.throws(() => canonicalRelationshipID(value), (error: unknown) => error instanceof APIError && error.status === 400);
  }
  for (const value of [1, '1', {}, [null], [undefined], [{}], [[1]], new Array<unknown>(1)]) {
    assert.throws(() => canonicalRelationshipIDs(value), { status: 400 });
  }
});

test('author lists are bounded at 20 while retaining credit order', () => {
  assert.equal(MAX_ARTICLE_AUTHORS, 20);
  const authors = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.equal(canonicalRelationshipIDs(authors).length, 20);
  assert.throws(() => canonicalRelationshipIDs([...authors, 21]), { status: 400 });
  assert.deepEqual(canonicalRelationshipIDs([2, 1]), ['2', '1']);
});

test('private pair matching is legacy-compatible and requires equal category and ordered author identities', () => {
  assert.equal(sameEditorialRelations({}, {}), true);
  assert.equal(sameEditorialRelations({}, { categoryRef: null, authors: [] }), true);
  assert.equal(sameEditorialRelations({ authors: null }, {}), true);
  assert.equal(sameEditorialRelations(
    { categoryRef: 1, authors: [2, 3] },
    { categoryRef: { id: '1', section: 'history' }, authors: [{ id: 2 }, '3'] },
  ), true);
  for (const other of [{}, { categoryRef: 9, authors: [2, 3] }, { categoryRef: 1 },
    { categoryRef: 1, authors: [3, 2] }, { categoryRef: 1, authors: [2] },
    { categoryRef: 1, authors: [2, 3, 3] }]) {
    assert.equal(sameEditorialRelations({ categoryRef: 1, authors: [2, 3] }, other), false);
    assert.equal(sameEditorialRelations(other, { categoryRef: 1, authors: [2, 3] }), false);
  }
  assert.throws(() => sameEditorialRelations({}, { categoryRef: {} }), { status: 400 });
  assert.throws(() => sameEditorialRelations({ categoryRef: 1 }, { categoryRef: 2, authors: 'bad' }), { status: 400 });
});

test('legacy writes, omitted category with unchanged section, and explicit removal do not query', async () => {
  assert.equal(await validate(), undefined);
  await validate({});
  await validate({ section: 'history' });
  await validate({ authors: [1, { id: 2 }] });
  await validate({}, { id: 1, section: 'history', categoryRef: 7 });
  await validate({ section: 'history' }, { id: 1, section: 'history', categoryRef: 7 });
  await validate({ categoryRef: undefined }, { id: 1, section: 'history', categoryRef: 7 });
  await validate({ section: 'regions' }, { id: 1, section: 'history' });
  const removal = { categoryRef: null, section: 'regions' };
  assert.equal(await validate(removal, { id: 1, section: 'history', categoryRef: 7 }), removal);
});

test('category lookup enforces access, actual user and request; submitted populated section is not trusted', async () => {
  const calls: LookupOptions[] = [];
  const req = request(async (options) => {
    calls.push(options);
    return { id: 7, section: 'history' };
  });
  const data = { categoryRef: { id: 7, section: 'regions' }, section: 'history' };
  assert.equal(await validate(data, undefined, req), data);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    collection: 'categories', id: '7', overrideAccess: false, user: req.user, req,
    depth: 0, select: { section: true },
  });
  assert.equal(calls[0].req, req);
  assert.equal(calls[0].user, req.user);
  await assert.rejects(validate({ categoryRef: { id: 7, section: 'regions' }, section: 'regions' }, undefined, req), { status: 400 });
});

test('category-only edits inherit section; section-only edits revalidate the original category', async () => {
  const calls: LookupOptions[] = [];
  const req = request(async (options) => {
    calls.push(options);
    return { id: 7, section: 'history' };
  });
  const original = { id: 1, section: 'history', categoryRef: { id: 7 } };
  await validate({ categoryRef: 7 }, original, req);
  await assert.rejects(validate({ section: 'regions' }, original, req), { status: 400 });
  assert.deepEqual(calls.map(({ id }) => id), ['7', '7']);
  await validate({ section: 'regions', categoryRef: 8 }, original,
    request(async (options) => { assert.equal(options.id, '8'); return { id: 8, section: 'regions' }; }));
});

test('malformed references and oversized author lists fail before any category lookup', async () => {
  await assert.rejects(validate({ categoryRef: {}, section: 'history' }), { status: 400 });
  await assert.rejects(validate({ authors: '1', categoryRef: 1, section: 'history' }), { status: 400 });
  await assert.rejects(validate({ authors: [null] }), { status: 400 });
  await assert.rejects(validate({ authors: Array.from({ length: 21 }, (_, index) => index) }), { status: 400 });
});

test('missing, inaccessible and failed category reads never silently fall back', async () => {
  const data = { categoryRef: 7, section: 'history' };
  for (const result of [null, {}, { section: 'regions' }]) {
    await assert.rejects(validate(data, undefined, request(async () => result)), { status: 400 });
  }
  for (const error of [new APIError('Test access denial', 403), new APIError('Test missing category', 404), new Error('Test unavailable')]) {
    await assert.rejects(validate(data, undefined, request(async () => { throw error; })),
      (caught: unknown) => caught === error);
  }
  for (const section of [undefined, null, '']) {
    await assert.rejects(validate({ categoryRef: 7, section }, undefined,
      request(async () => ({ section }))), { status: 400 });
  }
});