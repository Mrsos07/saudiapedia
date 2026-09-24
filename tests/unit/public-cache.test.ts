import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { invalidatesPublicContent, PUBLIC_CONTENT_TTL_SECONDS } from '../../src/lib/public-cache';

test('only accepted REST writes to public content collections expire the shared cache', () => {
  for (const collection of ['articles', 'media', 'categories', 'sections', 'authors', 'sources']) {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      assert.equal(invalidatesPublicContent(method, collection, 200), true, `${method} ${collection}`);
      assert.equal(invalidatesPublicContent(method, collection, 400), true, 'partial bulk failures may still commit');
      assert.equal(invalidatesPublicContent(method, collection, 401), false);
      assert.equal(invalidatesPublicContent(method, collection, 403), false);
    }
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(invalidatesPublicContent(method, collection, 200), false);
  }
  for (const collection of ['users', 'page-views', 'analytics', undefined]) {
    assert.equal(invalidatesPublicContent('POST', collection, 200), false);
  }
  assert.ok(PUBLIC_CONTENT_TTL_SECONDS > 0 && PUBLIC_CONTENT_TTL_SECONDS <= 300);
});

test('public reads use the shared cache without authenticated or draft access', async () => {
  const [cms, sections, route] = await Promise.all([
    readFile('src/lib/cms.ts', 'utf8'), readFile('src/lib/sections.ts', 'utf8'),
    readFile('src/app/(payload)/api/[...slug]/route.ts', 'utf8'),
  ]);
  assert.match(cms, /publicCache\([\s\S]*readCMSEntries[\s\S]*'cms-entries'\)/);
  assert.match(sections, /publicCache\([\s\S]*readSections[\s\S]*'cms-sections'\)/);
  for (const source of [cms, sections]) {
    assert.match(source, /overrideAccess: false/);
    assert.match(source, /user: null/);
    assert.doesNotMatch(source, /draft: true|overrideAccess: true/);
  }
  const call = route.indexOf('routes[`REST_${method}`]');
  const invalidate = route.indexOf('invalidatePublicContent();');
  assert.ok(call >= 0 && invalidate > call, 'expire only after Payload has completed the operation');
});
