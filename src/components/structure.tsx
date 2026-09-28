import Link from 'next/link';
import { entryPath, type Entry, type Locale } from '../lib/encyclopedia';
import { regionStatistics } from '../lib/region-facts';
import type { AutoKind } from '../lib/structure';
import { Arrow } from './encyclopedia';

const siteLabels = {
  historical: { ar: 'تاريخي', en: 'Historic' }, religious: { ar: 'ديني', en: 'Religious' }, tourism: { ar: 'سياحي', en: 'Tourism' },
  nature: { ar: 'طبيعي', en: 'Nature' }, museum: { ar: 'متحف', en: 'Museum' },
} as const;
const typeLabels = {
  region: { ar: 'منطقة', en: 'Region' }, governorate: { ar: 'محافظة', en: 'Governorate' }, city: { ar: 'مدينة', en: 'City' }, site: { ar: 'موقع', en: 'Site' },
  person: { ar: 'شخصية', en: 'Person' }, event: { ar: 'حدث', en: 'Event' }, topic: { ar: 'موضوع', en: 'Topic' },
} as const;

function badge(entry: Entry, locale: Locale) {
  if (entry.siteType) return siteLabels[entry.siteType][locale];
  if (entry.entityType) return typeLabels[entry.entityType][locale];
  return entry.category[locale];
}

/** Compact linked list of child or related articles, used inside hub sections. */
export function EntityList({ entries, locale, kind }: { entries: Entry[]; locale: Locale; kind: AutoKind }) {
  return <ul className={`entity-list entity-list-${kind}`}>{entries.map(entry => <li key={entry.key ?? entry.slug}>
    <Link href={entryPath(entry, locale)}><span className="entity-badge">{badge(entry, locale)}</span><strong>{entry.title[locale]}</strong><span className="entity-summary">{entry.summary[locale]}</span><Arrow locale={locale} /></Link>
  </li>)}</ul>;
}

/** Wikipedia-style navigation box at the foot of an article. */
export function NavBox({ title, entries, current, locale }: { title: string; entries: Entry[]; current?: Entry; locale: Locale }) {
  if (entries.length < 2) return null;
  return <nav className="nav-box" aria-label={title}><h2>{title}</h2><ul>{entries.map(entry => <li key={entry.key ?? entry.slug}>
    {entry === current ? <span aria-current="page">{entry.title[locale]}</span> : <Link href={entryPath(entry, locale)}>{entry.title[locale]}</Link>}
  </li>)}</ul></nav>;
}

/** Authored facts plus sourced region statistics (2022 census) and live structure counts. */
export function Infobox({ entry, locale, places, parent }: { entry: Entry; locale: Locale; places: number; parent?: Entry }) {
  const ar = locale === 'ar';
  const stats = entry.entityType === 'region' || (!entry.entityType && entry.section === 'regions') ? regionStatistics(entry.slug) : null;
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (parent) rows.push({ label: ar ? 'يتبع' : 'Part of', value: <Link href={entryPath(parent, locale)}>{parent.title[locale]}</Link> });
  if (stats) {
    rows.push({ label: ar ? 'المقر الإداري' : 'Regional seat', value: stats.seat[locale] });
    rows.push({ label: ar ? 'عدد السكان (تعداد 2022)' : 'Population (2022 census)', value: stats.population.toLocaleString(locale) });
    rows.push({ label: ar ? 'الترتيب سكانيًا' : 'Population rank', value: ar ? `${stats.rank.toLocaleString(locale)} من ١٣` : `${stats.rank} of 13` });
  }
  if (places) rows.push({ label: ar ? 'محافظات ومدن في الموسوعة' : 'Governorates and cities covered', value: places.toLocaleString(locale) });
  // Sourced statistics replace an authored fact with the same meaning (e.g. the seat) instead of repeating it.
  const computed = new Set(stats ? ['المقر الإداري', 'Administrative seat', 'Regional seat', 'المنطقة', 'Region'] : parent ? ['المنطقة', 'Region'] : []);
  for (const fact of entry.facts) if (!computed.has(fact.label[locale].trim())) rows.push({ label: fact.label[locale], value: fact.value[locale] });
  if (!rows.length) return null;
  return <div className="facts-box infobox"><h2>{ar ? 'لمحة سريعة' : 'At a glance'}</h2><dl>{rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></div>;
}
