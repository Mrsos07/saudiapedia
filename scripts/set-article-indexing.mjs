// Makes approved, published articles indexable by clearing only their per-article noIndex flag.
// Plan only:  node scripts/set-article-indexing.mjs --plan  [--port=3000]
// Apply:      node scripts/set-article-indexing.mjs --apply [--port=3000]
// The operator signs in as administrator in a fresh Edge window; nothing else is changed.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, request } from '@playwright/test';

const mode = process.argv[2];
const port = process.argv.find(arg => arg.startsWith('--port='))?.slice(7) ?? '3000';
const origin = `http://localhost:${port}`;
// Fields the explicit re-approval legitimately updates; everything else must be byte-for-byte unchanged.
const expectedChanges = new Set(['noIndex', 'updatedAt', 'reviewedAt', 'reviewedBy']);
let stage = 'checking arguments';
let browser;
let anonymous;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

async function json(client, route, options = {}) {
  const response = await client.fetch(`${origin}/api/${route}`, { ...options, headers: { Origin: origin }, timeout: 60000 });
  if (!response.ok()) console.error(JSON.stringify({ method: options.method ?? 'GET', route: route.split('?')[0], status: response.status() }));
  assert.ok(response.ok(), `CMS HTTP ${response.status()}`);
  return response.json();
}

async function publishedArticles(client) {
  const docs = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      limit: '100', page: String(page), depth: '0', draft: 'false', sort: 'id',
      'where[and][0][_status][equals]': 'published', 'where[and][1][reviewStatus][equals]': 'approved',
    });
    const result = await json(client, `articles?${query}`);
    docs.push(...result.docs);
    if (!result.hasNextPage) return docs;
  }
}

try {
  assert.ok(['--plan', '--apply'].includes(mode), 'Use --plan, or explicitly authorize the change with --apply');
  assert.match(port, /^\d{4,5}$/);
  stage = 'opening a fresh browser for administrator sign-in';
  browser = await chromium.launch({ channel: 'msedge', headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  stage = 'waiting for the operator to sign in as an administrator';
  console.log('Sign in in the opened browser. Credentials and session tokens are never printed or saved by this script.');
  let signedIn = false;
  for (let attempt = 0; attempt < 600 && !signedIn; attempt++) {
    const response = await context.request.get(`${origin}/api/users/me`, { headers: { Origin: origin }, timeout: 60000 });
    if (response.ok()) {
      const { user } = await response.json();
      assert.ok(!user || user.role === 'administrator', 'An administrator account is required');
      signedIn = user?.role === 'administrator';
    }
    if (!signedIn) await delay(2000);
  }
  assert.ok(signedIn, 'Administrator sign-in timed out');
  console.log('Administrator session confirmed; reading published articles.');
  await page.goto('about:blank');
  const client = context.request;

  stage = 'planning: only published, approved, self-canonical articles with noIndex=true';
  const articles = await publishedArticles(client);
  const pairs = new Map();
  for (const doc of articles) pairs.set(doc.translationKey, [...(pairs.get(doc.translationKey) ?? []), doc]);
  const targets = [];
  const skipped = [];
  for (const doc of articles) {
    if (doc.noIndex !== true) continue;
    const pair = pairs.get(doc.translationKey);
    if (pair.length !== 2 || new Set(pair.map(item => item.locale)).size !== 2) skipped.push({ id: doc.id, slug: doc.slug, reason: 'no published counterpart' });
    else if (doc.canonicalURL?.trim()) skipped.push({ id: doc.id, slug: doc.slug, reason: 'custom canonical URL' });
    else targets.push(doc);
  }
  const bySection = targets.reduce((counts, doc) => ({ ...counts, [doc.section]: (counts[doc.section] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ published: articles.length, alreadyIndexable: articles.filter(doc => doc.noIndex !== true).length, toChange: targets.length, bySection, skipped }));
  if (mode === '--plan') {
    console.log('Plan only; no records were changed.');
  } else {
    stage = 'clearing noIndex with explicit administrator approval';
    let changed = 0;
    for (const doc of targets) {
      const latest = await json(client, `articles/${doc.id}?depth=0&draft=false`);
      assert.equal(latest.updatedAt, doc.updatedAt, `Concurrent editorial change on article ${doc.id}; refusing to overwrite`);
      await json(client, `articles/${doc.id}?depth=0`, { method: 'PATCH', data: { noIndex: false, reviewStatus: 'approved', _status: 'published' } });
      const stored = await json(client, `articles/${doc.id}?depth=0&draft=false`);
      assert.equal(stored.noIndex, false);
      assert.equal(stored._status, 'published');
      assert.equal(stored.reviewStatus, 'approved');
      for (const key of new Set([...Object.keys(doc), ...Object.keys(stored)])) {
        if (!expectedChanges.has(key)) assert.ok(same(stored[key], doc[key]), `Protected field changed on article ${doc.id}: ${key}`);
      }
      changed += 1;
      console.log(JSON.stringify({ id: doc.id, locale: doc.locale, section: doc.section, slug: doc.slug, indexable: true }));
    }
    stage = 'verifying anonymous public reads';
    anonymous = await request.newContext();
    const publicDocs = await publishedArticles(anonymous);
    const remaining = publicDocs.filter(doc => doc.noIndex === true && !skipped.some(item => item.id === doc.id));
    assert.equal(remaining.length, 0, 'Some published articles are still noIndex');
    console.log(`Verified: ${changed} articles changed; ${publicDocs.length} public articles, ${publicDocs.filter(doc => doc.noIndex !== true).length} indexable. Nothing else was modified or deleted.`);
  }
} catch {
  console.error(`Operation stopped while ${stage}. No records were deleted. Successful writes are retained; reruns skip articles that are already indexable.`);
  process.exitCode = 1;
} finally {
  await anonymous?.dispose();
  await browser?.close();
}
