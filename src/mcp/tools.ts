import { randomUUID } from 'node:crypto';
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest, type Where } from 'payload';
import { canReview, validHTTPURL } from '../collections/access';
import { completeBodyRow } from '../collections/Articles';
import { bodyRoles, entityTypes, siteTypes } from '../collections/structure-relations';
import { invalidatePublicContent } from '../lib/public-cache';
import { linkRoutes, paragraphsToLexical, richNodesToParagraphs } from '../lib/rich-text-authoring';
import { sanitizeRichText } from '../lib/rich-text';
import { InputError, ROUTE, s, SLUG, type Infer, type JSONSchema, type Schema } from './schema';

type Locale = 'ar' | 'en';
type Doc = Record<string, unknown> & { id: number | string };
type User = NonNullable<PayloadRequest['user']>;
export type ToolContext = { payload: Payload; user: User };
export type ToolAnnotations = { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: false };
export type Tool = { name: string; description: string; annotations: ToolAnnotations; write: boolean; input: Schema<unknown>; run: (input: never, context: ToolContext) => Promise<Record<string, unknown>> };

const locales: Locale[] = ['ar', 'en'];
const ARTICLE_FIELDS = ['title', 'summary', 'category', 'period', 'kind', 'section', 'slug', 'translationKey', 'locale', 'entityType', 'siteType', 'parent', 'related', 'facts', 'body', 'sources', 'image', 'imageAlt', 'seoTitle', 'seoDescription', 'canonicalURL', 'noIndex', 'reviewStatus', '_status', 'updatedAt', 'createdAt'];
const select = Object.fromEntries(ARTICLE_FIELDS.map(field => [field, true]));

/** An editorial failure the agent can act on (never an internal stack trace). */
export class ToolError extends Error {}

// ---------- shared schemas ----------
const translationKey = s.string({ min: 1, max: 160, pattern: /^[\p{L}\p{N}._:-]+$/u, description: 'Stable key shared by the Arabic and English documents of one article.' });
const route = s.string({ max: 200, pattern: ROUTE, description: 'Article route "section/slug", e.g. "regions/riyadh".' });
const paragraphs = s.array(s.string({ min: 1, max: 6000 }), 40, 'Paragraphs. Mark internal links as [[section/slug|label]] and citations as [n] (1-based index into sources).', 1);
const bodyRow = s.object({ heading: s.string({ min: 1, max: 200 }), role: s.enum(bodyRoles, 'Optional section role; places automatic lists on region/hub pages.'), paragraphs }, ['heading', 'paragraphs']);
const fact = s.object({ label: s.string({ min: 1, max: 120 }), value: s.string({ min: 1, max: 300 }) }, ['label', 'value']);
const localizedFields = {
  title: s.string({ min: 1, max: 200 }), summary: s.string({ min: 1, max: 600 }), category: s.string({ min: 1, max: 120, description: 'Public category label in this language.' }),
  imageAlt: s.string({ max: 300 }), facts: s.array(fact, 30, 'Infobox rows; both languages need the same count.'), body: s.array(bodyRow, 30, 'Replaces the whole body; both languages need the same number of sections.', 1),
  seoTitle: s.string({ max: 70 }), seoDescription: s.string({ max: 160 }),
};
const localizedCreate = s.object(localizedFields, ['title', 'summary', 'category', 'body']);
const localizedUpdate = s.object(localizedFields);
const source = s.object({ url: s.string({ max: 2000, format: 'uri' }), title: s.object({ ar: s.string({ min: 1, max: 300 }), en: s.string({ min: 1, max: 300 }) }, ['ar', 'en']) }, ['url', 'title']);
const sharedFields = {
  section: s.string({ max: 80, pattern: SLUG }), slug: s.string({ max: 120, pattern: SLUG }),
  entityType: s.enum(entityTypes), siteType: s.enum(siteTypes, 'Only for entityType "site".'), period: s.string({ max: 60 }), kind: s.enum(['ruler', 'notable'] as const, 'People only.'),
  parent: s.string({ max: 200, pattern: /^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*|none)$/, description: 'Route of the parent article, or "none" to clear.' }),
  related: s.array(route, 20, 'Routes of related articles (replaces the list).'),
  sources: s.array(source, 40, 'Citations in [n] order; replaces the list.', 1),
  noIndex: s.boolean('Exclude this article from search engines.'),
};
const expectedUpdatedAt = s.object({ ar: s.string({ max: 40 }), en: s.string({ max: 40 }) }, ['ar', 'en'], 'updatedAt values from get_article; the write is refused if either document changed since.');

