import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EntryCard } from '@/components/encyclopedia';
import { getContent } from '@/lib/content';
import { isLocale, matchesSection, searchEntries } from '@/lib/encyclopedia';
import { getSections } from '@/lib/sections';
import { pageMetadata, publicNavigation } from '@/lib/site';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string; section?: string; page?: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return pageMetadata(locale, locale === 'ar' ? 'البحث في الموسوعة' : 'Search the encyclopedia', locale === 'ar' ? 'ابحث عن الأماكن والشخصيات والتاريخ والتراث.' : 'Search places, people, history and heritage.', '/search', true);
}
export default async function Search({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === 'ar';
  const input = await searchParams;
  const query = typeof input.q === 'string' ? input.q.trim().slice(0, 120) : '';
  const { sections } = await getSections();
  const navigation = publicNavigation(sections);
  const requestedSection = ['people', 'rulers'].includes(input.section ?? '') ? 'notable-figures' : input.section;
  const section = navigation.find(item => item.path === requestedSection)?.path ?? '';
  const { entries, preview } = await getContent();
  const results = searchEntries(entries, query, locale).filter(e => !section || matchesSection(e, section));
  const pages = Math.ceil(results.length / 9);
  const page = Math.max(1, Math.min(pages || 1, Number.parseInt(input.page || '1', 10) || 1));
  return <main id="main-content"><section className="page-hero"><div className="container"><nav className="breadcrumbs" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}><Link href={`/${locale}`}>{ar ? 'الرئيسية' : 'Home'}</Link><span>/</span><span>{ar ? 'البحث' : 'Search'}</span></nav><p className="eyebrow">{ar ? 'كل حكاية تبدأ بسؤال' : 'EVERY STORY BEGINS WITH A QUESTION'}</p><h1 className="page-heading">{ar ? 'عمّ تبحث اليوم؟' : 'What will you discover today?'}</h1><form action={`/${locale}/search`} className="search-filters"><label htmlFor="query">{ar ? 'كلمة البحث' : 'Search term'}<input id="query" type="search" name="q" defaultValue={query} maxLength={120} placeholder={ar ? 'مثال: الرياض، الدرعية، عبدالعزيز' : 'Try Riyadh, Diriyah, Abdulaziz'} /></label><label htmlFor="section-filter">{ar ? 'القسم' : 'Section'}<select id="section-filter" name="section" defaultValue={section}><option value="">{ar ? 'جميع الأقسام' : 'All sections'}</option>{navigation.map(item => <option value={item.path} key={item.path}>{item[locale]}</option>)}</select></label><button className="button" type="submit">{ar ? 'بحث' : 'Search'}</button></form></div></section>
  <section className="container section">{preview && <p className="preview-notice">{ar ? 'البحث في المقدمات التجريبية قيد المراجعة.' : 'Searching introductory editorial previews.'}</p>}<div className="listing-toolbar"><h2>{query ? (ar ? `نتائج البحث عن «${query}»` : `Results for “${query}”`) : (ar ? 'استكشف الموضوعات' : 'Explore all topics')}</h2><span role="status">{results.length.toLocaleString(locale)} {ar ? 'نتيجة' : 'results'}</span></div><div className="card-grid">{results.slice((page - 1) * 9, page * 9).map(entry => <EntryCard entry={entry} locale={locale} key={`${entry.section}/${entry.slug}`} />)}</div>{!results.length && <div className="empty-state"><h2>{ar ? 'لم نعثر على نتائج' : 'No results found'}</h2><p>{ar ? 'جرّب كلمة أقصر أو اختر جميع الأقسام.' : 'Try a shorter term or select all sections.'}</p><Link className="button" href={`/${locale}/search`}>{ar ? 'عرض جميع الموضوعات' : 'Browse all topics'}</Link></div>}{pages > 1 && <nav className="pagination" aria-label={ar ? 'صفحات النتائج' : 'Result pages'}>{Array.from({ length: pages }, (_, index) => <Link aria-current={page === index + 1 ? 'page' : undefined} className={page === index + 1 ? 'active' : ''} key={index} href={`/${locale}/search?q=${encodeURIComponent(query)}&section=${section}&page=${index + 1}`}>{(index + 1).toLocaleString(locale)}</Link>)}</nav>}</section></main>;
}