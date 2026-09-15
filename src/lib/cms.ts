import type { Payload } from 'payload';
import type { ArticleSEO, Entry, ImageCredit } from './encyclopedia';
import { decodePublicArticle, groupPublicArticles, matchingPublicPair, type PublicArticle } from '../collections/public-articles';

/** Does not import Payload at runtime, initialize adapters, or expose secret values. */
export function cmsConfigured(): boolean {
  const databaseURL = process.env.DATABASE_URL?.trim();
  const secret = process.env.PAYLOAD_SECRET?.trim();
  if (!databaseURL && !secret) return false;
  if (!databaseURL || !secret) {
    throw new Error('Incomplete CMS configuration. Set both DATABASE_URL and PAYLOAD_SECRET, or leave both empty; see docs/cms.md.');
  }
  if (secret.length < 32) throw new Error('PAYLOAD_SECRET must contain at least 32 random characters.');
  return true;
}

const localized = (ar: string, en: string) => ({ ar, en });

function approvedImage(article: PublicArticle): string | null {
  const image = article.image;
  if (!image || typeof image !== 'object' || image.published !== true || !image.url) return null;
  try {
    const origin = new URL(process.env.CMS_SERVER_URL || 'http://localhost:3000').origin;
    const url = new URL(image.url, origin);
    // No direct storage URLs, credentials, query tokens, fragments or redirects.
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin
      || url.username || url.password || url.search || url.hash
      || !/^\/api\/media\/file\/[^/]+$/.test(url.pathname)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function imageCredit(article: PublicArticle): ImageCredit | undefined {
  if (!approvedImage(article) || !article.image || typeof article.image !== 'object') return undefined;
  const attribution = article.image.attribution?.trim() || undefined;
  const license = article.image.license?.trim() || undefined;
  return attribution || license ? { attribution, license } : undefined;
}

function articleSEO(article: PublicArticle): ArticleSEO {
  return {
    seoTitle: article.seoTitle, seoDescription: article.seoDescription,
    canonicalURL: article.canonicalURL, noIndex: article.noIndex,
  };
}

export function mergePair(ar: PublicArticle, en: PublicArticle): Entry | null {
  if (!matchingPublicPair(ar, en)) return null;
  const arImage = approvedImage(ar);
  const enImage = approvedImage(en);
  if (arImage !== enImage) return null;
  const image = arImage && ar.imageAlt?.trim() && en.imageAlt?.trim() ? arImage : null;
  const credit = image ? imageCredit(ar) : undefined;
  const enCredit = image ? imageCredit(en) : undefined;
  // The shared asset must have a consistent public credit snapshot in both reads.
  if (credit?.attribution !== enCredit?.attribution || credit?.license !== enCredit?.license) return null;

  return {
    section: ar.section,
    slug: ar.slug,
    title: localized(ar.title, en.title),
    summary: localized(ar.summary, en.summary),
    category: localized(ar.category, en.category),
    period: ar.period || undefined,
    kind: ar.kind || undefined,
    featured: Boolean(ar.featured && en.featured),
    image: image || '/images/diriyah.jpg',
    imageCredit: credit,
    seo: { ar: articleSEO(ar), en: articleSEO(en) },
    imageAlt: image ? localized(ar.imageAlt!, en.imageAlt!) : localized(
      'عمارة طينية في الدرعية، صورة سياقية وليست صورة للشخصية',
      'Earthen architecture in Diriyah, a contextual photograph, not a portrait of the person',
    ),
    facts: ar.facts.map((fact, index) => ({
      label: localized(fact.label, en.facts[index].label),
      value: localized(fact.value, en.facts[index].value),
    })),
    body: ar.body.map((section, index) => ({
      heading: localized(section.heading, en.body[index].heading),
      text: localized(section.text, en.body[index].text),
    })),
    sources: ar.sources.map((source, index) => ({ title: localized(source.title, en.sources[index].title), url: source.url })),
    status: 'published',
  };
}

/** Injectable Local API boundary for database-free tests; never changes access flags. */
export type CMSReader = {
  find: (options: Parameters<Payload['find']>[0]) => Promise<{ docs: unknown[]; hasNextPage: boolean }>;
};

export async function readCMSEntries(payload: CMSReader): Promise<Entry[]> {
  const articles: PublicArticle[] = [];
  let page = 1;
  while (true) {
    const result = await payload.find({
      collection: 'articles',
      overrideAccess: false,
      user: null,
      draft: false,
      depth: 1,
      limit: 100,
      page,
      sort: 'id',
      where: { and: [{ _status: { equals: 'published' } }, { reviewStatus: { equals: 'approved' } }] },
    });
    for (const doc of result.docs) articles.push(decodePublicArticle(doc));
    if (!result.hasNextPage) break;
    page += 1;
  }
  const entries: Entry[] = [];
  const routeKeys = new Map<string, string>();
  for (const article of articles) {
    const route = `${article.section}/${article.slug}`;
    const key = routeKeys.get(route);
    if (key !== undefined && key !== article.translationKey) {
      throw new Error('CMS returned inconsistent bilingual articles. Editorial data repair is required.');
    }
    routeKeys.set(route, article.translationKey);
  }
  const canonical = new Set<string>();
  for (const pair of groupPublicArticles(articles).values()) {
    // An unpublish between pages can remove a counterpart. Never serve the orphan.
    if (pair.length === 1) continue;
    const ar = pair.find((article) => article.locale === 'ar');
    const en = pair.find((article) => article.locale === 'en');
    const merged = pair.length === 2 && ar && en ? mergePair(ar, en) : null;
    if (!merged || canonical.has(`${merged.section}/${merged.slug}`)) {
      throw new Error('CMS returned inconsistent bilingual articles. Editorial data repair is required.');
    }
    canonical.add(`${merged.section}/${merged.slug}`);
    entries.push(merged);
  }
  return entries;
}

/** Public-only, uncached, paginated. Null means fully unconfigured, never failure. */
export async function getCMSEntries(): Promise<Entry[] | null> {
  if (!cmsConfigured()) return null;
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('../payload.config')]);
  return readCMSEntries(await getPayload({ config }));
}