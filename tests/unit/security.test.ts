import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Access, CollectionBeforeChangeHook, CollectionBeforeOperationHook, PayloadRequest } from 'payload';
import { boundPublicReads, canReview, hasRole, isAdmin, isStaff, publishedArticleWhere, roles, validHTTPURL, validateURL, type Role } from '../../src/collections/access';
import { Articles } from '../../src/collections/Articles';
import { Media, enforceMediaPublication } from '../../src/collections/Media';
import { Sources } from '../../src/collections/Sources';
import { Users, protectUser } from '../../src/collections/Users';

type Document = Record<string, unknown>;
function request(role?: Role, existingUser = true): PayloadRequest {
  return {
    user: role ? { id: 42, role, collection: 'users' } : null,
    payload: { db: { findOne: async () => existingUser ? { id: 1, role: 'administrator' } : null, find: async () => ({ docs: [], hasNextPage: false }) } },
  } as unknown as PayloadRequest;
}
async function access(check: Access | undefined, req: PayloadRequest) {
  assert.ok(check, 'Expected an explicit collection access rule');
  return check({ req });
}
async function userSave(req: PayloadRequest, data: Document, operation: 'create' | 'update') {
  const result: unknown = await protectUser({ req, data, operation, context: {}, collection: Users } as unknown as Parameters<CollectionBeforeChangeHook>[0]);
  return result as Document;
}
async function mediaBefore(req: PayloadRequest, data: Document) {
  const hook = Media.hooks?.beforeOperation?.[0];
  assert.ok(hook);
  await hook({ req, args: { id: 12, data }, operation: 'update' } as unknown as Parameters<CollectionBeforeOperationHook>[0]);
}
async function mediaSave(role: Role | undefined, data: Document, originalDoc?: Document, inherited = false) {
  const req = { ...request(role), payload: { findByID: async () => originalDoc ?? {} } } as unknown as PayloadRequest;
  await mediaBefore(req, data);
  const result: unknown = await enforceMediaPublication({
    req, data: inherited ? { ...originalDoc, ...data } : data, originalDoc,
    operation: originalDoc ? 'update' : 'create', collection: Media, context: {},
  } as unknown as Parameters<CollectionBeforeChangeHook>[0]);
  return result as Document;
}

