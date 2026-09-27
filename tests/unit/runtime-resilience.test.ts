import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import type { PayloadRequest } from 'payload';
import sharp from 'sharp';
import { cachePublicMedia, MediaCache, publicMediaCache, publicMediaKey, resizeMedia } from '../../src/lib/media-cache';
import { isProtectedMedia, MEDIA_WIDTHS, mediaImageLoader, requestedMediaWidth } from '../../src/lib/media-image';
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

test('CMS images request allowlisted widths from the protected endpoint, never /_next/image', () => {
  assert.equal(isProtectedMedia('/api/media/file/asir.webp'), true);
  for (const src of ['/images/desert.jpg', '/api/media/file/a/b.webp', '/api/media/file/a.webp?w=1', 'https://x/api/media/file/a.webp']) {
    assert.equal(isProtectedMedia(src), false, src);
  }
  assert.equal(mediaImageLoader({ src: '/api/media/file/asir.webp', width: 16 }), '/api/media/file/asir.webp?w=256');
  assert.equal(mediaImageLoader({ src: '/api/media/file/asir.webp', width: 750 }), '/api/media/file/asir.webp?w=828');
  assert.equal(mediaImageLoader({ src: '/api/media/file/asir.webp', width: 3840 }), '/api/media/file/asir.webp?w=1920');
  for (const width of MEDIA_WIDTHS) assert.equal(requestedMediaWidth(String(width)), width);
  for (const value of [null, '', '0', '500', '640.5', '0640', '-640', '99999', '640&x']) assert.equal(requestedMediaWidth(value), null, String(value));
});

test('allowlisted widths are resized once to smaller WebP; other widths get the original', async () => {
  const original = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#7a5' } })
    .composite([{ input: Buffer.from('<svg width="1600" height="900"><circle cx="800" cy="450" r="400" fill="#123"/></svg>') }])
    .webp({ quality: 95 }).toBuffer();
  const calls = { count: 0 };
  const handler = cachePublicMedia((async () => {
    calls.count += 1;
    return new Response(new Uint8Array(original), { status: 200, headers: { 'Content-Length': String(original.byteLength), 'Content-Type': 'image/webp', ETag: '"orig"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  }) as Handler);
  const sized = (w: string) => ({ headers: new Headers(), searchParams: new URLSearchParams({ w }) }) as unknown as PayloadRequest;
  const small = await handler(sized('384'), args({ ...published, filesize: original.byteLength })) as Response;
  const bytes = Buffer.from(await small.arrayBuffer());
  assert.equal((await sharp(bytes).metadata()).width, 384);
  assert.ok(bytes.byteLength < original.byteLength / 4);
  assert.equal(small.headers.get('Content-Length'), String(bytes.byteLength));
  assert.equal(small.headers.get('Content-Type'), 'image/webp');
  assert.equal(small.headers.get('ETag'), null, 'the original validator never describes a variant');
  assert.equal(small.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(small.headers.get('X-Content-Type-Options'), 'nosniff');
  const again = Buffer.from(await (await handler(sized('384'), args({ ...published, filesize: original.byteLength })) as Response).arrayBuffer());
  assert.deepEqual(again, bytes);
  const unlisted = Buffer.from(await (await handler(sized('500'), args({ ...published, filesize: original.byteLength })) as Response).arrayBuffer());
  assert.equal(unlisted.byteLength, original.byteLength);
  assert.equal(calls.count, 1, 'storage is read once for the original and all widths');
});

test('a width at or above the original keeps the smaller original bytes', async () => {
  const tiny = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#000' } }).webp().toBuffer();
  const media = { bytes: new Uint8Array(tiny), headers: [['content-type', 'image/webp']] as [string, string][] };
  assert.equal(await resizeMedia(media, 1920), media);
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
