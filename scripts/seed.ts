import { loadEnvConfig } from '@next/env';
import type { Payload, PayloadRequest } from 'payload';
import { entries } from '../src/lib/encyclopedia';

async function seed(): Promise<void> {
  let payload: Payload | undefined;
  let stage = 'loading environment';
  try {
    // Load .env.local before evaluating config; do not expose parsed secrets or loader errors.
    loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', {
      info: () => {},
      error: () => { throw new Error('Environment loading failed.'); },
    });
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IMPORT !== 'true') {
      throw new Error('Production seed import requires explicit confirmation.');
    }
    stage = 'initializing CMS';
    const [{ getPayload }, { default: config }] = await Promise.all([
      import('payload'), import('../src/payload.config'),
    ]);
    payload = await getPayload({ config });

    stage = 'finding an existing administrator (bootstrap privately through /admin first)';
    // Trusted operator-only DB lookup establishes identity, not a fabricated Local API user.
    // Anonymous Local API users reads are correctly denied; no users are created or changed.
    const existingAdmin = await payload.db.findOne<NonNullable<PayloadRequest['user']>>({
      collection: 'users', where: { role: { equals: 'administrator' } },
    });
    if (!existingAdmin || existingAdmin.role !== 'administrator' || existingAdmin.id == null) {
      throw new Error('No existing administrator.');
    }
    const admin = { ...existingAdmin, collection: 'users' as const };
    let created = 0;
    let skipped = 0;
    stage = 'importing drafts (existing records are never overwritten)';
    for (const entry of entries) {
      const translationKey = `seed:${entry.section}:${entry.slug}`;
      for (const locale of ['ar', 'en'] as const) {
        // Check both unique identities, including renamed seed records and editor-created topics.
        const existing = await payload.find({
          collection: 'articles', user: admin, overrideAccess: false,
          draft: false, depth: 0, limit: 1,
          where: {
            and: [
              { locale: { equals: locale } },
              { or: [
                { translationKey: { equals: translationKey } },
                { and: [{ section: { equals: entry.section } }, { slug: { equals: entry.slug } }] },
              ] },
            ],
          },
        });
        if (existing.docs.length > 0) { skipped += 1; continue; }
        await payload.create({
          collection: 'articles', user: admin, overrideAccess: false, draft: false, depth: 0,
          data: {
            locale, translationKey, section: entry.section, slug: entry.slug,
            title: entry.title[locale], summary: entry.summary[locale], category: entry.category[locale],
            period: entry.period, kind: entry.kind, featured: Boolean(entry.featured),
            facts: entry.facts.map((fact) => ({ label: fact.label[locale], value: fact.value[locale] })),
            body: entry.body.map((row) => ({ heading: row.heading[locale], text: row.text[locale] })),
            sources: entry.sources.map((source) => ({ title: source.title[locale], url: source.url })),
            reviewStatus: 'draft', _status: 'draft',
            // No upload/image relationship or approval claim; frontend supplies its fallback.
          },
        });
        created += 1;
      }
    }
    console.info(`Draft import complete: ${created} created, ${skipped} existing records skipped. Nothing published; no users or uploads created.`);
  } catch {
    // DB/config errors can contain connection strings. Never print the original error or user.
    console.error(`Seed import failed while ${stage}. Check local configuration and docs/cms.md. Production requires ALLOW_SEED_IMPORT=true. Reruns preserve existing records.`);
    process.exitCode = 1;
  } finally {
    if (payload && typeof payload.destroy === 'function') {
      try { await payload.destroy(); }
      catch {
        console.error('CMS shutdown failed after seed import.');
        process.exitCode = 1;
      }
    }
  }
}

void seed();