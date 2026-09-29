// Loads the LOCAL staging database only (run through scripts/staging-local.mjs):
//   STAGING_BOOTSTRAP=1 node scripts/staging-local.mjs run -- node --import tsx scripts/load-staging.ts
// 1. first staging administrator (password from the local credentials file, never printed)
// 2. public copy of production sections, published article pairs and their public media (anonymous GET only)
// 3. the Riyadh structural pilot batch, with [[section/slug|label]] converted to Lexical internal links
import type { Payload, PayloadRequest } from 'payload';
import { applyStructureBatches } from './lib/apply-structure-batches';

const PRODUCTION = 'https://saudiknowledge.com';
type Locale = 'ar' | 'en';
type Doc = Record<string, unknown> & { id: number };

if (!process.env.DATABASE_URL?.includes('@127.0.0.1:55432/')) throw new Error('Refusing to run: DATABASE_URL is not the local staging database.');

async function publicJSON<T>(route: string): Promise<T> {
  const response = await fetch(`${PRODUCTION}/api/${route}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Production public read failed: ${route.split('?')[0]} ${response.status}`);
  return response.json() as Promise<T>;
}

async function main() {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('../src/payload.config')]);
  const payload: Payload = await getPayload({ config });
  try {
    let admin = (await payload.find({ collection: 'users', overrideAccess: true, limit: 1, where: { role: { equals: 'administrator' } } })).docs[0];
    if (!admin) {
      if (process.env.CMS_ALLOW_BOOTSTRAP !== 'true') throw new Error('Run with STAGING_BOOTSTRAP=1 for the first staging administrator.');
      admin = await payload.create({ collection: 'users', overrideAccess: true, data: { email: 'admin@staging.local', name: 'Staging administrator', password: process.env.STAGING_ADMIN_PASSWORD!, role: 'administrator' } });
      console.log('Created staging administrator admin@staging.local (password in the local staging credentials file).');
    }
    const user = { ...admin, collection: 'users' } as unknown as PayloadRequest['user'];
    const as = { user, overrideAccess: false, depth: 0 } as const;

    // Sections.
    const sections = await publicJSON<{ docs: Doc[] }>('sections?limit=100&depth=0');
    for (const section of sections.docs) {
      const existing = await payload.find({ collection: 'sections', ...as, where: { slug: { equals: section.slug as string } } });
      if (!existing.docs.length) await payload.create({ collection: 'sections', ...as, data: { slug: section.slug, nameAr: section.nameAr, nameEn: section.nameEn, order: section.order ?? 0 } });
    }

    // Public media and articles (production data is read anonymously; nothing is written there).
    const mediaMap = new Map<number, number>();
    const articles: Doc[] = [];
    for (let page = 1; ; page += 1) {
      const result = await publicJSON<{ docs: Doc[]; hasNextPage: boolean }>(`articles?limit=100&depth=0&page=${page}&sort=id`);
      articles.push(...result.docs);
      if (!result.hasNextPage) break;
    }
    for (const doc of articles) {
      const imageID = typeof doc.image === 'number' ? doc.image : undefined;
      if (!imageID || mediaMap.has(imageID)) continue;
      const media = await publicJSON<Doc>(`media/${imageID}?depth=0`).catch(() => undefined);
      if (!media?.published || typeof media.url !== 'string') continue;
      const existing = await payload.find({ collection: 'media', ...as, where: { attribution: { equals: media.attribution as string } } });
      if (existing.docs[0]) { mediaMap.set(imageID, existing.docs[0].id as number); continue; }
      const file = await fetch(new URL(media.url, PRODUCTION), { signal: AbortSignal.timeout(60000) });
      if (!file.ok) continue;
      const created = await payload.create({
        collection: 'media', ...as, data: { alt: media.alt, attribution: media.attribution, license: media.license, published: true },
        file: { data: Buffer.from(await file.arrayBuffer()), mimetype: 'image/webp', name: media.filename as string, size: Number(file.headers.get('content-length')) },
      });
      mediaMap.set(imageID, created.id as number);
    }
    const ids = new Map<string, Record<Locale, number>>();
    for (const doc of articles) {
      const route = `${doc.section}/${doc.slug}`;
      const found = await payload.find({ collection: 'articles', ...as, where: { and: [{ translationKey: { equals: doc.translationKey as string } }, { locale: { equals: doc.locale as string } }] } });
      let id = found.docs[0]?.id as number | undefined;
      if (!id) {
        const data = {
          title: doc.title, locale: doc.locale, translationKey: doc.translationKey, section: doc.section, slug: doc.slug, summary: doc.summary, category: doc.category,
          period: doc.period, kind: doc.kind, featured: doc.featured, image: typeof doc.image === 'number' ? mediaMap.get(doc.image) : undefined, imageAlt: doc.imageAlt,
          facts: doc.facts, body: doc.body, sources: doc.sources, seoTitle: doc.seoTitle, seoDescription: doc.seoDescription, noIndex: doc.noIndex,
          reviewStatus: 'approved', _status: 'published',
        };
        id = (await payload.create({ collection: 'articles', ...as, data: data as never })).id as number;
      }
      ids.set(route, { ...(ids.get(route) ?? {}), [doc.locale as Locale]: id } as Record<Locale, number>);
    }
    console.log(`Copied ${sections.docs.length} sections, ${articles.length} public articles and ${mediaMap.size} public media records.`);

    const files = process.argv.slice(2).length ? process.argv.slice(2) : ['docs/editorial-batches/riyadh-pilot-20260928.json'];
    const plan = await applyStructureBatches(payload, user!, files, { apply: true, log: () => {} });
    console.log(`Applied ${files.length} batch file(s): ${plan.create.length} created, ${plan.update.length} updated, ${plan.relink.length} linked.`);
  } finally {
    // Payload keeps its first pool client checked out, so pool shutdown can wait forever in a script.
    await Promise.race([payload.destroy(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
}

main().then(() => process.exit(0), (error: unknown) => {
  console.error(`Staging load failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  if (error && typeof error === 'object' && 'data' in error) console.error(JSON.stringify((error as { data: unknown }).data).slice(0, 800));
  process.exit(1);
});
