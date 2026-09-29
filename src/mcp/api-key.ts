import { createHash, timingSafeEqual } from 'node:crypto';

/** Long-lived agent key for the MCP endpoint.
 * Render stores only MCP_API_KEY_SHA256 (the key's SHA-256), never the key itself, plus
 * MCP_AGENT_EMAIL: the CMS account the key acts as. Roles and workflow still come from that account.
 * Administrators are refused: an agent key should never carry account-management rights. */
export const API_KEY_PREFIX = 'ksmcp_';
export const API_KEY_PATTERN = /^ksmcp_[A-Za-z0-9_-]{43}$/;
const AGENT_ROLES = ['editor', 'translator', 'reviewer'];

export type AgentUser = { id: number | string; email?: string; name?: string | null; role?: string; lockUntil?: string | null; collection: 'users' };
export type FindAgent = (email: string) => Promise<Omit<AgentUser, 'collection'> | undefined>;
export type KeyResult = { user: AgentUser } | { error: string } | null;

export const hashKey = (key: string) => createHash('sha256').update(key, 'utf8').digest();

/** null: not an agent key (caller may try other schemes); error: an agent key that must be rejected. */
export async function authenticateAgentKey(bearer: string, env: Record<string, string | undefined>, findAgent: FindAgent, now = Date.now()): Promise<KeyResult> {
  if (!bearer.startsWith(API_KEY_PREFIX)) return null;
  const expected = env.MCP_API_KEY_SHA256?.trim().toLowerCase();
  const email = env.MCP_AGENT_EMAIL?.trim().toLowerCase();
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !email) return { error: 'Agent keys are not configured on this server.' };
  // Constant-time comparison of fixed-length digests; malformed keys are hashed too so timing does not reveal the format check.
  const matches = timingSafeEqual(hashKey(bearer), Buffer.from(expected, 'hex')) && API_KEY_PATTERN.test(bearer);
  if (!matches) return { error: 'Invalid agent key.' };
  const account = await findAgent(email);
  if (!account) return { error: 'The agent account does not exist.' };
  if (account.lockUntil && Date.parse(account.lockUntil) > now) return { error: 'The agent account is locked.' };
  if (!AGENT_ROLES.includes(account.role ?? '')) return { error: 'Agent keys may act only as an editor, translator or reviewer account.' };
  return { user: { ...account, collection: 'users' } };
}
