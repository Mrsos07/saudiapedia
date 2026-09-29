// Applies editorial structure batches (docs/editorial-batches/*-20260928.json) through the Payload
// Local API as an authorized user: hooks, validation, approval audit and versions all run normally.
// Idempotent: documents are matched by translation key, so a rerun updates instead of duplicating.
import { readFile } from 'node:fs/promises';
import type { Payload, PayloadRequest } from 'payload';
import { INTERNAL_LINK, linkRoutes, paragraphsToLexical } from '../../src/lib/rich-text-authoring';

const locales = ['ar', 'en'] as const;
type Locale = (typeof locales)[number];
type Doc = Record<string, unknown> & { id: number };
type BatchRow = { role?: string; ar: { heading: string; paragraphs: string[] }; en: { heading: string; paragraphs: string[] } };
export type BatchTopic = {
  section: string; slug: string; translationKey: string; replaceBody?: boolean; entityType?: string; siteType?: string; parent?: string; related?: string[]; period?: string; kind?: 'ruler' | 'notable';
  ar?: { title: string; summary: string; category: string }; en?: { title: string; summary: string; category: string };
  facts?: { ar: [string, string]; en: [string, string] }[]; sources: { ar: string; en: string; url: string }[]; body: BatchRow[];
};
type Change = { entityType?: string; siteType?: string; parent?: string; related?: string[] };
type Batch = { topics: BatchTopic[]; updateExisting?: Record<string, Change> };
export type Plan = { create: string[]; update: string[]; relink: string[]; missingReferences: string[] };

/** Plain-text fallback kept alongside rich content: links become their labels, so any reader of `text` stays valid. */
const plain = (paragraphs: string[]) => paragraphs.map(value => value.replace(INTERNAL_LINK, (_match, _route, label: string) => label)).join('\n\n');

