import type { Payload, PayloadRequest } from 'payload';
import { seedSectionLabels, type SeedSection } from '../src/lib/encyclopedia';

/** One-time bootstrap for the four sections already used by existing seed
 * articles (history/regions/people/heritage). Existing sections are never
 * overwritten; this only creates rows that do not yet exist by slug.
 * Run through scripts/cms-local.ps1, which already sets the required
 * environment variables directly (no .env file loading needed here). */
async function seedSections(): Promise<void> {
  let payload: Payload | undefined;
  let stage = 'checking configuration';
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IMPORT !== 'true') {
      throw new Error('Production seed import requires explicit confirmation.');
    }
    stage = 'initializing CMS';
    const [{ getPayload }, { default: config }] = await Promise.all([
      import('payload'), import('../src/payload.config'),
    ]);
    payload = await getPayload({ config });

    stage = 'finding an existing administrator (bootstrap privately through /admin first)';
    const existingAdmin = await payload.db.findOne<NonNullable<PayloadRequest['user']>>({
      collection: 'users', where: { role: { equals: 'administrator' } },
    });
    if (!existingAdmin || existingAdmin.role !== 'administrator' || existingAdmin.id == null) {
      throw new Error('No existing administrator.');
    }
    const admin = { ...existingAdmin, collection: 'users' as const };

    let created = 0;
    let skipped = 0;
    stage = 'creating sections (existing slugs are never overwritten)';
    const slugs = Object.keys(seedSectionLabels) as SeedSection[];
    for (const [order, slug] of slugs.entries()) {
      const existing = await payload.find({
        collection: 'sections', user: admin, overrideAccess: false, depth: 0, limit: 1,
        where: { slug: { equals: slug } },
      });
      if (existing.docs.length > 0) { skipped += 1; continue; }
      await payload.create({
        collection: 'sections', user: admin, overrideAccess: false, depth: 0,
        data: { slug, nameAr: seedSectionLabels[slug].ar, nameEn: seedSectionLabels[slug].en, order },
      });
      created += 1;
    }
    console.info(`Section import complete: ${created} created, ${skipped} already existed.`);
  } catch (error) {
    console.error(`Section seeding failed while ${stage}.`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await payload?.destroy();
  }
}

await seedSections();
