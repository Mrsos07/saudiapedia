import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleTools } from '@/components/article-tools';
import { ArticleText, EntryCard, PhotoCredit, SectionHeading } from '@/components/encyclopedia';
import { getContent } from '@/lib/content';
import { articleMetadata } from '@/lib/article-metadata';
import { isLocale, resolveSectionLabel, type Section } from '@/lib/encyclopedia';
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
  const jsonLd = {
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Article', headline: entry.title[locale], description: entry.summary[locale], inLanguage: locale, mainEntityOfPage: `${siteUrl}/${locale}/${section}/${slug}`, isPartOf: { '@type': 'WebSite', name: brand[locale], url: `${siteUrl}/${locale}` } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: brand[locale], item: `${siteUrl}/${locale}` },
        { '@type': 'ListItem', position: 2, name: sectionName, item: `${siteUrl}/${locale}/${listingSection}` },
        { '@type': 'ListItem', position: 3, name: entry.title[locale], item: `${siteUrl}/${locale}/${section}/${slug}` },
      ] },
    ],
  };
  return <main id="main-content">
    {!preview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />}
    <div className="page-hero"><div className="container article-header"><nav className="breadcrumbs" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}><Link href={`/${locale}`}>{ar ? 'الرئيسية' : 'Home'}</Link><span>/</span><Link href={`/${locale}/${listingSection}`}>{sectionName}</Link><span>/</span><span>{entry.title[locale]}</span></nav><p className="eyebrow">{entry.category[locale]}</p><h1 className="page-heading">{entry.title[locale]}</h1><p className="page-intro">{entry.summary[locale]}</p><div className="article-meta">{entry.period && <span dir="ltr">{entry.period}</span>}<span className="status-pill">{preview ? (ar ? 'مقدمة قيد المراجعة' : 'Editorial preview') : (ar ? 'محتوى معتمد للنشر' : 'Approved for publication')}</span><span>{ar ? 'متاح بالعربية والإنجليزية' : 'Available in Arabic and English'}</span></div></div></div>
    <div className="container section article-shell"><aside className="article-aside"><nav className="toc" aria-label={ar ? 'في هذا المقال' : 'On this page'}><h2>{ar ? 'في هذا المقال' : 'On this page'}</h2>{entry.body.map((part, index) => <a href={`#section-${index}`} key={index}>{part.heading[locale]}</a>)}<a href="#sources">{ar ? 'المصادر والمراجع' : 'Sources & references'}</a></nav>{entry.facts.length > 0 && <div className="facts-box"><h2>{ar ? 'لمحة سريعة' : 'At a glance'}</h2><dl>{entry.facts.map((fact, i) => <div key={i}><dt>{fact.label[locale]}</dt><dd>{fact.value[locale]}</dd></div>)}</dl></div>}</aside>
    <article className="article-main">{preview && <div className="preview-notice"><strong>{ar ? 'تنبيه تحريري' : 'Editorial notice'}</strong><p>{ar ? 'هذه مقدمة تجريبية غير معتمدة. تتطلب استكمال التوثيق ومراجعة الحقائق والترجمة قبل النشر العام.' : 'This is an unapproved introductory preview. Sources, facts and translation require editorial review before public release.'}</p></div>}
    <figure><div className={`article-cover${entry.kind === 'ruler' ? ' portrait-cover' : ''}`}><Image src={entry.image} alt={entry.imageAlt[locale]} fill sizes="(max-width: 800px) 100vw, 75vw" unoptimized={entry.image.startsWith('/api/')} /></div><figcaption className="article-caption"><PhotoCredit image={entry.image} locale={locale} credit={entry.imageCredit} />{entry.imageCredit && <span>{entry.imageAlt[locale]}</span>}{preview && !entry.imageCredit && <span>{ar ? 'صورة سياقية؛ لا توثّق بالضرورة الشخص أو الموقع المذكور في المقال.' : 'Contextual image; not necessarily a depiction of the person or location discussed.'}</span>}</figcaption></figure>
    <div className="article-content">{entry.body.map((part, index) => <section className="article-section" id={`section-${index}`} key={index}><h2>{part.heading[locale]}</h2><ArticleText text={part.text[locale]} sourceCount={entry.sources.length} locale={locale} /></section>)}<section id="sources" className="article-section"><h2>{ar ? 'المصادر والمراجع' : 'Sources & references'}</h2>{entry.sources.length ? <ol className="source-list">{entry.sources.map((source, index) => <li key={index} id={`source-${index + 1}`}><a href={source.url} target="_blank" rel="noreferrer">{source.title[locale]}</a></li>)}</ol> : <p className="preview-notice">{ar ? 'لم تُستكمل إحالات هذه المقدمة بعد. لا تُعامل المعلومات الواردة فيها كمادة موسوعية مراجعة.' : 'References for this introduction are not yet complete. Do not treat it as reviewed encyclopedic material.'}</p>}</section></div><ArticleTools title={entry.title[locale]} locale={locale} /></article></div>
    <section className="container section related-section"><SectionHeading locale={locale} eyebrow={ar ? 'أكمل رحلتك' : 'CONTINUE YOUR JOURNEY'} title={ar ? 'موضوعات ذات صلة' : 'Related stories'} href={`/${locale}/${listingSection}`} /><div className="card-grid">{entries.filter(e => e.section === section && e.slug !== slug).slice(0, 3).map(related => <EntryCard entry={related} locale={locale} key={related.slug} />)}</div></section>
  </main>;
}