import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { PageViews } from '../../src/collections/PageViews';
import {
  AnalyticsBodyError,
  analyticsMonthDays,
  analyticsOptOut,
  currentAnalyticsMonth,
  decodeDailyViews,
  isTrackableAnalyticsPath,
  isTrustedAnalyticsRequest,
  parseAnalyticsMonth,
  parseAnalyticsOrigin,
  readAnalyticsBody,
  riyadhDay,
  safeAnalyticsCount,
  totalAnalyticsCounts,
  trustedAnalyticsOrigins,
  validAnalyticsDay,
  weeksWithinMonth,
} from '../../src/lib/analytics';

const now = new Date('2026-09-10T12:00:00Z');
const source = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('month filters use Riyadh defaults and reject invalid, duplicate, or future years', () => {
  assert.deepEqual(parseAnalyticsMonth({}, now), { month: 9, year: 2026 });
  assert.deepEqual(parseAnalyticsMonth({ month: '2', year: '2020' }, now), { month: 2, year: 2020 });
  for (const month of ['0', '13', '-1', '1.5', '1e1', ' 2', '02', '', ['2'], null, 2, 'Infinity']) {
    assert.equal(parseAnalyticsMonth({ month }, now), null);
  }
  for (const year of ['2019', '2027', '2026.0', '2026x', ['2026', '2025'], '999999999999999999999']) {
    assert.equal(parseAnalyticsMonth({ year }, now), null);
  }
  const rollover = new Date('2026-12-31T21:00:00Z');
  assert.deepEqual(currentAnalyticsMonth(rollover), { year: 2027, month: 1 });
  assert.deepEqual(parseAnalyticsMonth({ year: '2027' }, rollover), { year: 2027, month: 1 });
});

test('Riyadh midnight and month-week bounds use half-open UTC+03 intervals', () => {
  assert.equal(riyadhDay(new Date('2026-09-10T20:59:59.999Z')), '2026-09-10');
  assert.equal(riyadhDay(new Date('2026-09-10T21:00:00Z')), '2026-09-11');
  assert.throws(() => riyadhDay(new Date('invalid')));
  const weeks = weeksWithinMonth({ year: 2026, month: 1 });
  assert.deepEqual(weeks.map(({ firstDay, lastDay }) => [firstDay, lastDay]), [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]]);
  assert.equal(weeks[0].start, '2025-12-31T21:00:00.000Z');
  assert.equal(weeks[4].endExclusive, '2026-01-31T21:00:00.000Z');
  for (let index = 1; index < weeks.length; index += 1) assert.equal(weeks[index - 1].endExclusive, weeks[index].start);
  assert.equal(weeksWithinMonth({ year: 2026, month: 2 }).length, 4);
  assert.equal(weeksWithinMonth({ year: 2024, month: 2 })[4].lastDay, 29);
  assert.equal(weeksWithinMonth({ year: 2026, month: 9 })[4].lastDay, 30);
  assert.equal(weeksWithinMonth({ year: 2026, month: 12 })[4].endExclusive, '2026-12-31T21:00:00.000Z');
  assert.throws(() => weeksWithinMonth({ year: 2026, month: 13 }));
});

