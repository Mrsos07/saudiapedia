import assert from 'node:assert/strict';
import test from 'node:test';
import type { CollectionBeforeChangeHook, CollectionBeforeOperationHook, PayloadRequest } from 'payload';
import { Articles, enforceArticleWorkflow, persistEditorialDraft } from '../../src/collections/Articles';
import type { Role } from '../../src/collections/access';

type Document = Record<string, unknown>;
// enforceArticleWorkflow validates a changed `section` against the `sections`
// collection via req.payload.count. These workflow tests are not exercising
// section validation itself (see cms.test.ts/editorial-relations.test.ts for
// that), so the double always reports the section as a known, valid slug.
const request = (role?: Role) => ({
  user: role ? { id: 42, collection: 'users', role } : null,
  // Only 'history' (used by draft()/approved() fixtures) is a "known" section;
  // anything else mirrors an unrecognized sections-collection slug.
  payload: { count: async ({ where }: { where?: { slug?: { equals?: unknown } } }) => ({ totalDocs: where?.slug?.equals === 'history' ? 1 : 0 }) },
}) as unknown as PayloadRequest;
const draft = (): Document => ({
  id: 1, locale: 'ar', section: 'history', slug: 'test-article', translationKey: 'test:article',
  title: 'عنوان للاختبار', summary: 'ملخص للاختبار', category: 'اختبار',
  body: [{ heading: 'عنوان', text: 'نص للاختبار، وليس مادة للنشر' }],
  sources: [{ title: 'Test fixture only', url: 'https://example.org/reference' }],
  facts: [{ label: 'Test label', value: 'Test value' }], reviewStatus: 'draft', _status: 'draft',
});
const approved = (): Document => ({ ...draft(), reviewStatus: 'approved', _status: 'published', reviewedBy: 7, reviewedAt: '2026-01-01T00:00:00.000Z' });

async function beforeOperation(req: PayloadRequest, data: Document, operation = 'update', draftSave = false) {
  const args = { data, draft: draftSave };
  await persistEditorialDraft({ req, args, operation } as unknown as Parameters<CollectionBeforeOperationHook>[0]);
  return args;
}

async function save(role: Role | undefined, data: Document, originalDoc?: Document, mergedByPayload = false) {
  const req = request(role);
  await beforeOperation(req, data, originalDoc ? 'update' : 'create');
  // Simulate Payload merging omitted original fields only AFTER recording request intent.
  const input = mergedByPayload ? { ...originalDoc, ...data } : data;
  const result: unknown = await enforceArticleWorkflow({
    req, data: input, originalDoc, operation: originalDoc ? 'update' : 'create', context: {}, collection: Articles,
  } as unknown as Parameters<CollectionBeforeChangeHook>[0]);
  return result as Document;
}

test('anonymous workflow writes are denied', async () => {
  await assert.rejects(save(undefined, draft()), { status: 403 });
});

test('editorial association edits reset approval but populated equivalent IDs do not', async () => {
  const original = { ...approved(), categoryRef: 3, authors: [4, 5] };
  for (const change of [{ categoryRef: 8 }, { categoryRef: null }, { authors: [5, 4] }, { authors: [] }]) {
    const result = await save('editor', change, original, true);
    assert.equal(result.reviewStatus, 'draft');
    assert.equal(result._status, 'draft');
    assert.equal(result.reviewedBy, null);
  }
  const equivalent = await save('editor', { categoryRef: { id: 3 }, authors: [{ id: 4 }, { id: 5 }] }, original);
  assert.notEqual(equivalent.reviewStatus, 'draft');
});

test('editors and translators can draft but cannot newly approve or publish', async () => {
  for (const role of ['editor', 'translator'] as const) {
    assert.equal((await save(role, draft())).reviewStatus, 'draft');
    await assert.rejects(save(role, { ...draft(), reviewStatus: 'approved' }), { status: 403 });
    await assert.rejects(save(role, { ...draft(), _status: 'published' }), { status: 403 });
  }
});

test('explicit reviewer/admin approval records actual identity and server time, not forged audit fields', async () => {
  for (const role of ['reviewer', 'administrator'] as const) {
    const start = Date.now();
    const result = await save(role, { ...draft(), reviewStatus: 'approved', _status: 'published', reviewedBy: 999, reviewedAt: '1900-01-01' });
    assert.equal(result.reviewStatus, 'approved');
    assert.equal(result._status, 'published');
    assert.equal(result.reviewedBy, 42);
    assert.equal(typeof result.reviewedAt, 'string');
    const timestamp = Date.parse(String(result.reviewedAt));
    assert.ok(timestamp >= start && timestamp <= Date.now());
  }
});

