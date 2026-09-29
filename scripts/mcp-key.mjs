// Generates a long-lived MCP agent key.
//   node scripts/mcp-key.mjs
// Prints the key ONCE (give it to the agent) and its SHA-256 (store in Render as MCP_API_KEY_SHA256).
// Nothing is written to disk. Rotate by generating a new key and replacing the hash in Render.
import { createHash, randomBytes } from 'node:crypto';

const key = `ksmcp_${randomBytes(32).toString('base64url')}`;
const hash = createHash('sha256').update(key, 'utf8').digest('hex');
console.log('\n1) Render → Environment (then Save Changes and deploy):');
console.log(`   MCP_ENABLED=true`);
console.log(`   MCP_API_KEY_SHA256=${hash}`);
console.log(`   MCP_AGENT_EMAIL=<email of the agent's CMS account: editor, translator or reviewer>`);
console.log('\n2) Agent MCP configuration (keep the key secret; it is shown only now):');
console.log(JSON.stringify({ mcpServers: { 'kingdomsaudi-cms': { url: 'https://saudiknowledge.com/api/mcp', headers: { Authorization: `Bearer ${key}` } } } }, null, 2));