test('database provisioning no longer reads passwords from repository files', async () => {
  const script = await readFile(new URL('../../scripts/cms-database.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /parseEnv|readFileSync\(['"]\.env/);
  assert.match(script, /required\('CMS_DATABASE_ADMIN_PASSWORD'\)/);
  const launcher = await readFile(new URL('../../scripts/cms-local.ps1', import.meta.url), 'utf8');
  assert.ok(launcher.includes("if ($Action -notin @('inspect', 'provision'))"));
  assert.ok(launcher.includes('Remove-Item Env:CMS_DATABASE_ADMIN_PASSWORD -ErrorAction SilentlyContinue'));
});

test('role checks require an actual users identity and enforce reviewer/admin separation', async () => {
  for (const role of roles) {
    const req = request(role);
    assert.equal(await isStaff({ req }), true);
    assert.equal(await isAdmin({ req }), role === 'administrator');
    assert.equal(canReview(req), role === 'administrator' || role === 'reviewer');
  }
  for (const user of [null, { id: 1, collection: 'other', role: 'administrator' }, { id: 1, collection: 'users', role: 'owner' }]) {
    const req = { user } as unknown as PayloadRequest;
    assert.equal(hasRole(req, roles), false);
    assert.equal(await isStaff({ req }), false);
    assert.equal(canReview(req), false);
  }
});

test('anonymous collection access allows only approved publications and released media', async () => {
  const req = request();
  assert.deepEqual(await access(Articles.access?.read, req), { and: [publishedArticleWhere, { id: { in: [] } }] });
  assert.deepEqual(publishedArticleWhere, { and: [{ _status: { equals: 'published' } }, { reviewStatus: { equals: 'approved' } }] });
  assert.deepEqual(await access(Media.access?.read, req), { published: { equals: true } });
  for (const collection of [Articles, Media, Sources, Users]) {
    for (const operation of ['create', 'update', 'delete'] as const) assert.equal(await access(collection.access?.[operation], req), false);
  }
  assert.equal(await access(Articles.access?.readVersions, req), false);
  assert.equal(await access(Sources.access?.read, req), false);
  assert.equal(await access(Users.access?.read, req), false);
});

test('staff can research/edit, but only administrators can delete content or manage users', async () => {
  for (const role of roles) {
    const req = request(role);
    for (const collection of [Articles, Media, Sources]) {
      for (const operation of ['read', 'create', 'update'] as const) assert.equal(await access(collection.access?.[operation], req), true);
      assert.equal(await access(collection.access?.delete, req), role === 'administrator');
    }
    assert.equal(await access(Articles.access?.readVersions, req), true);
    assert.equal(await access(Users.access?.create, req), role === 'administrator');
    assert.equal(await access(Users.access?.update, req), role === 'administrator');
    assert.equal(await access(Users.access?.unlock, req), role === 'administrator');
    assert.equal(await access(Users.access?.delete, req), false);
    assert.deepEqual(await access(Users.access?.read, req), role === 'administrator' ? true : { id: { equals: 42 } });
  }
});

test('users reject forged role changes and anonymous creation after bootstrap', async () => {
  for (const role of [undefined, 'editor', 'translator', 'reviewer'] as const) {
    await assert.rejects(userSave(request(role), { role: 'administrator' }, 'update'), { status: 403 });
    await assert.rejects(userSave(request(role), { role: 'administrator' }, 'create'), { status: 403 });
  }
  await assert.rejects(userSave(request('administrator'), { role: 'owner' }, 'update'), { status: 400 });
  const updated = await userSave(request('administrator'), { role: 'reviewer', bootstrapKey: 'forged' }, 'update');
  assert.equal(updated.role, 'reviewer');
  assert.equal('bootstrapKey' in updated, false);
  const created = await userSave(request('administrator'), { role: 'editor', bootstrapKey: 'forged' }, 'create');
  assert.equal(created.bootstrapKey, null);
});

test('first-user hook forces administrator singleton; ordinary anonymous create access remains closed', async () => {
  const req = request(undefined, false);
  assert.equal(await access(Users.access?.create, req), false);
  const priorBootstrap = process.env.CMS_ALLOW_BOOTSTRAP;
  let first: Document;
  try {
    process.env.CMS_ALLOW_BOOTSTRAP = 'true';
    first = await userSave(req, { role: 'reviewer', bootstrapKey: 'forged' }, 'create');
  } finally {
    if (priorBootstrap === undefined) delete process.env.CMS_ALLOW_BOOTSTRAP;
    else process.env.CMS_ALLOW_BOOTSTRAP = priorBootstrap;
  }
  assert.equal(first.role, 'administrator');
  assert.equal(first.bootstrapKey, 'first-administrator');
  const field = Users.fields.find((item) => 'name' in item && item.name === 'bootstrapKey');
  assert.ok(field && 'unique' in field && field.unique);
  // The actual concurrent-first-register race requires PostgreSQL integration testing.
});

test('new passwords are strong and unavailable email recovery is blocked before operations', async () => {
  const hook = Users.hooks?.beforeOperation?.[0];
  assert.ok(hook, 'Account operations must be guarded');
  const call = (operation: string, data: Document) => Promise.resolve().then(() => hook({ operation, args: { data }, req: request('administrator') } as unknown as Parameters<CollectionBeforeOperationHook>[0]));
  for (const password of ['abc', 'short-password', '               ', 'x'.repeat(129), 12345]) {
    await assert.rejects(call('create', { password }), { status: 400 });
    await assert.rejects(call('update', { password }), { status: 400 });
  }
  await call('create', { password: 'A long test-only passphrase 2026' });
  await call('update', { name: 'Unchanged password' });
  await call('update', { password: '' });
  await call('login', { password: 'legacy-password' });
  for (const operation of ['forgotPassword', 'resetPassword']) await assert.rejects(call(operation, { password: 'A long test-only passphrase 2026' }), { status: 403 });
});

test('bootstrap is closed unless explicitly enabled by the operator', async () => {
  const before = process.env.CMS_ALLOW_BOOTSTRAP;
  try {
    delete process.env.CMS_ALLOW_BOOTSTRAP;
    await assert.rejects(userSave(request(undefined, false), {}, 'create'), { status: 403 });
  } finally {
    if (before === undefined) delete process.env.CMS_ALLOW_BOOTSTRAP;
    else process.env.CMS_ALLOW_BOOTSTRAP = before;
  }
});

test('media publication is separate approval and edits revoke stale/inherited approval', async () => {
  await assert.rejects(mediaSave(undefined, { published: false }), { status: 403 });
  for (const role of ['editor', 'translator'] as const) {
    await assert.rejects(mediaSave(role, { published: true }), { status: 403 });
    assert.equal((await mediaSave(role, { alt: 'Changed', published: true }, { alt: 'Original', published: true })).published, false);
  }
  for (const role of ['reviewer', 'administrator'] as const) {
    assert.equal((await mediaSave(role, { published: true })).published, true);
    assert.equal((await mediaSave(role, { alt: 'Changed' }, { alt: 'Original', published: true }, true)).published, false);
    assert.equal((await mediaSave(role, { alt: 'Changed', published: true }, { alt: 'Original', published: true })).published, true);
  }
});

test('upload settings restrict MIME, re-encode WebP, cap dimensions and disable public caching', () => {
  const upload = Media.upload;
  assert.ok(upload && typeof upload === 'object');
  assert.deepEqual(upload.mimeTypes, ['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
  assert.equal(upload.formatOptions?.format, 'webp');
  assert.equal(upload.resizeOptions?.width, 2400);
  assert.equal(upload.resizeOptions?.height, 2400);
  assert.ok(upload.staticDir?.endsWith('private-uploads'));
  const modify = upload.modifyResponseHeaders;
  assert.ok(modify);
  const headers = new Headers();
  modify({ headers } as unknown as Parameters<typeof modify>[0]);
  assert.equal(headers.get('Cache-Control'), 'private, no-store');
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
});

test('original upload validation rejects prohibited MIME, disguised SVG and corrupt bytes; accepts genuine PNG', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>');
  const uploadRequest = (mimetype: string, data: Buffer) => ({
    ...request('editor'), file: { mimetype, data, name: 'test-image', size: data.length },
  }) as unknown as PayloadRequest;
  for (const mime of ['image/svg+xml', 'text/html', 'application/pdf', 'image/gif']) {
    await assert.rejects(mediaBefore(uploadRequest(mime, svg), {}), { status: 400 });
  }
  await assert.rejects(mediaBefore(uploadRequest('image/jpeg', svg), {}), { status: 400 });
  await assert.rejects(mediaBefore(uploadRequest('image/png', Buffer.from('not an image')), {}));
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#006c35' } }).png().toBuffer();
  await mediaBefore(uploadRequest('image/png', png), {});
});

test('media identity cannot be redirected to another file before upload processing', async () => {
  for (const role of ['editor', 'reviewer', 'administrator'] as const) {
    const req = { ...request(role), payload: { findByID: async () => ({ id: 12, filename: 'original.webp', url: '/api/media/file/original.webp', prefix: '' }) } } as unknown as PayloadRequest;
    await assert.rejects(mediaBefore(req, { filename: 'another.webp', url: '/api/media/file/another.webp', crop: { x: 0, y: 0, width: 1, height: 1 } }), { status: 400 });
    await assert.rejects(mediaBefore(req, { url: 'https://example.org/remote.webp', filename: 'original.webp' }), { status: 400 });
    await assert.rejects(mediaBefore(req, { prefix: '../other' }), { status: 400 });
  }
  await assert.rejects(mediaBefore(request(), {}), { status: 403 });
});

test('focal point edits revoke media publication without explicit review', async () => {
  const original = { published: true, focalX: 50, focalY: 50 };
  assert.equal((await mediaSave('editor', { focalX: 10 }, original)).published, false);
  assert.equal((await mediaSave('reviewer', { focalY: 10 }, original)).published, false);
  assert.equal((await mediaSave('reviewer', { focalY: 10, published: true }, original)).published, true);
});

test('valid metadata saves and protected-URL equivalents remain supported', async () => {
  const original = { id: 12, filename: 'original.webp', url: 'https://example.org/api/media/file/original.webp', prefix: '', focalX: 50, focalY: 50 };
  const req = { ...request('editor'), payload: { config: { serverURL: 'https://example.org' }, findByID: async () => original }, query: {} } as unknown as PayloadRequest;
  await mediaBefore(req, { filename: original.filename, url: '/api/media/file/original.webp', prefix: '' });
  await mediaBefore(req, { alt: 'New alt' });
  req.query = { uploadEdits: { focalPoint: { x: 30, y: 50 } } };
  const data = { published: true };
  await mediaBefore(req, data);
  const result = await enforceMediaPublication({ data, originalDoc: { ...original, published: true }, req } as unknown as Parameters<CollectionBeforeChangeHook>[0]);
  assert.equal(result.published, false);
});

test('oversized crop requests are rejected before reading or decoding stored files', async () => {
  const req = { ...request('editor'), query: { uploadEdits: { crop: { x: 0, y: 0 }, widthInPixels: '99999999', heightInPixels: '99999999' } } } as unknown as PayloadRequest;
  await assert.rejects(mediaBefore(req, {}), { status: 400 });
  req.query = { uploadEdits: { focalPoint: { x: '-1', y: '50' } } };
  await assert.rejects(mediaBefore(req, {}), { status: 400 });
});

test('actual upload bytes are limited independently of declared file size', async () => {
  const req = { ...request('editor'), file: { data: Buffer.alloc(10 * 1024 * 1024 + 1), mimetype: 'image/png', size: 1, name: 'test.png' } } as unknown as PayloadRequest;
  await assert.rejects(mediaBefore(req, {}), { status: 413 });
});

test('administrator password changes revoke existing sessions', async () => {
  const result = await userSave(request('administrator'), { password: 'A long test-only passphrase 2026', sessions: [{ id: 'old-test-session' }] }, 'update');
  assert.deepEqual(result.sessions, []);
});

test('anonymous collection reads cannot request unlimited results or deep population', async () => {
  for (const limit of [0, 1000000, -1, Number.NaN]) {
    const args = { limit, depth: 999, pagination: false };
    await boundPublicReads({ args, operation: 'find', req: request() } as unknown as Parameters<CollectionBeforeOperationHook>[0]);
    assert.ok(args.limit >= 1 && args.limit <= 100);
    assert.equal(args.depth, 2);
    assert.equal(args.pagination, true);
  }
  const staff = { limit: 0, depth: 1, pagination: false };
  await boundPublicReads({ args: staff, operation: 'find', req: request('administrator') } as unknown as Parameters<CollectionBeforeOperationHook>[0]);
  assert.equal(staff.limit, 0);
  assert.equal(staff.pagination, false);
});

test('HTTP URL validation refuses executable/relative/credential-bearing references', () => {
  for (const url of ['https://example.org/reference', 'http://example.org/path?q=1#section']) {
    assert.equal(validHTTPURL(url), true);
    assert.equal(validateURL(url), true);
  }
  for (const url of [null, 42, '', '/relative', '//example.org', 'javascript:alert(1)', 'data:text/html,test', 'ftp://example.org', 'https://user:secret@example.org']) {
    assert.equal(validHTTPURL(url), false);
    assert.equal(typeof validateURL(url), 'string');
  }
});

test('article identity constraints and authentication limits are configured, not proven against a database', () => {
  assert.deepEqual(Articles.indexes, [
    { fields: ['slug', 'locale', 'section'], unique: true },
    { fields: ['translationKey', 'locale'], unique: true },
  ]);
  assert.ok(Users.auth && typeof Users.auth === 'object');
  // Three failed attempts lock the account for a full hour.
  assert.equal(Users.auth.maxLoginAttempts, 3);
  assert.equal(Users.auth.lockTime, 3600000);
  assert.equal(Users.auth.tokenExpiration, 7200);
});