// ---------- helpers ----------
const text = (value: unknown) => typeof value === 'string' ? value : '';
function routeOf(value: unknown): string | null {
  if (value && typeof value === 'object' && 'section' in value && 'slug' in value) return `${String(value.section)}/${String(value.slug)}`;
  return null;
}
function paragraphsOf(row: Record<string, unknown>): string[] {
  const rich = richNodesToParagraphs(sanitizeRichText(row.content));
  return rich.length ? rich : text(row.text).split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
}
function view(doc: Doc) {
  return {
    id: doc.id, locale: doc.locale, title: doc.title, summary: doc.summary, category: doc.category, period: doc.period ?? null, kind: doc.kind ?? null,
    route: `${doc.section}/${doc.slug}`, translationKey: doc.translationKey, entityType: doc.entityType ?? null, siteType: doc.siteType ?? null,
    parent: routeOf(doc.parent), related: Array.isArray(doc.related) ? doc.related.map(routeOf).filter(Boolean) : [],
    facts: Array.isArray(doc.facts) ? doc.facts.map(row => ({ label: (row as Doc).label, value: (row as Doc).value })) : [],
    body: Array.isArray(doc.body) ? doc.body.map(row => ({ heading: (row as Doc).heading, role: (row as Doc).role ?? null, paragraphs: paragraphsOf(row as Doc) })) : [],
    sources: Array.isArray(doc.sources) ? doc.sources.map(row => ({ title: (row as Doc).title, url: (row as Doc).url })) : [],
    image: doc.image && typeof doc.image === 'object' ? (doc.image as Doc).id : doc.image ?? null, imageAlt: doc.imageAlt ?? null,
    seoTitle: doc.seoTitle ?? null, seoDescription: doc.seoDescription ?? null, noIndex: doc.noIndex === true,
    reviewStatus: doc.reviewStatus, status: doc._status, updatedAt: doc.updatedAt,
  };
}

