import { getPayload } from 'payload';
import { hasRole, roles } from '../../../../collections/access';
import { cmsConfigured } from '../../../../lib/cms';
import { boundRequestBody, HTTPRequestError } from '../../../../lib/http-security';
import { createRateLimiter, handleMessage, SUPPORTED_PROTOCOL_VERSIONS } from '../../../../mcp/protocol';
import { authenticateAgentKey } from '../../../../mcp/api-key';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
const limiter = createRateLimiter();
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...headers, ...extra } });
const reject = (status: number, message: string, extra: Record<string, string> = {}) => reply({ jsonrpc: '2.0', id: null, error: { code: -32000, message } }, status, extra);

function enabled() {
  return process.env.MCP_ENABLED === 'true' && cmsConfigured();
}

export async function POST(request: Request): Promise<Response> {
  // Off unless the operator explicitly enables it; a disabled endpoint looks like any missing route.
  if (!enabled()) return new Response(null, { status: 404, headers });
  const trusted = process.env.CMS_SERVER_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '');
  if (!trusted) return reject(503, 'Server origin is not configured.');
  // DNS-rebinding / browser protection: agents send no Origin; browsers may only call from the site itself.
  const origin = request.headers.get('origin');
  if ((origin !== null && origin !== trusted) || request.headers.get('sec-fetch-site') === 'cross-site') return reject(403, 'Origin not allowed.');
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return reject(415, 'Content-Type must be application/json.');
  const accept = request.headers.get('accept') ?? '*/*';
  if (!/application\/json|\*\/\*/i.test(accept)) return reject(406, 'Accept must include application/json.');
  const version = request.headers.get('mcp-protocol-version');
  if (version !== null && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) return reject(400, `Unsupported MCP-Protocol-Version. Supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`);

  const authorization = request.headers.get('authorization') ?? '';
  const challenge = { 'WWW-Authenticate': 'Bearer realm="kingdomsaudi-cms"' };
  if (!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(authorization)) return reject(401, 'A Bearer token for a CMS account is required.', challenge);

  let body: unknown;
  try {
    const bounded = await boundRequestBody(request, 256 * 1024);
    body = await bounded.json();
  } catch (error) {
    if (error instanceof HTTPRequestError) return reject(error.status, 'Request rejected.');
    return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (Array.isArray(body)) return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batch requests are not supported.' } }, 400);

  const { default: config } = await import('../../../../payload.config');
  const payload = await getPayload({ config });
  const invalid = (message: string) => reject(401, message, { ...challenge, 'WWW-Authenticate': 'Bearer realm="kingdomsaudi-cms", error="invalid_token"' });
  // 1) Long-lived agent key (hash in MCP_API_KEY_SHA256), acting as MCP_AGENT_EMAIL.
  const agent = await authenticateAgentKey(authorization.slice(7), process.env, async email => {
    const { docs } = await payload.find({ collection: 'users', overrideAccess: true, depth: 0, limit: 1, where: { email: { equals: email } }, select: { email: true, name: true, role: true, lockUntil: true } as never });
    return docs[0] as never;
  });
  if (agent && 'error' in agent) {
    payload.logger.warn({ mcp: { auth: 'agent-key-rejected', reason: agent.error } }, 'mcp authentication failed');
    return invalid(agent.error);
  }
  // 2) Otherwise a short-lived CMS session token. Only the Authorization header is forwarded:
  // browser session cookies can never authenticate MCP calls.
  const user = agent ? agent.user as never : (await payload.auth({ headers: new Headers({ Authorization: authorization }) })).user;
  if (!user || user.collection !== 'users' || !hasRole({ user }, roles)) return invalid('The token is invalid, expired, or not an editorial account.');

  const account = `${user.collection}:${user.id}`;
  const response = await handleMessage(body, { payload, user }, limiter(account), entry => {
    // Audit trail without content or tokens; Payload versions keep the edit history itself.
    payload.logger.info({ mcp: { ...entry, user: user.id, role: (user as { role?: string }).role } }, 'mcp tool call');
  });
  if (response === null) return new Response(null, { status: 202, headers });
  return reply(response);
}

const notAllowed = () => enabled() ? new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } }) : new Response(null, { status: 404, headers });
export const GET = notAllowed;
export const DELETE = notAllowed;
export const PUT = notAllowed;
export const PATCH = notAllowed;
