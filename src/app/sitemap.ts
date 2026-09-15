import type { MetadataRoute } from 'next';
import { getContent } from '@/lib/content';
import { getSections } from '@/lib/sections';
import { siteUrl } from '@/lib/site';
import { entryPath } from '@/lib/encyclopedia';

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
  const pages: MetadataRoute.Sitemap = [];
  for (const locale of ['ar', 'en'] as const) {
    for (const path of routes) pages.push({ url: `${siteUrl}/${locale}${path}`, alternates: { languages: { ar: `${siteUrl}/ar${path}`, en: `${siteUrl}/en${path}` } } });
    for (const entry of entries) if (entry.status === 'published') pages.push({ url: `${siteUrl}${entryPath(entry, locale)}`, alternates: { languages: { ar: `${siteUrl}${entryPath(entry, 'ar')}`, en: `${siteUrl}${entryPath(entry, 'en')}` } } });
  }
  return pages;
}