test('daily dates and PostgreSQL numeric results are validated without failure-as-zero', () => {
  assert.equal(validAnalyticsDay('2024-02-29'), true);
  for (const day of ['2026-02-29', '2026-04-31', '2026-2-01', '2026-01-01x', '', null]) assert.equal(validAnalyticsDay(day), false);
  assert.equal(safeAnalyticsCount('123'), 123);
  assert.equal(safeAnalyticsCount('123.00'), 123);
  assert.equal(safeAnalyticsCount(0), 0);
  assert.equal(safeAnalyticsCount(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  for (const count of [null, undefined, '', ' ', '1e3', 'NaN', 'Infinity', -1, 1.5, true, {}, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => safeAnalyticsCount(count));
  }
  assert.equal(totalAnalyticsCounts([2, 3, 0]), 5);
  assert.throws(() => totalAnalyticsCounts([Number.MAX_SAFE_INTEGER, 1]));
  const selected = { year: 2026, month: 9 };
  assert.equal(analyticsMonthDays(selected).length, 30);
  const days = decodeDailyViews([{ day: '2026-09-02', views: '7' }], selected);
  assert.deepEqual(days.slice(0, 2), [{ day: '2026-09-01', views: 0 }, { day: '2026-09-02', views: 7 }]);
  for (const rows of [null, {}, [{ day: '2026-08-31', views: 2 }], [{ day: '2026-09-01', views: null }], [{ day: '2026-09-01', views: 2 }, { day: '2026-09-01', views: 3 }]]) {
    assert.throws(() => decodeDailyViews(rows, selected));
  }
});

function trustedHeaders(): Headers {
  return new Headers({
    origin: 'https://example.com',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'same-origin',
    'sec-fetch-dest': 'empty',
  });
}

test('trusted origins require explicit canonical configuration and same-origin fetch metadata', () => {
  assert.equal(parseAnalyticsOrigin('https://example.com/'), 'https://example.com');
  assert.equal(parseAnalyticsOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const origin of ['null', '*', '//example.com', 'ftp://example.com', 'https://u:p@example.com', 'https://example.com/path', 'https://example.com?token=x', 'https://example.com#', ' https://example.com', 'https://example.com/../', 'https://example.com\\evil']) {
    assert.equal(parseAnalyticsOrigin(origin), null);
  }
  assert.deepEqual(trustedAnalyticsOrigins('https://example.com/', 'https://example.com'), ['https://example.com']);
  assert.throws(() => trustedAnalyticsOrigins(undefined, undefined));
  assert.throws(() => trustedAnalyticsOrigins('invalid', 'https://example.com'));
  assert.equal(isTrustedAnalyticsRequest(trustedHeaders(), ['https://example.com']), true);
  for (const [key, value] of [
    ['origin', 'https://example.com.evil.test'], ['origin', 'https://example.com/'], ['origin', 'null'],
    ['sec-fetch-site', 'same-site'], ['sec-fetch-site', 'cross-site'], ['sec-fetch-mode', 'navigate'], ['sec-fetch-dest', 'document'],
  ]) {
    const headers = trustedHeaders();
    headers.set(key, value);
    assert.equal(isTrustedAnalyticsRequest(headers, ['https://example.com']), false);
  }
  for (const key of ['origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest']) {
    const headers = trustedHeaders();
    headers.delete(key);
    assert.equal(isTrustedAnalyticsRequest(headers, ['https://example.com']), false);
  }
});

function bodyRequest(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/analytics/page-view', {
    method: 'POST', body, headers: { 'content-type': 'application/json', ...headers },
  });
}

const bodyStatus = (status: number) => (error: unknown): boolean => error instanceof AnalyticsBodyError && error.status === status;

test('only an empty JSON object is accepted; actual bytes are capped at 512', async () => {
  await readAnalyticsBody(bodyRequest('{}'));
  await readAnalyticsBody(bodyRequest(`{${' '.repeat(510)}}`));
  await readAnalyticsBody(bodyRequest('{}', { 'content-type': 'application/json; charset=utf-8' }));
  for (const body of ['', 'null', '[]', '1', 'true', '""', '{', '{"path":"/ar"}', '{"day":"2026-09-10"}', '{"__proto__":{}}']) {
    await assert.rejects(readAnalyticsBody(bodyRequest(body)), bodyStatus(400));
  }
  await assert.rejects(readAnalyticsBody(bodyRequest(`{${' '.repeat(511)}}`, { 'content-length': '2' })), bodyStatus(413));
  await assert.rejects(readAnalyticsBody(bodyRequest('{}', { 'content-length': '513' })), bodyStatus(413));
  await assert.rejects(readAnalyticsBody(bodyRequest('{}', { 'content-length': '-1' })), bodyStatus(400));
  await assert.rejects(readAnalyticsBody(bodyRequest('{}', { 'content-type': 'text/plain' })), bodyStatus(415));
  await assert.rejects(readAnalyticsBody(bodyRequest('{}', { 'content-encoding': 'gzip' })), bodyStatus(415));
  await assert.rejects(readAnalyticsBody(bodyRequest('é'.repeat(257))), bodyStatus(413));
  await assert.rejects(readAnalyticsBody(bodyRequest(new Uint8Array([0xff]))), bodyStatus(400));
});

