import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicImage } from '@/components/public-image';
import { JsonLd } from '@/components/json-ld';
import { organization, website } from '@/lib/structured-data';
import { Arrow, EntryCard, PhotoCredit, RegionExplorer, SearchForm, SectionHeading } from '@/components/encyclopedia';
import { getContent } from '@/lib/content';
import { entryPath, isLocale, matchesSection, saudiStateHistory, seedSectionLabels } from '@/lib/encyclopedia';
import { brand, intro, navigation, pageMetadata, publicNavigation } from '@/lib/site';
import { getSections } from '@/lib/sections';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { preview } = await getContent();
  return pageMetadata(locale, brand[locale], intro[locale], '', preview);
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === 'ar';
  const { entries, preview } = await getContent();
  const { sections } = await getSections();
  const additionalSections = publicNavigation(sections).filter(item => !navigation.some(core => core.path === item.path));
  const history = saudiStateHistory(entries);
  const heritage = entries.filter(e => e.section === 'heritage').slice(0, 3);
  const featuredKings = entries.filter(entry => entry.kind === 'ruler');
  return <main id="main-content">
    {!preview && <JsonLd graph={[organization(), website(locale)]} />}
    <section className="hero" aria-labelledby="hero-title">
      <Image src="/images/desert.jpg" alt={ar ? 'وادي العلا وجروفه الصحراوية الصخرية' : 'AlUla valley and sandstone escarpments'} fill priority sizes="100vw" />
      <div className="hero-shade" />
      <div className="container hero-content"><h1 id="hero-title" className="hero-title">{ar ? 'موسوعة السعودية' : 'Saudi Encyclopedia'}</h1><p className="hero-description">{intro[locale]}</p><a href="#explore" className="button">{ar ? 'تصفح الأقسام' : 'Browse sections'} <Arrow locale={locale} /></a></div>
      <div className="container hero-bottom"><PhotoCredit image="/images/desert.jpg" locale={locale} /></div>
    </section>
    <div className="container hero-search"><SearchForm locale={locale} /><div className="popular-searches"><span>{ar ? 'أقسام رئيسة:' : 'Main sections:'}</span>{[{ path: 'history', ar: 'الدول السعودية', en: 'Saudi states' }, { path: 'regions', ar: 'مناطق المملكة', en: 'The regions' }, { path: 'heritage', ar: 'المواقع التراثية', en: 'Heritage sites' }].map(item => <Link key={item.path} href={`/${locale}/${item.path}`}>{item[locale]}</Link>)}</div></div>
    <nav id="explore" className="container discovery-strip" aria-label={ar ? 'أقسام الموسوعة' : 'Encyclopedia sections'}>{[
      { path: 'history', ar: 'التاريخ', en: 'History', descAr: 'الدول السعودية الأولى والثانية والثالثة', descEn: 'The first, second and third Saudi states' },
      { path: 'regions', ar: 'المناطق', en: 'Regions', descAr: 'المناطق الإدارية الثلاث عشرة ومحافظاتها', descEn: 'The thirteen administrative regions and their governorates' },
      { path: 'notable-figures', ...seedSectionLabels.people, descAr: 'الملوك والأئمة وشخصيات بارزة', descEn: 'Kings, imams and notable people' },
      { path: 'heritage', ar: 'التراث', en: 'Heritage', descAr: 'المواقع التراثية والعادات والفنون', descEn: 'Heritage sites, customs and traditional arts' },
    ].map((item, index) => <Link key={item.path} href={`/${locale}/${item.path}`}><span className="discovery-number">0{index + 1}</span><span className="discovery-copy"><strong>{item[locale]}</strong><small>{ar ? item.descAr : item.descEn}</small></span><Arrow locale={locale} /></Link>)}</nav>
    {additionalSections.length > 0 && <section id="more-sections" className="container section"><SectionHeading locale={locale} title={ar ? 'أقسام أخرى' : 'Other sections'} /><div className="card-grid">{additionalSections.map(item => <article className="credit-card" key={item.path}><div className="card-body"><h3><Link href={`/${locale}/${item.path}`}>{item[locale]}</Link></h3><p>{entries.filter(entry => matchesSection(entry, item.path)).length.toLocaleString(locale)} {ar ? 'موضوعًا متاحًا' : 'topics available'}</p><Link className="text-link" href={`/${locale}/${item.path}`}>{ar ? 'استكشف القسم' : 'Explore section'} <Arrow locale={locale} /></Link></div></article>)}</div></section>}
    <section id="saudi-history" className="history-section"><div className="container section"><SectionHeading locale={locale} title={ar ? 'تاريخ الدول السعودية' : 'History of the Saudi States'} text={ar ? 'مقالات عن الدولة السعودية الأولى والثانية والثالثة وتوحيد المملكة العربية السعودية.' : 'Articles on the First, Second and Third Saudi States and the unification of Saudi Arabia.'} href={`/${locale}/history`} action={ar ? 'جميع مقالات التاريخ' : 'All history articles'} /><div className="history-grid">{history.map((entry, index) => <div key={entry.slug}><div className="timeline-date"><span dir="ltr">{entry.period}</span><span className="timeline-line" /></div><EntryCard entry={entry} locale={locale} index={index} /></div>)}</div>{history.length === 0 && <p className="no-results">{ar ? 'ستظهر مقالات الدول السعودية الأولى والثانية والثالثة هنا بعد اعتمادها باللغتين في لوحة التحرير.' : 'Articles about the First, Second and Third Saudi States appear here once approved in both languages.'}</p>}</div></section>
    <section className="container section region-section"><RegionExplorer entries={entries} locale={locale} /></section>
    <section className="feature-section"><div className="container feature-inner"><div className="feature-image"><Image src="/images/diriyah.jpg" alt={ar ? 'العمارة الطينية في الدرعية' : 'Earthen architecture in Diriyah'} fill sizes="(max-width: 800px) 100vw, 50vw" /><PhotoCredit image="/images/diriyah.jpg" locale={locale} /></div><div className="feature-copy"><h2>{ar ? 'الدرعية' : 'Diriyah'}</h2><p>{ar ? 'عاصمة الدولة السعودية الأولى على ضفاف وادي حنيفة، وفيها حي الطريف المسجل في قائمة التراث العالمي لليونسكو.' : 'Capital of the First Saudi State on the banks of Wadi Hanifah, and home to At-Turaif, a UNESCO World Heritage site.'}</p><Link className="text-link" href={entries.some(entry => entry.section === 'regions' && entry.slug === 'diriyah-governorate') ? `/${locale}/regions/diriyah-governorate` : `/${locale}/history`}>{ar ? 'اقرأ عن الدرعية' : 'Read about Diriyah'} <Arrow locale={locale} /></Link></div></div></section>
    <section className="container section"><SectionHeading locale={locale} title={seedSectionLabels.people[locale]} text={ar ? 'سير ملوك المملكة العربية السعودية وفترات حكمهم.' : 'Biographies of the kings of Saudi Arabia and their reigns.'} href={`/${locale}/notable-figures`} action={ar ? 'جميع الشخصيات البارزة' : 'All notable figures'} /><div className="people-grid">{featuredKings.map((entry, index) => <article className="person-card" key={`${entry.section}/${entry.slug}`}><span className="person-number">0{index + 1}</span><span className="person-period">{entry.period}</span>{entry.kind === 'ruler' && <><div className="person-portrait"><PublicImage src={entry.image} alt={entry.imageAlt[locale]} fill sizes="(max-width: 640px) 80vw, (max-width: 900px) 40vw, 22vw" /></div><PhotoCredit image={entry.image} locale={locale} credit={entry.imageCredit} /></>}<h3><Link href={entryPath(entry, locale)}>{entry.title[locale]}</Link></h3><p>{entry.summary[locale]}</p><Link className="text-link" href={entryPath(entry, locale)}>{ar ? 'اقرأ السيرة' : 'Read biography'} <Arrow locale={locale} /></Link></article>)}</div>{!featuredKings.length && <p className="no-results">{ar ? 'ستظهر سير الملوك هنا بعد اعتمادها باللغتين في لوحة التحرير.' : 'Royal biographies appear here once approved in both languages.'}</p>}</section>
    <section className="history-section"><div className="container section"><SectionHeading locale={locale} title={ar ? 'التراث' : 'Heritage'} href={`/${locale}/heritage`} action={ar ? 'جميع مقالات التراث' : 'All heritage articles'} /><div className="heritage-grid">{heritage.map(entry => <EntryCard entry={entry} locale={locale} key={entry.slug} />)}</div></div></section>
    {preview && <div className="container editorial-note"><strong>{ar ? 'نسخة تطويرية · محتوى قيد المراجعة' : 'Development preview · editorial review pending'}</strong><p>{ar ? 'المقدمات المعروضة للتصفح الأولي وليست مقالات معتمدة للنشر. الموسوعة المستهدفة أوسع من هذه النسخة.' : 'These introductions are for initial exploration, not publication-approved articles. The planned encyclopedia extends beyond this preview.'} <Link href={`/${locale}/editorial-policy`}>{ar ? 'تعرّف على سياسة التحرير' : 'Read our editorial policy'}</Link></p></div>}
  </main>;
}