async function findArticles(context: ToolContext, where: Where, options: { limit?: number; page?: number; depth?: number; req?: PayloadRequest } = {}) {
  return context.payload.find({ collection: 'articles', user: context.user, overrideAccess: false, where, depth: options.depth ?? 1, limit: options.limit ?? 10, page: options.page ?? 1, sort: '-updatedAt', select: select as never, ...(options.req ? { req: options.req } : {}) });
}
async function pair(context: ToolContext, key: string, req?: PayloadRequest): Promise<Partial<Record<Locale, Doc>>> {
  const { docs } = await findArticles(context, { translationKey: { equals: key } }, { limit: 3, req });
  const out: Partial<Record<Locale, Doc>> = {};
  for (const doc of docs as Doc[]) {
    const locale = doc.locale as Locale;
    if (out[locale]) throw new ToolError('Two documents share this translation key and language; fix it in the admin panel.');
    out[locale] = doc;
  }
  return out;
}
async function requirePair(context: ToolContext, key: string, req?: PayloadRequest) {
  const found = await pair(context, key, req);
  if (!found.ar || !found.en) throw new ToolError(`Article "${key}" needs both an Arabic and an English document (found: ${Object.keys(found).join(', ') || 'none'}).`);
  return found as Record<Locale, Doc>;
}
async function resolveRoutes(context: ToolContext, routes: string[], req?: PayloadRequest): Promise<Map<string, Record<Locale, number | string>>> {
  const out = new Map<string, Record<Locale, number | string>>();
  for (const value of [...new Set(routes)].slice(0, 200)) {
    const [section, slug] = value.split('/');
    const { docs } = await findArticles(context, { and: [{ section: { equals: section } }, { slug: { equals: slug } }] }, { limit: 3, depth: 0, req });
    const ar = (docs as Doc[]).find(doc => doc.locale === 'ar'); const en = (docs as Doc[]).find(doc => doc.locale === 'en');
    if (ar && en) out.set(value, { ar: ar.id, en: en.id });
  }
  return out;
}
function checkCitations(body: { paragraphs: string[] }[], sourceCount: number, label: string) {
  for (const row of body) for (const paragraph of row.paragraphs) for (const match of paragraph.matchAll(/\[(\d+)\]/g)) {
    if (Number(match[1]) < 1 || Number(match[1]) > sourceCount) throw new ToolError(`${label}: citation ${match[0]} has no matching source (${sourceCount} sources).`);
  }
}
function assertFresh(docs: Record<Locale, Doc>, expected: { ar: string; en: string }) {
  for (const locale of locales) if (String(docs[locale].updatedAt) !== expected[locale]) {
    throw new ToolError(`The ${locale} document changed since it was read (now ${String(docs[locale].updatedAt)}). Call get_article again and re-apply the change.`);
  }
}
/** Pair writes share one transaction: either both languages change or neither does. */
async function inTransaction<T>(context: ToolContext, work: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user: context.user }, context.payload);
  const started = await initTransaction(req);
  try {
    const result = await work(req);
    if (started) await commitTransaction(req);
    return result;
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}
function unwrap(error: unknown): never {
  if (error instanceof ToolError || error instanceof InputError) throw error;
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : '';
  // Payload APIError messages are editorial validation text written for editors; anything else stays generic.
  if (typeof status === 'number' && status >= 400 && status < 500 && message) throw new ToolError(message.slice(0, 600));
  if ((error as { data?: { errors?: { message?: string; path?: string }[] } })?.data?.errors?.length) {
    const details = (error as { data: { errors: { message?: string; path?: string }[] } }).data.errors.map(item => `${item.path ?? ''} ${item.message ?? ''}`.trim()).join('; ');
    throw new ToolError(details.slice(0, 600));
  }
  throw error;
}
type LocalizedInput = Partial<Infer<typeof localizedUpdate>>;
function localizedData(input: LocalizedInput, locale: Locale, resolve: (value: string) => number | string | undefined) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}), ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}), ...(input.imageAlt !== undefined ? { imageAlt: input.imageAlt } : {}),
    ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}), ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
    ...(input.facts !== undefined ? { facts: input.facts } : {}),
    ...(input.body !== undefined ? { body: input.body.map(row => ({ heading: row.heading, role: row.role ?? null, text: '', content: paragraphsToLexical(row.paragraphs, locale, resolve) })) } : {}),
  };
}
type SharedInput = Partial<Infer<ReturnType<typeof s.object<typeof sharedFields>>>>;
async function structureData(context: ToolContext, input: SharedInput, locale: Locale, routes: Map<string, Record<Locale, number | string>>) {
  const missing = [...(input.parent && input.parent !== 'none' ? [input.parent] : []), ...(input.related ?? [])].filter(value => !routes.has(value));
  if (missing.length) throw new ToolError(`These routes have no Arabic+English pair: ${missing.join(', ')}.`);
  return {
    ...(input.section !== undefined ? { section: input.section } : {}), ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.entityType !== undefined ? { entityType: input.entityType } : {}), ...(input.siteType !== undefined ? { siteType: input.siteType } : {}),
    ...(input.period !== undefined ? { period: input.period } : {}), ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(input.noIndex !== undefined ? { noIndex: input.noIndex } : {}),
    ...(input.parent !== undefined ? { parent: input.parent === 'none' ? null : routes.get(input.parent)![locale] } : {}),
    ...(input.related !== undefined ? { related: input.related.map(value => routes.get(value)![locale]) } : {}),
    ...(input.sources !== undefined ? { sources: input.sources.map(item => ({ title: item.title[locale], url: item.url })) } : {}),
  };
}
function validateSources(sources: { url: string }[] | undefined) {
  for (const item of sources ?? []) if (!validHTTPURL(item.url)) throw new ToolError(`Source URL is not an absolute HTTP(S) URL without credentials: ${item.url.slice(0, 120)}`);
}

