import { PublicImage } from '@/components/public-image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleTools } from '@/components/article-tools';
import { JsonLd } from '@/components/json-ld';
import { article, breadcrumbs, organization, website } from '@/lib/structured-data';
import { ArticleText, EntryCard, PhotoCredit, SectionHeading } from '@/components/encyclopedia';
import { getContent } from '@/lib/content';
import { articleMetadata, safeCanonicalURL } from '@/lib/article-metadata';
import { administrativeRegions, entryPath, isLocale, resolveSectionLabel, type Section } from '@/lib/encyclopedia';
import { Fragment } from 'react';
import { RichText } from '@/components/rich-text';
import { EntityList, Infobox, NavBox } from '@/components/structure';
import { ancestors, hubBlocks, siblings } from '@/lib/structure';
import { getSections, findSection } from '@/lib/sections';
import { siteUrl, brand } from '@/lib/site';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; section: string; slug: string }> };
async function articleData(params: Props['params']) {
  const { locale, section, slug } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getContent();
  const entry = content.entries.find(e => e.section === section && e.slug === slug);
  if (!entry) notFound();
  return { ...content, entry, locale, section: section as Section, slug };
}
async function sectionDisplayName(section: Section, locale: Props['params'] extends Promise<{ locale: infer L }> ? L : never) {
  const { sections } = await getSections();
  return resolveSectionLabel(section, locale as 'ar' | 'en', findSection(sections, section)?.name);
}
export async function generateMetadata({ params }: Props) {
  const { entry, locale } = await articleData(params);
  return articleMetadata(entry, locale);
}
export default async function Article({ params }: Props) {
  const { entry, locale, section, slug, entries } = await articleData(params);
  const ar = locale === 'ar';
  const preview = entry.status !== 'published';
  const sectionName = await sectionDisplayName(section, locale);
  const listingSection = ['people', 'rulers'].includes(section) ? 'notable-figures' : section;
  const url = safeCanonicalURL(entry.seo?.[locale]?.canonicalURL) ?? `${siteUrl}/${locale}/${section}/${slug}`;
  const chain = ancestors(entry, entries);
  const blocks = hubBlocks(entry, entries);
  const structured = blocks.some(block => block.auto) || chain.length > 0;
  const parent = chain.at(-1);
  const places = blocks.find(block => block.auto?.kind === 'places')?.auto?.entries.length ?? 0;
  const regionRoot = [...chain, entry].find(item => item.entityType === 'region' || (!item.entityType && item.section === 'regions' && administrativeRegions([item]).length));
  // In a hierarchy the trail follows the root's listing (e.g. Regions › Riyadh Region › Riyadh › Masmak).
  const rootSection = chain[0]?.section;
  const trailSection = rootSection ? (['people', 'rulers'].includes(rootSection) ? 'notable-figures' : rootSection) : listingSection;
  const trailName = rootSection && rootSection !== section ? await sectionDisplayName(rootSection, locale) : sectionName;
  const trail = [
    { name: brand[locale], path: `/${locale}` },
    { name: trailName, path: `/${locale}/${trailSection}` },
    ...chain.map(item => ({ name: item.title[locale], path: entryPath(item, locale) })),
    { name: entry.title[locale], path: `/${locale}/${section}/${slug}` },
  ];
  const graph = [organization(), website(locale), article(entry, locale, url), breadcrumbs(trail)];
  return <main id="main-content">
    {!preview && <JsonLd graph={graph} />}
    <div className="page-hero"><div className="container article-header"><nav className="breadcrumbs" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>{trail.slice(0, -1).map(item => <Fragment key={item.path}><Link href={item.path}>{item.name}</Link><span>/</span></Fragment>)}<span>{entry.title[locale]}</span></nav><p className="eyebrow">{entry.category[locale]}</p><h1 className="page-heading">{entry.title[locale]}</h1><p className="page-intro">{entry.summary[locale]}</p><div className="article-meta">{entry.period && <span dir="ltr">{entry.period}</span>}<span className="status-pill">{preview ? (ar ? 'مقدمة قيد المراجعة' : 'Editorial preview') : (ar ? 'محتوى معتمد للنشر' : 'Approved for publication')}</span><span>{ar ? 'متاح بالعربية والإنجليزية' : 'Available in Arabic and English'}</span></div></div></div>
    <div className="container section article-shell"><aside className="article-aside"><nav className="toc" aria-label={ar ? 'في هذا المقال' : 'On this page'}><h2>{ar ? 'في هذا المقال' : 'On this page'}</h2>{blocks.map(block => <a href={`#${block.id}`} key={block.id} className={block.auto ? 'toc-auto' : undefined}>{block.heading[locale]}</a>)}<a href="#sources">{ar ? 'المصادر والمراجع' : 'Sources & references'}</a></nav><Infobox entry={entry} locale={locale} places={places} parent={parent} /></aside>
    <article className="article-main">{preview && <div className="preview-notice"><strong>{ar ? 'تنبيه تحريري' : 'Editorial notice'}</strong><p>{ar ? 'هذه مقدمة تجريبية غير معتمدة. تتطلب استكمال التوثيق ومراجعة الحقائق والترجمة قبل النشر العام.' : 'This is an unapproved introductory preview. Sources, facts and translation require editorial review before public release.'}</p></div>}
    <figure><div className={`article-cover${entry.kind === 'ruler' ? ' portrait-cover' : ''}`}><PublicImage src={entry.image} alt={entry.imageAlt[locale]} fill loading="eager" fetchPriority="high" sizes="(max-width: 800px) 100vw, 75vw" /></div><figcaption className="article-caption"><PhotoCredit image={entry.image} locale={locale} credit={entry.imageCredit} />{entry.imageCredit && <span>{entry.imageAlt[locale]}</span>}{preview && !entry.imageCredit && <span>{ar ? 'صورة سياقية؛ لا توثّق بالضرورة الشخص أو الموقع المذكور في المقال.' : 'Contextual image; not necessarily a depiction of the person or location discussed.'}</span>}</figcaption></figure>
    <div className="article-content">{blocks.map(block => {
      const part = block.bodyIndex !== undefined ? entry.body[block.bodyIndex] : undefined;
      const rich = part?.content?.[locale];
      return <section className={`article-section${block.auto ? ' article-section-auto' : ''}`} id={block.id} key={block.id}><h2>{block.heading[locale]}</h2>
        {part && (rich ? <div className="rich-text"><RichText nodes={rich} locale={locale} sourceCount={entry.sources.length} /></div> : <ArticleText text={part.text[locale]} sourceCount={entry.sources.length} locale={locale} />)}
        {block.auto && <EntityList entries={block.auto.entries} locale={locale} kind={block.auto.kind} />}
      </section>;
    })}{regionRoot && <NavBox title={ar ? 'مناطق المملكة العربية السعودية' : 'Regions of Saudi Arabia'} entries={administrativeRegions(entries)} current={entry} locale={locale} />}{parent && <NavBox title={ar ? `ضمن ${parent.title[locale]}` : `Within ${parent.title[locale]}`} entries={siblings(entry, entries)} current={entry} locale={locale} />}<section id="sources" className="article-section"><h2>{ar ? 'المصادر والمراجع' : 'Sources & references'}</h2>{entry.sources.length ? <ol className="source-list">{entry.sources.map((source, index) => <li key={index} id={`source-${index + 1}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title[locale]}</a></li>)}</ol> : <p className="preview-notice">{ar ? 'لم تُستكمل إحالات هذه المقدمة بعد. لا تُعامل المعلومات الواردة فيها كمادة موسوعية مراجعة.' : 'References for this introduction are not yet complete. Do not treat it as reviewed encyclopedic material.'}</p>}</section></div><ArticleTools title={entry.title[locale]} locale={locale} /></article></div>
    {!structured && <section className="container section related-section"><SectionHeading locale={locale} title={ar ? 'موضوعات ذات صلة' : 'Related topics'} href={`/${locale}/${listingSection}`} /><div className="card-grid">{entries.filter(e => e.section === section && e.slug !== slug).slice(0, 3).map(related => <EntryCard entry={related} locale={locale} key={related.slug} />)}</div></section>}
  </main>;
}