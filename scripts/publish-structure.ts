// Publishes the reviewed structure batches to PRODUCTION through the Payload Local API.
// Run only through the operator launcher (restricted runtime role, verified TLS):
//   powershell -File scripts/cms-local.ps1 publish-structure            (dry run: plan only)
//   powershell -File scripts/cms-local.ps1 publish-structure -Apply     (writes)
// Authorization: an administrator must sign in to https://saudiknowledge.com/admin in the Edge window;
// every write then runs as that verified account (hooks, approval audit and versions apply).
import { chromium } from '@playwright/test';
import type { PayloadRequest } from 'payload';
import { applyStructureBatches } from './lib/apply-structure-batches';

const SITE = 'https://saudiknowledge.com';
const FILES = ['riyadh-pilot', 'regions-hubs', 'heritage-sites', 'geography-history', 'people'].map(name => `docs/editorial-batches/${name}-20260928.json`);
const apply = process.argv.includes('--apply');

if (!/^postgresql:\/\/kingdom_runtime\.vexushpbyvaoangxyqcm:/.test(process.env.DATABASE_URL ?? '')) throw new Error('Run through scripts/cms-local.ps1 with the production runtime role.');

async function operatorSignIn(): Promise<number | string> {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${SITE}/admin/login`);
    console.log('Sign in as an administrator in the Edge window (10 minutes)...');
    for (const deadline = Date.now() + 600000; Date.now() < deadline; await page.waitForTimeout(2000)) {
      const me = await page.request.get(`${SITE}/api/users/me`).then(response => response.json()).catch(() => null) as { user?: { id: number | string; role?: string } | null } | null;
      if (me?.user) {
        if (me.user.role !== 'administrator') throw new Error('The signed-in account is not an administrator.');
        return me.user.id;
      }
    }
    throw new Error('Sign-in timed out.');
  } finally {
    await browser.close();
  }
}

async function main() {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('../src/payload.config')]);
  const payload = await getPayload({ config });
  try {
    let user: NonNullable<PayloadRequest['user']> | null = null;
    if (apply) {
      const id = await operatorSignIn();
      const account = await payload.findByID({ collection: 'users', id, overrideAccess: true, depth: 0 });
      if ((account as { role?: string }).role !== 'administrator') throw new Error('Administrator verification failed.');
      user = { ...account, collection: 'users' } as never;
      console.log(`Authorized as user ${id}.`);
    } else {
      // Dry run reads as the first administrator; nothing is written.
      const { docs } = await payload.find({ collection: 'users', overrideAccess: true, limit: 1, depth: 0, where: { role: { equals: 'administrator' } } });
      user = { ...docs[0], collection: 'users' } as never;
    }
    const plan = await applyStructureBatches(payload, user!, FILES, { apply, log: line => console.log(`  ${line}`) });
    console.log(JSON.stringify({ mode: apply ? 'applied' : 'dry-run', create: plan.create.length, update: plan.update.length, relink: plan.relink.length, missingReferences: plan.missingReferences }, null, 1));
    if (!apply) console.log('Create:', plan.create.join(', '), '\nUpdate:', plan.update.join(', '), '\nLink existing:', plan.relink.join(', '));
  } finally {
    await Promise.race([payload.destroy(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
}

main().then(() => process.exit(0), (error: unknown) => {
  console.error(`publish-structure failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  if (error && typeof error === 'object' && 'data' in error) console.error(JSON.stringify((error as { data: unknown }).data).slice(0, 800));
  process.exit(1);
});
