import type { Entry, Locale } from './encyclopedia';
import { brand, intro, siteUrl } from './site';

type Node = Record<string, unknown>;

const organizationID = `${siteUrl}/#organization`;
const websiteID = (locale: Locale) => `${siteUrl}/${locale}#website`;
const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`);

export function organization(): Node {
  return {
    '@type': 'Organization', '@id': organizationID, name: brand.ar, alternateName: brand.en, url: siteUrl,
    logo: { '@type': 'ImageObject', url: absolute('/brand/saudi-map-logo.svg'), width: 520, height: 440 },
  };
}

export function website(locale: Locale): Node {
  return {
    '@type': 'WebSite', '@id': websiteID(locale), url: `${siteUrl}/${locale}`, name: brand[locale],
    alternateName: brand[locale === 'ar' ? 'en' : 'ar'], description: intro[locale], inLanguage: locale,
    publisher: { '@id': organizationID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/${locale}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbs(items: { name: string; path: string }[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absolute(item.path) })),
  };
}

export function collectionPage(locale: Locale, name: string, description: string, path: string, entries: Entry[], entryURL: (entry: Entry) => string): Node {
  return {
    '@type': 'CollectionPage', '@id': absolute(path), url: absolute(path), name, description, inLanguage: locale,
    isPartOf: { '@id': websiteID(locale) },
    ...(entries.length ? { mainEntity: {
      '@type': 'ItemList', numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({ '@type': 'ListItem', position: index + 1, url: absolute(entryURL(entry)), name: entry.title[locale] })),
    } } : {}),
  };
}

/** Article rich-result fields that the published CMS pair can support truthfully. */
export function article(entry: Entry, locale: Locale, url: string): Node {
  const subject = entry.kind ? { '@type': 'Person', name: entry.title[locale] }
    : entry.section === 'regions' ? { '@type': 'Place', name: entry.title[locale] } : undefined;
  return {
    '@type': 'Article', '@id': `${url}#article`, mainEntityOfPage: url, url,
    headline: entry.title[locale].slice(0, 110), description: entry.seo?.[locale]?.seoDescription || entry.summary[locale],
    inLanguage: locale, articleSection: entry.category[locale],
    image: [{ '@type': 'ImageObject', url: absolute(entry.image), caption: entry.imageAlt[locale] }],
    ...(entry.datePublished ? { datePublished: entry.datePublished } : {}),
    ...(entry.dateModified ? { dateModified: entry.dateModified } : {}),
    author: { '@id': organizationID }, publisher: { '@id': organizationID },
    isPartOf: { '@id': websiteID(locale) },
    ...(subject ? { about: subject } : {}),
    ...(entry.sources.length ? { citation: entry.sources.map(source => source.url) } : {}),
  };
}

/** One @graph per page; `<` is escaped so text can never close the script element. */
export function serializeGraph(nodes: Node[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
}
