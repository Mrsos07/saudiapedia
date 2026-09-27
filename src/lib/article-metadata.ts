import type { Metadata } from 'next';
import { entryPath, type Entry, type Locale } from './encyclopedia';
import { pageMetadata, siteUrl } from './site';

/** Editorial canonical overrides are absolute, public URLs, never token-bearing URLs. */
export function safeCanonicalURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (/[\u0000-\u001f\u007f]/u.test(value)) return undefined;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text) || /[\s\\?#]/u.test(text)
    || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(text)) return undefined;
  try {
    const url = new URL(text);
    if (!url.hostname || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Only published, non-noindex, self-canonical translations belong in the sitemap. */
export function indexableEntry(entry: Entry, locale: Locale): boolean {
  const seo = entry.seo?.[locale];
  const canonical = safeCanonicalURL(seo?.canonicalURL);
  return entry.status === 'published' && seo?.noIndex !== true && (!canonical || canonical === `${siteUrl}${entryPath(entry, locale)}`);
}

/** hreflang links in the sitemap point only at indexable translations; Arabic is x-default when available. */
export function entryAlternates(entry: Entry): Partial<Record<Locale | 'x-default', string>> {
  const languages: Partial<Record<Locale | 'x-default', string>> = {};
  for (const locale of ['ar', 'en'] as const) if (indexableEntry(entry, locale)) languages[locale] = `${siteUrl}${entryPath(entry, locale)}`;
  const fallback = languages.ar ?? languages.en;
  if (fallback) languages['x-default'] = fallback;
  return languages;
}

/** Locale overrides do not change routes, hreflang, or the site-wide launch gate. */
export function articleMetadata(entry: Entry, locale: Locale): Metadata {
  const seo = entry.seo?.[locale];
  const metadata = pageMetadata(
    locale, seo?.seoTitle?.trim() || entry.title[locale],
    seo?.seoDescription?.trim() || entry.summary[locale],
    `/${entry.section}/${entry.slug}`, entry.status !== 'published' || seo?.noIndex === true,
  );
  const images = [{ url: entry.image, alt: entry.imageAlt[locale] }];
  metadata.openGraph = { ...metadata.openGraph, type: 'article', images };
  metadata.twitter = { ...metadata.twitter, images };
  const canonical = safeCanonicalURL(seo?.canonicalURL);
  if (!canonical) return metadata;
  return {
    ...metadata,
    alternates: { ...metadata.alternates, canonical },
    openGraph: { ...metadata.openGraph, url: canonical },
  };
}