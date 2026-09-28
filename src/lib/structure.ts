import type { Entry, Localized } from './encyclopedia';

const MAX_DEPTH = 6;
type BodyRole = NonNullable<Entry['body'][number]['role']>;

export function keyed(entries: Entry[]): Map<string, Entry> {
  return new Map(entries.filter(entry => entry.key).map(entry => [entry.key!, entry]));
}

/** Root-first chain of published ancestors; stops at missing links and cycles. */
export function ancestors(entry: Entry, entries: Entry[]): Entry[] {
  const index = keyed(entries);
  const chain: Entry[] = [];
  const seen = new Set(entry.key ? [entry.key] : []);
  for (let key = entry.parentKey; key && chain.length < MAX_DEPTH && !seen.has(key); key = index.get(key)?.parentKey) {
    const parent = index.get(key);
    if (!parent) break;
    seen.add(key);
    chain.unshift(parent);
  }
  return chain;
}

export function children(entry: Entry, entries: Entry[]): Entry[] {
  return entry.key ? entries.filter(item => item.parentKey === entry.key) : [];
}

/** All published descendants, breadth-first, without repeats. */
export function descendants(entry: Entry, entries: Entry[]): Entry[] {
  const out: Entry[] = [];
  const seen = new Set(entry.key ? [entry.key] : []);
  let level = children(entry, entries);
  for (let depth = 0; level.length && depth < MAX_DEPTH; depth += 1) {
    const next: Entry[] = [];
    for (const item of level) {
      if (!item.key || seen.has(item.key)) continue;
      seen.add(item.key);
      out.push(item);
      next.push(...children(item, entries));
    }
    level = next;
  }
  return out;
}

export function siblings(entry: Entry, entries: Entry[]): Entry[] {
  return entry.parentKey ? entries.filter(item => item.parentKey === entry.parentKey) : [];
}

/** Explicit links in either direction, excluding the hierarchy itself. */
export function relatedEntries(entry: Entry, entries: Entry[]): Entry[] {
  if (!entry.key) return [];
  const index = keyed(entries);
  const keys = new Set(entry.relatedKeys ?? []);
  for (const item of entries) if (item.key && item.relatedKeys?.includes(entry.key)) keys.add(item.key);
  keys.delete(entry.key);
  return [...keys].map(key => index.get(key)).filter((item): item is Entry => Boolean(item));
}

export const isPerson = (entry: Entry) => entry.entityType === 'person' || Boolean(entry.kind);

export type AutoKind = 'places' | 'antiquities' | 'religious' | 'tourism' | 'people' | 'topics';
export type HubBlock = { id: string; heading: Localized; bodyIndex?: number; auto?: { kind: AutoKind; entries: Entry[] } };

const autoHeadings: Record<AutoKind, Localized> = {
  places: { ar: 'المحافظات والمدن', en: 'Governorates and cities' },
  antiquities: { ar: 'مواقع تاريخية ومتاحف', en: 'Historic sites and museums' },
  religious: { ar: 'أماكن دينية', en: 'Religious sites' },
  tourism: { ar: 'وجهات سياحية وطبيعية', en: 'Tourism and nature' },
  people: { ar: 'شخصيات مرتبطة', en: 'Related people' },
  topics: { ar: 'موضوعات مرتبطة', en: 'Related topics' },
};
/** Which authored section each automatic list follows; the first role present wins. */
const anchors: Record<AutoKind, BodyRole[]> = {
  places: ['administration', 'geography', 'overview'],
  antiquities: ['antiquities', 'history'],
  religious: ['religious', 'heritage'],
  tourism: ['tourism', 'nature'],
  people: ['history', 'culture'],
  topics: [],
};

/** Authored sections in order, with each non-empty automatic list after its matching section, or at the end. */
export function hubBlocks(entry: Entry, entries: Entry[]): HubBlock[] {
  const below = descendants(entry, entries);
  const related = relatedEntries(entry, entries).filter(item => !below.includes(item));
  const sites = below.filter(item => item.entityType === 'site');
  const lists: Record<AutoKind, Entry[]> = {
    places: children(entry, entries).filter(item => item.entityType === 'governorate' || item.entityType === 'city'),
    antiquities: sites.filter(item => item.siteType === 'historical' || item.siteType === 'museum' || !item.siteType),
    religious: sites.filter(item => item.siteType === 'religious'),
    tourism: [...sites.filter(item => item.siteType === 'tourism' || item.siteType === 'nature'), ...related.filter(item => item.entityType === 'site' && (item.siteType === 'tourism' || item.siteType === 'nature'))],
    people: [...below, ...related].filter(isPerson).filter((item, index, all) => all.indexOf(item) === index),
    topics: related.filter(item => !isPerson(item) && !(item.entityType === 'site' && (item.siteType === 'tourism' || item.siteType === 'nature'))),
  };
  const blocks: HubBlock[] = entry.body.map((part, index) => ({ id: `section-${index}`, heading: part.heading, bodyIndex: index }));
  const trailing: HubBlock[] = [];
  for (const kind of Object.keys(lists) as AutoKind[]) {
    if (!lists[kind].length) continue;
    const block: HubBlock = { id: `auto-${kind}`, heading: autoHeadings[kind], auto: { kind, entries: lists[kind] } };
    const role = anchors[kind].find(candidate => entry.body.some(part => part.role === candidate));
    if (!role) { trailing.push(block); continue; }
    let at = blocks.findLastIndex(item => item.bodyIndex !== undefined && entry.body[item.bodyIndex].role === role);
    while (blocks[at + 1]?.auto) at += 1; // keep lists anchored to the same section in their defined order
    blocks.splice(at + 1, 0, block);
  }
  return [...blocks, ...trailing];
}
