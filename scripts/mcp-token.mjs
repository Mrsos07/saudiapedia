// Issues a short-lived CMS token for an MCP client without giving the agent the password.
//   node scripts/mcp-token.mjs [--url https://saudiknowledge.com]
// The token is printed once (never written to disk) and expires with the CMS session (2 hours).
// Treat it like a password: paste it only into the MCP client's secret/header setting.
import { createInterface } from 'node:readline';

const urlArg = process.argv.indexOf('--url');
const base = new URL(urlArg > -1 ? process.argv[urlArg + 1] : process.env.NEXT_PUBLIC_SITE_URL || 'https://saudiknowledge.com').origin;
if (!base.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('Use HTTPS (plain HTTP is allowed only for localhost).');

function ask(question, hidden = false) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = text => { if (text.startsWith(question)) process.stdout.write(question); };
    rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

const email = await ask('CMS email: ');
const password = await ask('CMS password (hidden): ', true);
const response = await fetch(`${base}/api/users/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(30000),
});
const result = await response.json().catch(() => ({}));
if (!response.ok || typeof result.token !== 'string') {
  // Payload locks an account for an hour after 3 failed attempts; do not retry blindly.
  console.error(`Login failed (${response.status}). Check the credentials; 3 failed attempts lock the account for one hour.`);
  process.exit(1);
}
const expires = typeof result.exp === 'number' ? new Date(result.exp * 1000).toISOString() : 'in 2 hours';
console.log(`\nSigned in as ${result.user?.email} (role: ${result.user?.role}). Token expires ${expires}.`);
console.log('\nMCP endpoint:', `${base}/api/mcp`);
console.log('\nClient configuration (Streamable HTTP):');
console.log(JSON.stringify({ mcpServers: { 'kingdomsaudi-cms': { url: `${base}/api/mcp`, headers: { Authorization: `Bearer ${result.token}` } } } }, null, 2));