test('approval rejects incomplete content, invalid citations and incomplete facts', async () => {
  const invalid: Document[] = [
    { title: ' ' }, { summary: '' }, { category: '' }, { body: [] },
    { body: [{ heading: 'Heading', text: '' }] }, { sources: [] },
    { sources: [{ title: '', url: 'https://example.org' }] },
    { sources: [{ title: 'Test', url: 'javascript:alert(1)' }] },
    { sources: [{ title: 'Test', url: 'https://user:password@example.org' }] },
    { facts: [{ label: 'Missing value', value: '' }] },
  ];
  for (const fields of invalid) {
    await assert.rejects(save('reviewer', { ...draft(), ...fields, reviewStatus: 'approved' }), { status: 400 });
  }
  await assert.rejects(save('reviewer', { ...draft(), _status: 'published' }), { status: 400 });
});

test('substantive edits with stale publication values revoke approval and audit fields', async () => {
  for (const role of ['editor', 'translator'] as const) {
    const result = await save(role, { title: 'Changed', reviewStatus: 'approved', _status: 'published', reviewedBy: 999 }, approved());
    assert.equal(result.reviewStatus, 'draft');
    assert.equal(result._status, 'draft');
    assert.equal(result.reviewedBy, null);
    assert.equal(result.reviewedAt, null);
  }
});

test('reviewer inherited approval is not explicit intent; explicit reapproval permits changed content', async () => {
  const reset = await save('reviewer', { summary: 'Changed' }, approved(), true);
  assert.equal(reset.reviewStatus, 'draft');
  assert.equal(reset._status, 'draft');
  assert.equal(reset.reviewedBy, null);
  const renewed = await save('reviewer', { summary: 'Changed', reviewStatus: 'approved' }, approved());
  assert.equal(renewed.reviewStatus, 'approved');
  assert.equal(renewed.reviewedBy, 42);
});

test('audit-only spoofing cannot replace existing approval; draft audit fields are cleared', async () => {
  const original = approved();
  const result = await save('editor', { reviewedBy: 999, reviewedAt: '1900-01-01' }, original);
  assert.equal(result.reviewedBy, original.reviewedBy);
  assert.equal(result.reviewedAt, original.reviewedAt);
  const unreviewed = await save('editor', { ...draft(), reviewedBy: 999, reviewedAt: '1900-01-01' });
  assert.equal(unreviewed.reviewedBy, null);
  assert.equal(unreviewed.reviewedAt, null);
});

test('row IDs and populated image relationships alone do not count as substantive edits', async () => {
  const original: Document = { ...approved(), image: 10, facts: [{ id: 'old', label: 'Label', value: 'Value' }] };
  const result = await save('editor', { image: { id: 10, url: '/api/media/file/test.webp' }, facts: [{ id: 'new', value: 'Value', label: 'Label' }] }, original);
  assert.equal(({ ...original, ...result }).reviewStatus, 'approved');
  assert.equal(({ ...original, ...result })._status, 'published');
  assert.equal(result.reviewedBy, original.reviewedBy);
});

test('identity validation rejects invalid locale, section, slug, status and changed translation keys', async () => {
  for (const fields of [
    { locale: 'fr' }, { section: 'unknown' }, { slug: 'Uppercase' }, { slug: 'two--hyphens' },
    { translationKey: '' }, { translationKey: 'x'.repeat(161) }, { reviewStatus: 'unknown' }, { _status: 'unknown' },
  ]) await assert.rejects(save('editor', { ...draft(), ...fields }), { status: 400 });
  await assert.rejects(save('administrator', { translationKey: 'replacement' }, draft()), { status: 400 });
});

test('draft saves target the main document; version restore is reviewer-only and never draft-only', async () => {
  const args = await beforeOperation(request('editor'), { title: 'Changed' }, 'update', true);
  assert.equal(args.draft, false);
  assert.equal(args.data._status, 'draft');
  const publishing = await beforeOperation(request('reviewer'), { _status: 'published' }, 'update', true);
  assert.equal(publishing.draft, false);
  assert.equal(publishing.data._status, 'published');
  for (const role of [undefined, 'editor', 'translator'] as const) {
    await assert.rejects(beforeOperation(request(role), {}, 'restoreVersion'), { status: 403 });
  }
  await assert.rejects(beforeOperation(request('reviewer'), {}, 'restoreVersion', true), { status: 400 });
  await beforeOperation(request('reviewer'), {}, 'restoreVersion');
});