export async function applyStructureBatches(payload: Payload, user: NonNullable<PayloadRequest['user']>, files: string[], options: { apply: boolean; log: (line: string) => void }): Promise<Plan> {
  const as = { user, overrideAccess: false, depth: 0 } as const;
  const batches = await Promise.all(files.map(async file => JSON.parse(await readFile(file, 'utf8')) as Batch));
  const topics = batches.flatMap(item => item.topics);
  const updateExisting: Record<string, Change> = Object.assign({}, ...batches.map(item => item.updateExisting ?? {}));
  const approve = { reviewStatus: 'approved', _status: 'published' } as const;

  // Resolve every route the batches touch to existing IDs (per language).
  const ids = new Map<string, Record<Locale, number>>();
  const referenced = new Set<string>([
    ...topics.flatMap(topic => [`${topic.section}/${topic.slug}`, ...(topic.parent ? [topic.parent] : []), ...(topic.related ?? []), ...linkRoutes(topic.body.flatMap(row => [...row.ar.paragraphs, ...row.en.paragraphs]))]),
    ...Object.entries(updateExisting).flatMap(([route, change]) => [route, ...(change.parent ? [change.parent] : []), ...(change.related ?? [])]),
  ]);
  for (const route of referenced) {
    const [section, slug] = route.split('/');
    const { docs } = await payload.find({ collection: 'articles', ...as, limit: 3, where: { and: [{ section: { equals: section } }, { slug: { equals: slug } }] } });
    const ar = (docs as Doc[]).find(doc => doc.locale === 'ar'); const en = (docs as Doc[]).find(doc => doc.locale === 'en');
    if (ar && en) ids.set(route, { ar: ar.id, en: en.id });
  }
  // Topics are matched by translation key (a slug may be reused elsewhere only with the same key).
  const plan: Plan = { create: [], update: [], relink: Object.keys(updateExisting), missingReferences: [] };
  for (const topic of topics) {
    const route = `${topic.section}/${topic.slug}`;
    const { docs } = await payload.find({ collection: 'articles', ...as, limit: 3, where: { translationKey: { equals: topic.translationKey } } });
    const ar = (docs as Doc[]).find(doc => doc.locale === 'ar'); const en = (docs as Doc[]).find(doc => doc.locale === 'en');
    if (ar && en) { ids.set(route, { ar: ar.id, en: en.id }); plan.update.push(route); }
    else if (ar || en) throw new Error(`Only one language exists for ${topic.translationKey}; fix it in the admin panel first.`);
    else if (!topic.ar || !topic.en) throw new Error(`${route} is marked as existing but was not found.`);
    else plan.create.push(route);
  }
  const willExist = new Set([...ids.keys(), ...plan.create]);
  plan.missingReferences = [...referenced].filter(route => !willExist.has(route));
  for (const route of plan.relink) if (!ids.has(route)) plan.missingReferences.push(route);
  if (!options.apply) return plan;
  if (plan.missingReferences.length) throw new Error(`Unresolved references: ${plan.missingReferences.join(', ')}`);

  // Pass 1: create missing topics (published, plain text) so every link target exists.
  for (const topic of topics) {
    const route = `${topic.section}/${topic.slug}`;
    if (ids.has(route)) continue;
    const created: Partial<Record<Locale, number>> = {};
    for (const locale of locales) {
      const text = topic[locale]!;
      const doc = await payload.create({ collection: 'articles', ...as, data: {
        title: text.title, locale, translationKey: topic.translationKey, section: topic.section, slug: topic.slug, summary: text.summary, category: text.category,
        ...(topic.period ? { period: topic.period } : {}), ...(topic.kind ? { kind: topic.kind } : {}),
        facts: (topic.facts ?? []).map(fact => ({ label: fact[locale][0], value: fact[locale][1] })), sources: topic.sources.map(source => ({ title: source[locale], url: source.url })),
        body: topic.body.map(row => ({ heading: row[locale].heading, text: plain(row[locale].paragraphs) })), noIndex: false, ...approve,
      } as never }) as Doc;
      created[locale] = doc.id;
    }
    ids.set(route, created as Record<Locale, number>);
    options.log(`created ${route}`);
  }
  const relationIDs = (routes: string[] | undefined, locale: Locale) => (routes ?? []).map(route => ids.get(route)?.[locale]).filter((id): id is number => Boolean(id));
  // Pass 2: rich content with resolved internal links, hierarchy and relations; re-approved in the same write.
  for (const topic of topics) {
    const route = `${topic.section}/${topic.slug}`;
    for (const locale of locales) {
      await payload.update({ collection: 'articles', id: ids.get(route)![locale], ...as, data: {
        ...(topic.entityType ? { entityType: topic.entityType } : {}), ...(topic.siteType ? { siteType: topic.siteType } : {}),
        ...(topic.parent ? { parent: ids.get(topic.parent)![locale] } : {}), related: relationIDs(topic.related, locale),
        body: topic.body.map(row => ({ heading: row[locale].heading, role: row.role ?? null, text: plain(row[locale].paragraphs), content: paragraphsToLexical(row[locale].paragraphs, locale, value => ids.get(value)?.[locale]) })),
        sources: topic.sources.map(source => ({ title: source[locale], url: source.url })), ...approve,
      } as never });
    }
    options.log(`structured ${route}`);
  }
  // Pass 3: structure on existing articles that are otherwise unchanged; existing relations are kept.
  for (const [route, change] of Object.entries(updateExisting)) {
    for (const locale of locales) {
      const id = ids.get(route)![locale];
      const current = await payload.findByID({ collection: 'articles', id, ...as }) as Doc;
      const kept = Array.isArray(current.related) ? current.related.filter((value): value is number => typeof value === 'number') : [];
      await payload.update({ collection: 'articles', id, ...as, data: {
        ...(change.entityType ? { entityType: change.entityType } : {}), ...(change.siteType ? { siteType: change.siteType } : {}),
        ...(change.parent ? { parent: ids.get(change.parent)![locale] } : {}), ...(change.related ? { related: [...new Set([...kept, ...relationIDs(change.related, locale)])] } : {}), ...approve,
      } as never });
    }
    options.log(`linked ${route}`);
  }
  return plan;
}
