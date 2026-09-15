import type { ArticleSEO, Entry, ImageCredit } from '../lib/encyclopedia';
import { safeCanonicalURL } from '../lib/article-metadata';
import { nonEmpty, validHTTPURL } from './access';

type ID = number | string;
type Image = ID | ({ id: ID; published?: boolean; url?: string | null } & ImageCredit) | null;
export type PublicArticle = ArticleSEO & {
  id: ID;
  locale: 'ar' | 'en';
  translationKey: string;
  section: Entry['section'];
  slug: string;
  title: string;
  summary: string;
  category: string;
  period: string | null;
  kind: 'ruler' | 'notable' | null;
  featured: boolean;
  image: Image;
  imageAlt: string | null;
  facts: { label: string; value: string }[];
  body: { heading: string; text: string }[];
  sources: { title: string; url: string }[];
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is ID => nonEmpty(value) || (typeof value === 'number' && Number.isSafeInteger(value));
const optionalText = (value: unknown): value is string | null | undefined => value == null || typeof value === 'string';

function invalid(): never {
  // Never echo a malformed document, URL, or credential into an error response.
  throw new Error('CMS returned an invalid approved article. Editorial data repair is required.');
}

/** Validate untrusted adapter/Local API data before reading arrays or merging locales. */
export function decodePublicArticle(value: unknown): PublicArticle {
  if (!record(value)) return invalid();
  const { locale, section, kind, image } = value;
  if (!id(value.id) || value._status !== 'published' || value.reviewStatus !== 'approved'
    || (locale !== 'ar' && locale !== 'en')
    || (section !== 'history' && section !== 'regions' && section !== 'people' && section !== 'heritage')
    || !nonEmpty(value.translationKey) || value.translationKey.length > 160
    || !nonEmpty(value.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)
    || !nonEmpty(value.title) || !nonEmpty(value.summary) || !nonEmpty(value.category)
    || !optionalText(value.period) || !optionalText(value.imageAlt)
    || !optionalText(value.seoTitle) || !optionalText(value.seoDescription) || !optionalText(value.canonicalURL)
    || (value.noIndex != null && typeof value.noIndex !== 'boolean')
    || (kind != null && kind !== 'ruler' && kind !== 'notable')
    || (value.featured != null && typeof value.featured !== 'boolean')) return invalid();

  let decodedImage: Image = null;
  if (image != null) {
    if (id(image)) decodedImage = image;
    else if (record(image) && id(image.id) && optionalText(image.url)
      && (image.published === undefined || typeof image.published === 'boolean')) {
      decodedImage = { id: image.id, published: image.published, url: image.url };
      // Private/unpopulated media never contribute attribution or licensing data.
      if (image.published === true) {
        if (!optionalText(image.attribution) || !optionalText(image.license)) return invalid();
        decodedImage.attribution = image.attribution?.trim() || undefined;
        decodedImage.license = image.license?.trim() || undefined;
      }
    } else return invalid();
  }
  const facts: PublicArticle['facts'] = [];
  if (value.facts != null) {
    if (!Array.isArray(value.facts)) return invalid();
    for (const row of value.facts) {
      if (!record(row) || !nonEmpty(row.label) || !nonEmpty(row.value)) return invalid();
      facts.push({ label: row.label, value: row.value });
    }
  }
  if (!Array.isArray(value.body) || !value.body.length || !Array.isArray(value.sources) || !value.sources.length) return invalid();
  const body: PublicArticle['body'] = [];
  const sources: PublicArticle['sources'] = [];
  for (const row of value.body) {
    if (!record(row) || !nonEmpty(row.heading) || !nonEmpty(row.text)) return invalid();
    body.push({ heading: row.heading, text: row.text });
  }
  for (const row of value.sources) {
    if (!record(row) || !nonEmpty(row.title) || typeof row.url !== 'string' || !validHTTPURL(row.url)) return invalid();
    sources.push({ title: row.title, url: row.url });
  }
  return {
    id: value.id, locale, section, kind: kind ?? null, image: decodedImage,
    translationKey: value.translationKey, slug: value.slug, title: value.title,
    summary: value.summary, category: value.category, period: value.period || null,
    imageAlt: value.imageAlt || null, featured: value.featured === true, facts, body, sources,
    seoTitle: value.seoTitle?.trim() || undefined,
    seoDescription: value.seoDescription?.trim() || undefined,
    canonicalURL: safeCanonicalURL(value.canonicalURL), noIndex: value.noIndex === true,
  };
}

const imageID = (image: Image) => image !== null && typeof image === 'object' ? image.id : image;

export function matchingPublicPair(ar: PublicArticle, en: PublicArticle): boolean {
  return ar.locale === 'ar' && en.locale === 'en' && ar.id !== en.id
    && ar.translationKey === en.translationKey && ar.section === en.section && ar.slug === en.slug
    && ar.period === en.period && ar.kind === en.kind && imageID(ar.image) === imageID(en.image)
    && ar.facts.length === en.facts.length && ar.body.length === en.body.length
    && ar.sources.length === en.sources.length
    && ar.sources.every((source, index) => source.url === en.sources[index].url);
}

/** Arrays retain duplicates so corrupt identities cannot silently overwrite a locale. */
export function groupPublicArticles(articles: PublicArticle[]): Map<string, PublicArticle[]> {
  const groups = new Map<string, PublicArticle[]>();
  for (const article of articles) {
    const group = groups.get(article.translationKey) ?? [];
    group.push(article);
    groups.set(article.translationKey, group);
  }
  return groups;
}