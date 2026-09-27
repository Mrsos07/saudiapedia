import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { PayloadRequest } from 'payload';
import { cachePublicMedia, MediaCache, publicMediaCache, publicMediaKey } from '../../src/lib/media-cache';
import { isClientAbort, observeDatabasePool } from '../../src/lib/payload-runtime';

type Handler = Parameters<typeof cachePublicMedia>[0];
const published = { published: true, filename: 'asir.webp', updatedAt: '2026-09-23T00:00:00.000Z', filesize: 4 };
const request = (headers: Record<string, string> = {}, signal?: AbortSignal) =>
  ({ headers: new Headers(headers), signal }) as unknown as PayloadRequest;
const args = (doc: unknown = published, filename = 'asir.webp') =>
  ({ doc, headers: new Headers(), params: { collection: 'media', filename } }) as unknown as Parameters<Handler>[1];
const storage = (calls: { count: number }, body = 'webp') => (async () => {
  calls.count += 1;
  return new Response(body, { status: 200, headers: { 'Content-Length': String(body.length), 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}) as Handler;

test('public media is read from storage once, then served from memory with the original protective headers', async () => {
  const calls = { count: 0 };
  const handler = cachePublicMedia(storage(calls));
  for (let i = 0; i < 3; i += 1) {
    const response = await handler(request(), args()) as Response;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'webp');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Content-Type'), 'image/webp');
  }
  assert.equal(calls.count, 1);
  await handler(request(), args({ ...published, updatedAt: '2026-09-24T00:00:00.000Z' }));
  assert.equal(calls.count, 2, 'an edited asset never reuses the old bytes');
});

test('unapproved, mismatched, ranged, conditional and staff-only reads bypass the cache', async () => {
  for (const [req, input] of [
    [request(), args({ ...published, published: false })],
    [request(), args(true)],
    [request(), args(null)],
    [request(), args(published, 'other.webp')],
    [request({ range: 'bytes=0-1' }), args()],
    [request({ 'if-none-match': '"etag"' }), args()],
  ] as const) {
    const calls = { count: 0 };
    const handler = cachePublicMedia(storage(calls));
    await handler(req, input);
    await handler(req, input);
    assert.equal(calls.count, 2);
  }
  assert.equal(publicMediaKey({ ...published, updatedAt: undefined }, 'asir.webp'), null);
});

test('non-200, incomplete and oversized storage responses are passed through or rejected, never cached', async () => {
  const calls = { count: 0 };
  const denied = cachePublicMedia((async () => { calls.count += 1; return new Response(null, { status: 404 }); }) as Handler);
  assert.equal((await denied(request(), args()) as Response).status, 404);
  await denied(request(), args());
  assert.equal(calls.count, 2);
  const truncated = cachePublicMedia((async () => new Response('we', { status: 200, headers: { 'Content-Length': '4' } })) as Handler);
  await assert.rejects(Promise.resolve(truncated(request(), args())), /Incomplete media read/);
  const oversized = { count: 0 };
  const large = cachePublicMedia((async () => { oversized.count += 1; return new Response('x', { status: 200, headers: { 'Content-Length': String(11 * 1024 * 1024) } }); }) as Handler);
  await large(request(), args());
  await large(request(), args());
  assert.equal(oversized.count, 2);
});

test('a browser that leaves during the first storage read gets no error log or cache entry', async () => {
  const controller = new AbortController();
  const handler = cachePublicMedia((async () => new Response(new ReadableStream({
    start(stream) { controller.abort(); stream.error(new Error('aborted')); },
  }), { status: 200, headers: { 'Content-Length': '4' } })) as Handler);
  assert.equal((await handler(request({}, controller.signal), args()) as Response).status, 499);
});

test('the memory cache evicts least recently used assets within its byte budget', () => {
  const cache = new MediaCache(10);
  const item = (size: number) => ({ bytes: new Uint8Array(size), headers: [] });
  cache.set('a', item(4));
  cache.set('b', item(4));
  cache.get('a');
  cache.set('c', item(4));
  assert.ok(cache.get('a'));
  assert.equal(cache.get('b'), undefined);
  assert.ok(cache.get('c'));
  assert.equal(cache.bytes, 8);
  cache.set('huge', item(11));
  assert.equal(cache.get('huge'), undefined);
});

test('the plugin wraps only the media storage handler, after S3 registration', async () => {
  const handler = (() => undefined) as Handler;
  const config = await publicMediaCache({
    collections: [{ slug: 'media', upload: { handlers: [handler] }, fields: [] }, { slug: 'articles', fields: [] }],
  } as never);
  const [media, articles] = config.collections!;
  assert.notEqual((media.upload as { handlers: Handler[] }).handlers[0], handler);
  assert.equal(articles.upload, undefined);
  const source = await readFile('src/payload.config.ts', 'utf8');
  assert.match(source, /s3Storage\(\{[\s\S]*\}\), publicMediaCache\]/);
  assert.match(source, /logger: payloadLogger/);
  assert.match(source, /onInit: observeDatabasePool/);
});

test('only AWS SDK aborts caused by the request signal are downgraded', () => {
  const sdkAbort = Object.assign(new Error('Request aborted'), { name: 'AbortError', $metadata: { attempts: 1 } });
  assert.equal(isClientAbort(sdkAbort), true);
  assert.equal(isClientAbort(Object.assign(new Error('timeout'), { name: 'TimeoutError', $metadata: {} })), false);
  assert.equal(isClientAbort(Object.assign(new Error('x'), { name: 'AbortError' })), false);
  assert.equal(isClientAbort('AbortError'), false);
});

test('idle database connection failures are logged instead of crashing the process', () => {
  const pool = new EventEmitter();
  const warnings: unknown[] = [];
  const payload = { db: { pool }, logger: { warn: (...values: unknown[]) => warnings.push(values) } };
  observeDatabasePool(payload as never);
  observeDatabasePool(payload as never);
  assert.equal(pool.listenerCount('error'), 1);
  assert.doesNotThrow(() => pool.emit('error', Object.assign(new Error('postgres://secret@host'), { code: 'ECONNRESET' })));
  assert.deepEqual(warnings, [[{ code: 'ECONNRESET' }, 'Idle database connection closed; the pool replaces it on the next query.']]);
  assert.doesNotMatch(JSON.stringify(warnings), /secret|postgres:/);
});