// ---------- publication checklist ----------
async function checklist(context: ToolContext, key: string) {
  const errors: string[] = []; const warnings: string[] = [];
  const found = await pair(context, key);
  for (const locale of locales) if (!found[locale]) errors.push(`Missing ${locale} document.`);
  if (!found.ar || !found.en) return { ready: false, errors, warnings };
  const ar = found.ar; const en = found.en;
  for (const field of ['section', 'slug', 'period', 'kind', 'entityType', 'siteType'] as const) if ((ar[field] ?? null) !== (en[field] ?? null)) errors.push(`"${field}" differs between translations.`);
  const imageID = (doc: Doc) => doc.image && typeof doc.image === 'object' ? (doc.image as Doc).id : doc.image ?? null;
  if (imageID(ar) !== imageID(en)) errors.push('The translations use different images.');
  if (imageID(ar) && (!text(ar.imageAlt).trim() || !text(en.imageAlt).trim())) warnings.push('Image alt text is missing in one language; the public site will fall back to a contextual photo.');
  for (const field of ['facts', 'body', 'sources'] as const) {
    const a = Array.isArray(ar[field]) ? (ar[field] as unknown[]).length : 0; const b = Array.isArray(en[field]) ? (en[field] as unknown[]).length : 0;
    if (a !== b) errors.push(`"${field}" has ${a} Arabic and ${b} English rows; counts must match.`);
  }
  const arSources = (ar.sources as Doc[] | undefined) ?? []; const enSources = (en.sources as Doc[] | undefined) ?? [];
  if (!arSources.length) errors.push('At least one source is required.');
  if (arSources.some((row, index) => row.url !== enSources[index]?.url)) errors.push('Source URLs must be identical and in the same order in both languages.');
  if (arSources.some(row => !validHTTPURL(row.url) || !text(row.title).trim()) || enSources.some(row => !text(row.title).trim())) errors.push('Every source needs a title and an HTTP(S) URL.');
  const routes: string[] = [];
  for (const locale of locales) {
    const doc = found[locale]!;
    for (const field of ['title', 'summary', 'category', 'slug'] as const) if (!text(doc[field]).trim()) errors.push(`${locale}: "${field}" is empty.`);
    const body = (doc.body as Doc[] | undefined) ?? [];
    if (!body.length || body.some(row => !completeBodyRow(row))) errors.push(`${locale}: every body section needs a heading and text.`);
    const sourceCount = ((doc.sources as unknown[] | undefined) ?? []).length;
    for (const row of body) for (const paragraph of paragraphsOf(row)) {
      for (const match of paragraph.matchAll(/\[(\d+)\]/g)) if (Number(match[1]) < 1 || Number(match[1]) > sourceCount) errors.push(`${locale}: citation ${match[0]} has no matching source.`);
      routes.push(...linkRoutes([paragraph]));
    }
    if (text(doc.seoTitle).length > 60) warnings.push(`${locale}: SEO title is over 60 characters.`);
    if (text(doc.seoDescription).length > 155) warnings.push(`${locale}: SEO description is over 155 characters.`);
  }
  if (routeOf(ar.parent) !== routeOf(en.parent)) warnings.push('Parent differs between translations; the public site will drop the parent link.');
  const published = new Set((await Promise.all([...new Set(routes)].map(async value => {
    const [section, slug] = value.split('/');
    const { docs } = await findArticles(context, { and: [{ section: { equals: section } }, { slug: { equals: slug } }, { _status: { equals: 'published' } }] }, { limit: 2, depth: 0 });
    return docs.length === 2 ? value : null;
  }))).filter(Boolean));
  for (const value of new Set(routes)) if (!published.has(value)) warnings.push(`Internal link to "${value}" is not a published pair yet; it will show as plain text.`);
  return { ready: errors.length === 0, errors, warnings };
}

