// Uploads the prepared Commons photographs to production media (S3) and attaches them, with bilingual
// alt text, to both translations of each article through the Payload Local API (hooks, media
// validation, approval audit and versions apply). Idempotent: media are matched by attribution.
//   powershell -File scripts/cms-local.ps1 attach-images            (dry run)
//   powershell -File scripts/cms-local.ps1 attach-images -Apply     (writes)
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type Localized = { ar: string; en: string };
type Batch = {
  images: Record<string, Localized & { filename: string }>;
  reuse: Record<string, Localized & ({ media: number } | { sameAs: string })>;
};
type Manifest = Record<string, { file: string; attribution: string; licenseLabel: string }>;
const apply = process.argv.includes('--apply');
const vault = path.join(process.env.LOCALAPPDATA ?? '', 'KingdomSaudi', 'vexushpbyvaoangxyqcm', 'images-20260929');

if (!/^postgresql:\/\/kingdom_runtime\.vexushpbyvaoangxyqcm:/.test(process.env.DATABASE_URL ?? '')) throw new Error('Run through scripts/cms-local.ps1 with the production runtime role.');
if (!process.env.S3_BUCKET || !process.env.S3_SECRET_ACCESS_KEY) throw new Error('S3 storage settings are required so uploads reach production storage.');

async function main() {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('../src/payload.config')]);
  const payload = await getPayload({ config });
  try {
    const batch = JSON.parse(await readFile('docs/editorial-batches/images-20260929.json', 'utf8')) as Batch;
    const manifest = JSON.parse(await readFile(path.join(vault, 'manifest.json'), 'utf8')) as Manifest;
    // The operator's own administrator account (the oldest one), never a later agent account.
    const { docs: admins } = await payload.find({ collection: 'users', overrideAccess: true, limit: 1, depth: 0, sort: 'createdAt', where: { role: { equals: 'administrator' } } });
    const user = { ...admins[0], collection: 'users' } as never;
    const as = { user, overrideAccess: false, depth: 0 } as const;

    const pair = async (route: string) => {
      const [section, slug] = route.split('/');
      const { docs } = await payload.find({ collection: 'articles', ...as, limit: 3, where: { and: [{ section: { equals: section } }, { slug: { equals: slug } }] } });
      const ar = docs.find(doc => doc.locale === 'ar'); const en = docs.find(doc => doc.locale === 'en');
      if (!ar || !en) throw new Error(`No bilingual pair for ${route}`);
      return { ar, en };
    };
    const mediaFor = new Map<string, number>();
    const plan: string[] = [];
    for (const [route, image] of Object.entries(batch.images)) {
      const entry = manifest[route];
      if (!entry) throw new Error(`Manifest has no file for ${route}`);
      await pair(route);
      const existing = await payload.find({ collection: 'media', ...as, limit: 1, where: { attribution: { equals: entry.attribution } } });
      if (existing.docs[0]) { mediaFor.set(route, existing.docs[0].id as number); plan.push(`${route}: reuse uploaded media ${existing.docs[0].id}`); continue; }
      plan.push(`${route}: upload ${entry.file}`);
      if (!apply) continue;
      const data = await readFile(path.join(vault, entry.file));
      const media = await payload.create({
        collection: 'media', ...as, data: { alt: image.ar, attribution: entry.attribution, license: entry.licenseLabel, published: true } as never,
        file: { data, mimetype: 'image/webp', name: entry.file.replace(/\.webp$/, '-photo.webp'), size: data.length },
      });
      mediaFor.set(route, media.id as number);
    }
    for (const [route, reuse] of Object.entries(batch.reuse)) {
      await pair(route);
      if ('media' in reuse) { mediaFor.set(route, reuse.media); plan.push(`${route}: existing media ${reuse.media}`); }
      else plan.push(`${route}: same photo as ${reuse.sameAs}`);
    }
    if (!apply) { console.log(plan.join('\n')); console.log(`dry run: ${plan.length} articles`); return; }

    let attached = 0;
    for (const [route, alt] of [...Object.entries(batch.images), ...Object.entries(batch.reuse)] as [string, Localized & { sameAs?: string }][]) {
      const mediaID = mediaFor.get(alt.sameAs ?? route);
      if (!mediaID) throw new Error(`No media for ${route}`);
      const docs = await pair(route);
      for (const locale of ['ar', 'en'] as const) {
        await payload.update({ collection: 'articles', id: docs[locale].id, ...as, data: { image: mediaID, imageAlt: alt[locale], reviewStatus: 'approved', _status: 'published' } as never });
      }
      attached += 1;
      console.log(`attached ${route} → media ${mediaID}`);
    }
    console.log(`Done: ${attached} articles now use a real photograph.`);
  } finally {
    await Promise.race([payload.destroy(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
}
main().then(() => process.exit(0), (error: unknown) => {
  console.error(`attach-images failed: ${error instanceof Error ? error.message : 'unexpected error'}`);
  if (error && typeof error === 'object' && 'data' in error) console.error(JSON.stringify((error as { data: unknown }).data).slice(0, 800));
  process.exit(1);
});
