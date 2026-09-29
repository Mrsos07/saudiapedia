import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { s, InputError } from '../../src/mcp/schema';
import { createRateLimiter, handleMessage, SUPPORTED_PROTOCOL_VERSIONS } from '../../src/mcp/protocol';
import { toolList, type ToolContext } from '../../src/mcp/tools';
import { paragraphsToLexical, richNodesToParagraphs } from '../../src/lib/rich-text-authoring';
import { sanitizeRichText } from '../../src/lib/rich-text';

const context = { payload: {}, user: { id: 1, collection: 'users', role: 'editor' } } as unknown as ToolContext;
const open = { consume: () => true };
const call = (message: unknown, limits = open, audit: Parameters<typeof handleMessage>[3] = () => {}) => handleMessage(message, context, limits, audit);

test('schemas reject unknown keys, wrong types, control characters and oversize input', () => {
  const schema = s.object({ name: s.string({ min: 1, max: 5 }), count: s.integer(1, 3), tags: s.array(s.enum(['a', 'b'] as const), 2) }, ['name']);
  assert.deepEqual(schema.parse({ name: 'abc', count: 2, tags: ['a'] }, 'arguments'), { name: 'abc', count: 2, tags: ['a'] });
  for (const bad of [{ name: 'abc', extra: 1 }, { count: 1 }, { name: 'toolong' }, { name: 'a\u0000b' }, { name: '   ' }, { name: 'a', count: 1.5 }, { name: 'a', tags: ['a', 'b', 'a'] }, { name: 'a', tags: ['c'] }, []]) {
    assert.throws(() => schema.parse(bad, 'arguments'), InputError);
  }
  assert.throws(() => s.literal(true, 'confirm').parse(false, 'confirm'), InputError);
  assert.equal(schema.json.additionalProperties, false);
});

test('initialize negotiates a supported protocol version and advertises only tools', async () => {
  const result = (await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }))!.result as Record<string, unknown>;
  assert.equal(result.protocolVersion, '2025-06-18');
  assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
  assert.match(String(result.instructions), /untrusted editorial data/);
  const fallback = (await call({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }))!.result as Record<string, unknown>;
  assert.equal(fallback.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
});

test('JSON-RPC edge cases: notifications, invalid requests, unknown methods and tools', async () => {
  assert.equal(await call({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal((await call({ jsonrpc: '1.0', id: 1, method: 'ping' }))!.error!.code, -32600);
  assert.equal((await call({ jsonrpc: '2.0', id: { bad: true }, method: 'ping' }))!.error!.code, -32600);
  assert.equal((await call({ jsonrpc: '2.0', id: 3, method: 'ping', params: [] }))!.error!.code, -32602);
  assert.equal((await call({ jsonrpc: '2.0', id: 4, method: 'resources/list' }))!.error!.code, -32601);
  assert.equal((await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'delete_everything' } }))!.error!.code, -32602);
  assert.deepEqual((await call({ jsonrpc: '2.0', id: 6, method: 'ping' }))!.result, {});
});

test('tool input errors are reported to the model without running the tool', async () => {
  const audits: unknown[] = [];
  const response = await call({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_article', arguments: { translationKey: 'x', injected: 'DROP TABLE' } } }, open, entry => audits.push(entry));
  const result = response!.result as { isError: boolean; content: { text: string }[] };
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /unknown property "injected"/);
  assert.deepEqual(audits, [{ tool: 'get_article', write: false, ok: false, ms: (audits[0] as { ms: number }).ms, error: 'rejected' }]);
});

test('publishing tools demand explicit confirmation and optimistic concurrency', async () => {
  const listed = toolList();
  const names = listed.map(item => item.name);
  assert.ok(!names.some(name => /delete|user|password|media_upload/.test(name)), 'no delete, account or upload tools');
  for (const name of ['publish_article', 'unpublish_article']) {
    const schema = listed.find(item => item.name === name)!.inputSchema as { required: string[]; properties: Record<string, { const?: boolean }> };
    assert.deepEqual([...schema.required].sort(), ['confirm', 'expectedUpdatedAt', 'translationKey']);
    assert.equal(schema.properties.confirm.const, true);
    assert.equal(listed.find(item => item.name === name)!.annotations.destructiveHint, true);
  }
  for (const item of listed) {
    assert.equal(item.annotations.readOnlyHint, !['create_article', 'update_article', 'set_review_status', 'publish_article', 'unpublish_article'].includes(item.name), item.name);
    assert.equal((item.inputSchema as { additionalProperties: boolean }).additionalProperties, false, item.name);
  }
  const denied = await call({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'publish_article', arguments: { translationKey: 'k', expectedUpdatedAt: { ar: 'a', en: 'b' }, confirm: false } } });
  assert.match((denied!.result as { content: { text: string }[] }).content[0].text, /confirm: must be true/);
  const editor = await call({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'publish_article', arguments: { translationKey: 'k', expectedUpdatedAt: { ar: 'a', en: 'b' }, confirm: true } } });
  assert.match((editor!.result as { content: { text: string }[] }).content[0].text, /Only reviewer or administrator/);
});

test('rate limits are per account, with a tighter budget for writes', async () => {
  let now = 0;
  const realNow = Date.now;
  Date.now = () => now;
  try {
    const limiter = createRateLimiter({ perMinute: 3, writesPerMinute: 1 });
    const a = limiter('users:1');
    assert.equal(a.consume(true), true);
    assert.equal(a.consume(true), false, 'second write in the same minute');
    assert.equal(a.consume(false), true);
    assert.equal(a.consume(false), true);
    assert.equal(a.consume(false), false);
    assert.equal(limiter('users:2').consume(false), true, 'other accounts are unaffected');
    now = 60000;
    assert.equal(a.consume(true), true, 'budget refills over time');
    const limited = await call({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'whoami' } }, { consume: () => false });
    assert.match((limited!.result as { content: { text: string }[] }).content[0].text, /Rate limit/);
  } finally {
    Date.now = realNow;
  }
});

test('authoring format round-trips paragraphs and internal links through Lexical', () => {
  const lexical = paragraphsToLexical(['See [[regions/riyadh|Riyadh]] and [[x/missing|plain]]. [1]'], 'en', route => route === 'regions/riyadh' ? 5 : undefined);
  const withPopulatedLink = JSON.parse(JSON.stringify(lexical).replace('"value":5', '"value":{"section":"regions","slug":"riyadh"}'));
  assert.deepEqual(richNodesToParagraphs(sanitizeRichText(withPopulatedLink)), ['See [[regions/riyadh|Riyadh]] and plain. [1]']);
});

test('the MCP route is off by default, POST-only, bearer-only and never trusts cookies', async () => {
  const route = await readFile('src/app/(payload)/api/mcp/route.ts', 'utf8');
  assert.match(route, /process\.env\.MCP_ENABLED === 'true'/);
  assert.match(route, /new Headers\(\{ Authorization: authorization \}\)/, 'only the Authorization header reaches payload.auth');
  assert.match(route, /origin !== trusted/);
  assert.match(route, /boundRequestBody\(request, 256 \* 1024\)/);
  const { POST, GET } = await import('../../src/app/(payload)/api/mcp/route');
  const previous = process.env.MCP_ENABLED;
  process.env.MCP_ENABLED = 'false';
  try {
    assert.equal((await POST(new Request('http://localhost/api/mcp', { method: 'POST', body: '{}' }))).status, 404);
    assert.equal((await GET()).status, 404);
  } finally {
    if (previous === undefined) delete process.env.MCP_ENABLED; else process.env.MCP_ENABLED = previous;
  }
});