test('stream limit cancels oversized chunked bodies without trusting declared length', async () => {
  let cancelled = false;
  let chunks = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { chunks += 1; controller.enqueue(new Uint8Array(256).fill(32)); },
    cancel() { cancelled = true; },
  });
  // Node's Request requires duplex for a streamed body; keep the mock typed.
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', body, duplex: 'half', headers: { 'content-type': 'application/json', 'content-length': '2' },
  };
  await assert.rejects(readAnalyticsBody(new Request('https://example.com', init)), bodyStatus(413));
  assert.equal(cancelled, true);
  assert.ok(chunks <= 4, 'The consumer must not drain an unbounded stream.');
});

test('tracker excludes search/admin and respects browser privacy signals', () => {
  // Sections are administrator-managed (see the `sections` collection), so a
  // slug-shaped path under an unrecognized section name is intentionally
  // still trackable: this check validates URL SHAPE, not CMS section existence.
  for (const path of ['/ar', '/en', '/ar/history', '/en/regions', '/ar/people/king-salman', '/en/heritage/diriyah', '/ar/unknown']) {
    assert.equal(isTrackableAnalyticsPath(path), true);
  }
  for (const path of ['/', '/admin', '/api', '/ar/search', '/en/search?q=secret', '/ar?secret=1', '/ar/history/x/y', '/fr', '/ar/history/../admin', null]) {
    assert.equal(isTrackableAnalyticsPath(path), false);
  }
  assert.equal(analyticsOptOut('1', false), true);
  assert.equal(analyticsOptOut('yes', false), true);
  assert.equal(analyticsOptOut(null, true), true);
  assert.equal(analyticsOptOut(null, '1'), true);
  assert.equal(analyticsOptOut('0', false), false);
});

test('internal collection preserves generated numeric schema and denies every API operation', () => {
  assert.equal(PageViews.slug, 'page-views');
  assert.equal(PageViews.dbName, 'page_views');
  assert.equal(PageViews.admin?.hidden, true);
  assert.equal(PageViews.timestamps, true);
  assert.deepEqual(PageViews.fields.map((field) => 'name' in field ? field.name : null), ['day', 'views']);
  const [day, views] = PageViews.fields;
  assert.ok(day.type === 'text' && day.required && day.unique);
  assert.ok(views.type === 'number' && views.required && views.min === 0 && views.defaultValue === 0);
  // Config callbacks intentionally ignore args. Reflect keeps this check typed
  // without manufacturing a complete PayloadRequest or connecting to Payload.
  for (const operation of ['admin', 'create', 'read', 'update', 'delete', 'readVersions', 'unlock'] as const) {
    const access = PageViews.access?.[operation];
    assert.equal(typeof access, 'function');
    assert.ok(access);
    assert.equal(Reflect.apply(access, undefined, []), false);
  }
});

