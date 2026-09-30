import { matchesSection, type Entry, type Locale } from './encyclopedia';
import { keyed } from './structure';
import type { NavigationItem } from './site';

/** Entries listed on a section page: children appear inside their parent's hub unless the parent lives in another section. */
export function sectionListing(entries: Entry[], section: string): Entry[] {
  const index = keyed(entries);
  return entries.filter(entry => matchesSection(entry, section) && !(entry.parentKey && index.get(entry.parentKey)?.section === entry.section));
}

/** Subsection (category) labels of a listing. Notable figures opens on the rulers' category, listed first. */
export function sectionCategories(listing: Entry[], section: string, locale: Locale): { categories: string[]; defaultCategory: string } {
  const rulerCategory = section === 'notable-figures' ? listing.find(entry => entry.kind === 'ruler')?.category[locale] : undefined;
  const categories = [...new Set([...(rulerCategory ? [rulerCategory] : []), ...listing.map(entry => entry.category[locale])])];
  return { categories, defaultCategory: rulerCategory && categories.length > 1 ? rulerCategory : '' };
}

/** Header dropdowns mirror the section pages' filter tabs (shown only when a section has more than one). */
export function withSubsections(items: NavigationItem[], entries: Entry[], locale: Locale): NavigationItem[] {
  return items.map(item => {
    const { categories } = sectionCategories(sectionListing(entries, item.path), item.path, locale);
    return categories.length > 1 ? { ...item, subsections: categories } : item;
  });
}
