import type { MetadataRoute } from 'next';
import { getContent } from '@/lib/content';
import { getSections } from '@/lib/sections';
import { languageAlternates, siteUrl } from '@/lib/site';
import { entryPath } from '@/lib/encyclopedia';
import { entryAlternates, indexableEntry } from '@/lib/article-metadata';

export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.SITE_INDEXABLE !== 'true') return [];
  const { entries, preview } = await getContent();
  if (preview) return [];
  // 'rulers'/'notable-figures' are fixed pseudo-sections derived from
  // entry.kind (see [locale]/[section]/page.tsx), not administrator-managed
  // sections, so they stay hardcoded here alongside the static policy pages.
  const { sections, preview: sectionsPreview } = await getSections();
  if (sectionsPreview) return [];
  const routes = [...new Set(['', ...sections.filter(section => !['people', 'rulers'].includes(section.slug)).map(section => `/${section.slug}`), '/notable-figures', '/about', '/editorial-policy', '/credits', '/privacy'])];
  const latest = entries.map(entry => entry.dateModified).filter((value): value is string => Boolean(value)).sort().at(-1);
  const pages: MetadataRoute.Sitemap = [];
  for (const locale of ['ar', 'en'] as const) {
    for (const path of routes) {
      pages.push({ url: `${siteUrl}/${locale}${path}`, ...(path === '' && latest ? { lastModified: latest } : {}), alternates: { languages: languageAlternates(path) } });
    }
    for (const entry of entries) {
      if (!indexableEntry(entry, locale)) continue;
      pages.push({ url: `${siteUrl}${entryPath(entry, locale)}`, ...(entry.dateModified ? { lastModified: entry.dateModified } : {}), alternates: { languages: entryAlternates(entry) } });
    }
  }
  return pages;
}
