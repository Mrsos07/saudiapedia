// Applies the structure batches to a LOCAL restored copy of production (database prod_replica in the
// staging Docker container), so Payload itself produces the exact rows. scripts/replica-diff.mjs then
// turns the difference against the untouched copy (prod_original) into SQL for production.
//   node scripts/staging-local.mjs run -- node --import tsx scripts/replica-apply.ts
import { readFileSync } from 'node:fs';
import { applyStructureBatches } from './lib/apply-structure-batches';

const creds = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/KingdomSaudi/staging-local/credentials.json`, 'utf8')) as { postgres: string };
process.env.DATABASE_URL = `postgresql://postgres:${encodeURIComponent(creds.postgres)}@127.0.0.1:55432/prod_replica`;
const FILES = ['riyadh-pilot', 'regions-hubs', 'heritage-sites', 'geography-history', 'people'].map(name => `docs/editorial-batches/${name}-20260928.json`);

async function main() {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('../src/payload.config')]);
  const payload = await getPayload({ config });
  try {
    // The replica's own production administrator: approvals are attributed to the real account.
    // The oldest administrator is the operator's own account (never an agent account created later).
    const { docs } = await payload.find({ collection: 'users', overrideAccess: true, limit: 1, depth: 0, sort: 'createdAt', where: { role: { equals: 'administrator' } } });
    if (!docs[0]) throw new Error('No administrator in the replica.');
    const plan = await applyStructureBatches(payload, { ...docs[0], collection: 'users' } as never, FILES, { apply: true, log: () => {} });
    console.log(JSON.stringify({ created: plan.create.length, updated: plan.update.length, linked: plan.relink.length, reviewer: docs[0].id }));
  } finally {
    await Promise.race([payload.destroy(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
}
main().then(() => process.exit(0), (error: unknown) => {
  console.error(`replica-apply failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  process.exit(1);
});
