import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { hasLocalMatch } from 'next/dist/shared/lib/match-local-pattern.js';
import nextConfig from '../../next.config.mjs';
import { proxy } from '../../src/proxy';
import { boundRequestBody, checkMutationOrigin, HTTPRequestError } from '../../src/lib/http-security';

const origin = 'https://example.org';

test('private CMS media cannot be passed through the public Next image cache', () => {
  for (const path of ['/api/media/file/private.webp', '/api/media/file/public.webp', '/admin/image', '/images/a.jpg?token=test']) {
    assert.equal(hasLocalMatch(nextConfig.images?.localPatterns, path), false, path);
  }
  for (const path of ['/images/desert.jpg', '/images/kings/king-salman.webp', '/brand/saudi-map-logo.svg']) {
    assert.equal(hasLocalMatch(nextConfig.images?.localPatterns, path), true, path);
  }
});

test('page CSP has a fresh nonce and cannot trust client-supplied nonce headers', () => {
  const request = new NextRequest(origin + '/ar', { headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src 'unsafe-inline'" } });
  const first = proxy(request);
  const second = proxy(request);
  const csp = first.headers.get('content-security-policy')!;
  assert.match(csp, /script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.doesNotMatch(csp.split('script-src ')[1].split(';')[0], /unsafe-inline|attacker/);
  assert.notEqual(csp, second.headers.get('content-security-policy'));
  const nonce = first.headers.get('x-middleware-request-x-nonce');
  assert.ok(nonce && nonce !== 'attacker' && csp.includes("'nonce-" + nonce + "'"));
});

test('mutation origin checks reject cross-site requests while supporting explicit API clients', () => {
  assert.doesNotThrow(() => checkMutationOrigin(new Request(origin + '/api/articles'), origin));
  assert.doesNotThrow(() => checkMutationOrigin(new Request(origin + '/api/articles', { method: 'POST', headers: { Origin: origin } }), origin));
  assert.doesNotThrow(() => checkMutationOrigin(new Request(origin + '/api/articles', { method: 'PATCH' }), origin));
  const attacks: Record<string, string>[] = [{ Origin: 'https://other.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }];
  for (const headers of attacks) {
    assert.throws(() => checkMutationOrigin(new Request(origin + '/api/articles', { method: 'POST', headers }), origin), (error: unknown) => error instanceof HTTPRequestError && error.status === 403);
  }
});

test('request body limit counts real streamed bytes and preserves accepted bodies', async () => {
  const request = new Request(origin + '/api/articles', { method: 'POST', body: '{"title":"test"}', headers: { 'Content-Type': 'application/json' } });
  const bounded = await boundRequestBody(request, 32);
  assert.equal(await bounded.text(), '{"title":"test"}');
  let cancelled = false;
  const oversized = new Request(origin + '/api/articles', { method: 'POST', body: new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(33)); }, cancel() { cancelled = true; },
  }), duplex: 'half' } as RequestInit & { duplex: 'half' });
  await assert.rejects(boundRequestBody(oversized, 32), (error: unknown) => error instanceof HTTPRequestError && error.status === 413);
  assert.equal(cancelled, true);
  await assert.rejects(boundRequestBody(new Request(origin, { method: 'POST', body: 'a', headers: { 'content-length': '100' } }), 32), (error: unknown) => error instanceof HTTPRequestError && error.status === 413);
  await assert.rejects(boundRequestBody(new Request(origin, { method: 'POST', body: 'a', headers: { 'content-encoding': 'gzip' } }), 32), (error: unknown) => error instanceof HTTPRequestError && error.status === 415);
});

test('bounded multipart requests preserve file bytes, payload and authentication headers', async () => {
  const form = new FormData();
  form.set('_payload', '{"alt":"test"}');
  form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'fixture.png');
  const request = new Request(origin + '/api/media', { method: 'POST', body: form, headers: { Origin: origin, Authorization: 'Bearer test-only' } });
  const result = await boundRequestBody(request, 2048);
  assert.equal(result.headers.get('authorization'), 'Bearer test-only');
  assert.equal(result.headers.get('origin'), origin);
  const parsed = await result.formData();
  assert.equal(parsed.get('_payload'), '{"alt":"test"}');
  const file = parsed.get('file');
  assert.ok(file && typeof file !== 'string');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1, 2, 3]);
});

test('stalled request bodies time out rather than holding a worker indefinitely', async () => {
  let cancelled = false;
  const request = new Request(origin, { method: 'POST', body: new ReadableStream({ cancel() { cancelled = true; } }), duplex: 'half' } as RequestInit & { duplex: 'half' });
  await assert.rejects(boundRequestBody(request, 32, 20), (error: unknown) => error instanceof HTTPRequestError && error.status === 408);
  assert.equal(cancelled, true);
});
