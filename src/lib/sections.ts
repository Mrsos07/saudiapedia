import { cache } from 'react';
import { cmsConfigured } from './cms';
import { seedSectionLabels, type Localized, type SeedSection } from './encyclopedia';

export type SectionInfo = { slug: string; name: Localized; order: number };

const seedSections: SectionInfo[] = (Object.keys(seedSectionLabels) as SeedSection[]).map((slug, index) => ({
  slug, name: seedSectionLabels[slug], order: index,
}));

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function decodeSection(value: unknown): SectionInfo | null {
  if (!record(value) || typeof value.slug !== 'string' || !value.slug
    || typeof value.nameAr !== 'string' || !value.nameAr
    || typeof value.nameEn !== 'string' || !value.nameEn) return null;
  const order = typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 0;
  return { slug: value.slug, name: { ar: value.nameAr, en: value.nameEn }, order };
}

/** Public, request-scoped, uncached-across-requests list of encyclopedia
 * sections. Falls back to the four seed sections only when the CMS is fully
 * unconfigured (mirrors getContent()'s preview behavior) so local development
 * without a database still has working navigation. A configured but failing
 * database is a real error, not a silent fallback. */
export const getSections = cache(async (): Promise<{ sections: SectionInfo[]; preview: boolean }> => {
  if (!cmsConfigured()) return { sections: seedSections, preview: true };
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('../payload.config')]);
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: 'sections', overrideAccess: false, user: null, depth: 0, limit: 200, sort: 'order',
  });
  const sections: SectionInfo[] = [];
  for (const doc of result.docs) {
    const section = decodeSection(doc);
    if (!section) throw new Error('CMS returned an invalid section. Editorial data repair is required.');
    sections.push(section);
  }
  return { sections, preview: false };
});

export function findSection(sections: SectionInfo[], slug: string): SectionInfo | undefined {
  return sections.find((section) => section.slug === slug);
}