test('admin source contract guards all reads, uses sequential permission-aware counts and DefaultTemplate', async () => {
  const text = await source('src/components/admin/analytics-view.tsx');
  const guard = text.indexOf("if (!req.user || !hasRole(req, roles)) redirect('/admin/login');");
  assert.ok(guard >= 0 && guard < text.indexOf('await req.payload.count') && guard < text.indexOf('await req.payload.db.drizzle.execute'));
  assert.match(text, /props: AdminViewServerProps/);
  assert.match(text, /<DefaultTemplate/);
  assert.match(text, /for \(const bucket of weeksWithinMonth\(selected\)\)/);
  assert.match(text, /overrideAccess: false,\s+user: req.user,\s+req,/);
  assert.match(text, /greater_than_equal: bucket.start/);
  assert.match(text, /less_than: bucket.endExclusive/);
  assert.match(text, /catch \{[\s\S]*?report = null/);
  assert.match(text, /action="\/admin\/analytics" method="get"/);
  assert.match(text, /<caption>/);
  assert.match(text, /lang=\{locale\} dir=\{locale === 'ar' \? 'rtl' : 'ltr'\}/);
  assert.doesNotMatch(text, /Promise\.all|overrideAccess: true|error\.message|console\.|unstable_cache|['"]use client['"]/);
});

test('admin copy has matching Arabic and English keys without importing the server view', async () => {
  const text = await source('src/components/admin/analytics-view.tsx');
  const file = ts.createSourceFile('analytics-view.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let copy: ts.ObjectLiteralExpression | undefined;
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'analyticsCopy') continue;
      const initializer = declaration.initializer;
      assert.ok(initializer && ts.isAsExpression(initializer) && ts.isObjectLiteralExpression(initializer.expression));
      copy = initializer.expression;
    }
  }
  assert.ok(copy);
  const keys: Record<string, string[]> = {};
  for (const entry of copy.properties) {
    assert.ok(ts.isPropertyAssignment(entry) && ts.isIdentifier(entry.name) && ts.isObjectLiteralExpression(entry.initializer));
    const language = entry.name.text;
    keys[language] = entry.initializer.properties.map((property) => {
      assert.ok(ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isStringLiteral(property.initializer));
      assert.match(property.initializer.text, language === 'ar' ? /[\u0600-\u06ff]/ : /[A-Za-z]/);
      return property.name.text;
    }).sort();
  }
  assert.deepEqual(Object.keys(keys).sort(), ['ar', 'en']);
  assert.deepEqual(keys.ar, keys.en);
});

test('endpoint and tracker source contracts limit data, reject redirects and do not leak failures', async () => {
  const route = await source('src/app/(payload)/api/analytics/page-view/route.ts');
  assert.ok(route.indexOf('isTrustedAnalyticsRequest(request.headers') < route.indexOf('await readAnalyticsBody(request)'));
  assert.ok(route.indexOf('await readAnalyticsBody(request)') < route.indexOf('await getPayload'));
  assert.ok(route.indexOf('if (!cmsConfigured()) return respond(204)') < route.indexOf("import('../../../../../payload.config')"));
  assert.match(route, /payload\.db\.drizzle\.execute\(sql`/);
  assert.match(route, /ON CONFLICT \("day"\) DO UPDATE/);
  assert.match(route, /daily\."views" \+ 1/);
  assert.match(route, /'Cache-Control': 'no-store, max-age=0'/);
  assert.match(route, /'X-Robots-Tag': 'noindex, nofollow'/);
  assert.doesNotMatch(route, /payload\.(?:find|count|create|update)\(|getCMSEntries|request\.(?:json|text)\(|console\.|error\.message|x-forwarded-for|set-cookie/i);
  const tracker = await source('src/components/page-view-tracker.tsx');
  assert.match(tracker, /body: '\{\}'/);
  assert.match(tracker, /credentials: 'omit'/);
  assert.match(tracker, /referrerPolicy: 'no-referrer'/);
  assert.match(tracker, /redirect: 'error'/);
  assert.match(tracker, /document.visibilityState !== 'visible'/);
  assert.match(tracker, /visit.current.sent = true/);
  assert.match(tracker, /\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(tracker, /localStorage|sessionStorage|sendBeacon|useSearchParams|document\.cookie|await fetch/);
});