// ---------- tools ----------
const read = (title: string): ToolAnnotations => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const tool = <S extends Schema<unknown>>(definition: { name: string; description: string; annotations: ToolAnnotations; input: S; run: (input: Infer<S>, context: ToolContext) => Promise<Record<string, unknown>> }): Tool => ({
  ...definition, write: !definition.annotations.readOnlyHint, input: definition.input, run: definition.run as never,
});

export const tools: Tool[] = [
  tool({
    name: 'whoami', description: 'The authenticated CMS account, its role and what it may do through this server.', annotations: read('Current account'), input: s.object({}),
    run: async (_input, { user }) => ({ id: user.id, name: (user as Doc).name ?? null, role: (user as Doc).role, canPublish: canReview({ user }) }),
  }),
  tool({
    name: 'list_sections', description: 'Encyclopedia sections (slug and names) used in article routes.', annotations: read('List sections'), input: s.object({}),
    run: async (_input, { payload, user }) => {
      const { docs } = await payload.find({ collection: 'sections', user, overrideAccess: false, limit: 100, depth: 0, sort: 'order' });
      return { sections: (docs as Doc[]).map(doc => ({ slug: doc.slug, nameAr: doc.nameAr, nameEn: doc.nameEn })) };
    },
  }),
  tool({
    name: 'search_articles', description: 'Find article documents (one per language) by text, section, status or entity type. Returns summaries; use get_article for full content.', annotations: read('Search articles'),
    input: s.object({
      query: s.string({ max: 120, description: 'Words matched against title and summary.' }), section: s.string({ max: 80, pattern: SLUG }), locale: s.enum(['ar', 'en'] as const),
      status: s.enum(['draft', 'published'] as const), reviewStatus: s.enum(['draft', 'factual-review', 'translation-review', 'approved'] as const), entityType: s.enum(entityTypes),
      page: s.integer(1, 1000), limit: s.integer(1, 25),
    }),
    run: async (input, context) => {
      const and: Where[] = [];
      if (input.query) and.push({ or: [{ title: { like: input.query } }, { summary: { like: input.query } }] });
      if (input.section) and.push({ section: { equals: input.section } });
      if (input.locale) and.push({ locale: { equals: input.locale } });
      if (input.status) and.push({ _status: { equals: input.status } });
      if (input.reviewStatus) and.push({ reviewStatus: { equals: input.reviewStatus } });
      if (input.entityType) and.push({ entityType: { equals: input.entityType } });
      const result = await findArticles(context, and.length ? { and } : {}, { limit: input.limit ?? 10, page: input.page ?? 1, depth: 0 });
      return {
        totalDocs: result.totalDocs, page: result.page, totalPages: result.totalPages,
        articles: (result.docs as Doc[]).map(doc => ({ id: doc.id, locale: doc.locale, title: doc.title, route: `${doc.section}/${doc.slug}`, translationKey: doc.translationKey, entityType: doc.entityType ?? null, status: doc._status, reviewStatus: doc.reviewStatus, updatedAt: doc.updatedAt })),
      };
    },
  }),
  tool({
    name: 'get_article', description: 'Full editorial content of both translations of an article (by translationKey or route), in the authoring format accepted by update_article. Includes updatedAt values required for writes.', annotations: read('Get article'),
    input: s.object({ translationKey, route }),
    run: async (input, context) => {
      let key = input.translationKey;
      if (!key && input.route) {
        const [section, slug] = input.route.split('/');
        key = ((await findArticles(context, { and: [{ section: { equals: section } }, { slug: { equals: slug } }] }, { limit: 1, depth: 0 })).docs[0] as Doc | undefined)?.translationKey as string | undefined;
      }
      if (!key) throw new ToolError('Provide translationKey or an existing route.');
      const found = await pair(context, key);
      if (!found.ar && !found.en) throw new ToolError(`No article with translation key "${key}".`);
      return { translationKey: key, ar: found.ar ? view(found.ar) : null, en: found.en ? view(found.en) : null };
    },
  }),
  tool({
    name: 'get_structure', description: 'Where an article sits in the encyclopedia: ancestors, children, explicit related articles and articles that link to it.', annotations: read('Get structure'),
    input: s.object({ translationKey }, ['translationKey']),
    run: async (input, context) => {
      const { ar } = await pair(context, input.translationKey);
      if (!ar) throw new ToolError('The Arabic document is required to read the structure.');
      const brief = (doc: Doc) => ({ route: `${doc.section}/${doc.slug}`, title: doc.title, translationKey: doc.translationKey, entityType: doc.entityType ?? null, status: doc._status });
      const ancestors: ReturnType<typeof brief>[] = [];
      let parent = ar.parent as Doc | number | null | undefined;
      for (let depth = 0; parent && depth < 6; depth += 1) {
        const doc = typeof parent === 'object' ? parent : (await findArticles(context, { id: { equals: parent } }, { limit: 1 })).docs[0] as Doc | undefined;
        if (!doc) break;
        ancestors.unshift(brief(doc));
        parent = doc.parent as Doc | number | null | undefined;
        if (parent && typeof parent === 'object') parent = (parent as Doc).id as number;
      }
      const children = (await findArticles(context, { parent: { equals: ar.id } }, { limit: 100, depth: 0 })).docs as Doc[];
      const backlinks = (await findArticles(context, { related: { in: [ar.id] } }, { limit: 100, depth: 0 })).docs as Doc[];
      return { article: brief(ar), ancestors, children: children.map(brief), related: Array.isArray(ar.related) ? (ar.related as Doc[]).filter(item => typeof item === 'object').map(brief) : [], linkedFrom: backlinks.map(brief) };
    },
  }),
  tool({
    name: 'list_categories', description: 'Category library for a section (private editorial associations).', annotations: read('List categories'),
    input: s.object({ section: s.string({ max: 80, pattern: SLUG }) }, ['section']),
    run: async (input, { payload, user }) => {
      const { docs } = await payload.find({ collection: 'categories', user, overrideAccess: false, where: { section: { equals: input.section } }, limit: 100, depth: 0 });
      return { categories: (docs as Doc[]).map(doc => ({ id: doc.id, nameAr: doc.nameAr ?? doc.name ?? null, nameEn: doc.nameEn ?? null })) };
    },
  }),
  tool({
    name: 'review_checklist', description: 'Checks whether a bilingual article is ready to publish: matching translations, complete sections, valid citations and sources, and internal links to published articles. publish_article runs the same checks.', annotations: read('Publication checklist'),
    input: s.object({ translationKey }, ['translationKey']),
    run: async (input, context) => ({ translationKey: input.translationKey, ...(await checklist(context, input.translationKey)) }),
  }),
  tool({
    name: 'create_article', description: 'Creates a new bilingual article (Arabic + English documents) as an unpublished draft in one transaction. Body paragraphs use [[section/slug|label]] for internal links and [n] for citations.',
    annotations: { title: 'Create article draft', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: s.object({ ...sharedFields, translationKey, ar: localizedCreate, en: localizedCreate }, ['section', 'slug', 'sources', 'ar', 'en']),
    run: async (input, context) => {
      const key = input.translationKey ?? `mcp-${randomUUID()}`;
      if ((input.ar.facts?.length ?? 0) !== (input.en.facts?.length ?? 0) || input.ar.body.length !== input.en.body.length) throw new ToolError('Arabic and English need the same number of facts and body sections.');
      validateSources(input.sources);
      checkCitations(input.ar.body, input.sources!.length, 'ar'); checkCitations(input.en.body, input.sources!.length, 'en');
      if (Object.keys(await pair(context, key)).length) throw new ToolError(`Translation key "${key}" is already used.`);
      return inTransaction(context, async req => {
        const routes = await resolveRoutes(context, [...linkRoutes([...input.ar.body, ...input.en.body].flatMap(row => row.paragraphs)), ...(input.parent && input.parent !== 'none' ? [input.parent] : []), ...(input.related ?? [])], req);
        const created: Record<string, unknown> = {};
        for (const locale of locales) {
          const data = { ...(await structureData(context, input, locale, routes)), ...localizedData(input[locale], locale, value => routes.get(value)?.[locale]), locale, translationKey: key, reviewStatus: 'draft', _status: 'draft' };
          const doc = await context.payload.create({ collection: 'articles', user: context.user, overrideAccess: false, req, data: data as never, depth: 0 }).catch(unwrap) as Doc;
          created[locale] = { id: doc.id, updatedAt: doc.updatedAt };
        }
        return { translationKey: key, route: `${input.section}/${input.slug}`, status: 'draft', created, next: 'Run review_checklist, then publish_article (reviewer or administrator accounts only).' };
      });
    },
  }),
  tool({
    name: 'update_article', description: 'Updates both translations of an article in one transaction. Provided arrays (body, facts, sources, related) replace the existing ones. Any content change on a published article returns it to draft until it is approved and published again, as in the admin panel.',
    annotations: { title: 'Update article', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    input: s.object({ translationKey, expectedUpdatedAt, ...sharedFields, ar: localizedUpdate, en: localizedUpdate }, ['translationKey', 'expectedUpdatedAt']),
    run: async (input, context) => {
      validateSources(input.sources);
      if (input.ar?.body && input.en?.body && input.ar.body.length !== input.en.body.length) throw new ToolError('Arabic and English need the same number of body sections.');
      if (Boolean(input.ar?.body) !== Boolean(input.en?.body)) throw new ToolError('Replace the body in both languages together so the sections stay aligned.');
      return inTransaction(context, async req => {
        const docs = await requirePair(context, input.translationKey, req);
        assertFresh(docs, input.expectedUpdatedAt);
        const sourceCount = input.sources?.length ?? ((docs.ar.sources as unknown[] | undefined) ?? []).length;
        if (input.ar?.body) checkCitations(input.ar.body, sourceCount, 'ar');
        if (input.en?.body) checkCitations(input.en.body, sourceCount, 'en');
        const bodies = [...(input.ar?.body ?? []), ...(input.en?.body ?? [])];
        const routes = await resolveRoutes(context, [...linkRoutes(bodies.flatMap(row => row.paragraphs)), ...(input.parent && input.parent !== 'none' ? [input.parent] : []), ...(input.related ?? [])], req);
        const result: Record<string, unknown> = {};
        for (const locale of locales) {
          const data = { ...(await structureData(context, input, locale, routes)), ...localizedData(input[locale] ?? {}, locale, value => routes.get(value)?.[locale]) };
          if (!Object.keys(data).length) continue;
          const doc = await context.payload.update({ collection: 'articles', id: docs[locale].id, user: context.user, overrideAccess: false, req, data: data as never, depth: 0 }).catch(unwrap) as Doc;
          result[locale] = { id: doc.id, status: doc._status, reviewStatus: doc.reviewStatus, updatedAt: doc.updatedAt };
        }
        if (!Object.keys(result).length) throw new ToolError('Nothing to update.');
        return { translationKey: input.translationKey, updated: result };
      }).then(output => { invalidatePublicContent(); return output; });
    },
  }),
  tool({
    name: 'set_review_status', description: 'Moves both translations to a review stage (draft, factual-review, translation-review). Approval happens only through publish_article.',
    annotations: { title: 'Set review stage', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    input: s.object({ translationKey, expectedUpdatedAt, status: s.enum(['draft', 'factual-review', 'translation-review'] as const) }, ['translationKey', 'expectedUpdatedAt', 'status']),
    run: async (input, context) => inTransaction(context, async req => {
      const docs = await requirePair(context, input.translationKey, req);
      assertFresh(docs, input.expectedUpdatedAt);
      const out: Record<string, unknown> = {};
      for (const locale of locales) {
        const doc = await context.payload.update({ collection: 'articles', id: docs[locale].id, user: context.user, overrideAccess: false, req, data: { reviewStatus: input.status } as never, depth: 0 }).catch(unwrap) as Doc;
        out[locale] = { status: doc._status, reviewStatus: doc.reviewStatus, updatedAt: doc.updatedAt };
      }
      return { translationKey: input.translationKey, updated: out };
    }).then(output => { invalidatePublicContent(); return output; }),
  }),
  tool({
    name: 'publish_article', description: 'Approves and publishes both translations after the publication checklist passes. Requires a reviewer or administrator account, confirm=true and the current updatedAt values. Publishing makes the article public and indexable.',
    annotations: { title: 'Approve and publish', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    input: s.object({ translationKey, expectedUpdatedAt, confirm: s.literal(true, 'Must be true: publishing is visible to the public.') }, ['translationKey', 'expectedUpdatedAt', 'confirm']),
    run: async (input, context) => {
      if (!canReview({ user: context.user })) throw new ToolError('Only reviewer or administrator accounts can approve and publish. Use set_review_status to hand the article to a reviewer.');
      const check = await checklist(context, input.translationKey);
      if (!check.ready) return { published: false, ...check };
      const output = await inTransaction(context, async req => {
        const docs = await requirePair(context, input.translationKey, req);
        assertFresh(docs, input.expectedUpdatedAt);
        const out: Record<string, unknown> = {};
        for (const locale of locales) {
          const doc = await context.payload.update({ collection: 'articles', id: docs[locale].id, user: context.user, overrideAccess: false, req, data: { reviewStatus: 'approved', _status: 'published' } as never, depth: 0 }).catch(unwrap) as Doc;
          out[locale] = { status: doc._status, reviewStatus: doc.reviewStatus, updatedAt: doc.updatedAt };
        }
        return out;
      });
      invalidatePublicContent();
      return { published: true, translationKey: input.translationKey, updated: output, warnings: check.warnings };
    },
  }),
  tool({
    name: 'unpublish_article', description: 'Takes both translations off the public site (they stay in the CMS as drafts with their history). Requires confirm=true and the current updatedAt values.',
    annotations: { title: 'Unpublish', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    input: s.object({ translationKey, expectedUpdatedAt, confirm: s.literal(true, 'Must be true: the article disappears from the public site.') }, ['translationKey', 'expectedUpdatedAt', 'confirm']),
    run: async (input, context) => {
      const output = await inTransaction(context, async req => {
        const docs = await requirePair(context, input.translationKey, req);
        assertFresh(docs, input.expectedUpdatedAt);
        const out: Record<string, unknown> = {};
        for (const locale of locales) {
          const doc = await context.payload.update({ collection: 'articles', id: docs[locale].id, user: context.user, overrideAccess: false, req, data: { _status: 'draft' } as never, depth: 0 }).catch(unwrap) as Doc;
          out[locale] = { status: doc._status, reviewStatus: doc.reviewStatus, updatedAt: doc.updatedAt };
        }
        return out;
      });
      invalidatePublicContent();
      return { unpublished: true, translationKey: input.translationKey, updated: output };
    },
  }),
];

export function toolList(): { name: string; title: string; description: string; inputSchema: JSONSchema; annotations: ToolAnnotations }[] {
  return tools.map(item => ({ name: item.name, title: item.annotations.title, description: item.description, inputSchema: item.input.json, annotations: item.annotations }));
}
