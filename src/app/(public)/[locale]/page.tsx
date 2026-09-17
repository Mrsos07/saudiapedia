import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    <section className="hero" aria-labelledby="hero-title">
      <Image src="/images/desert.jpg" alt={ar ? 'وادي العلا وجروفه الصحراوية الصخرية' : 'AlUla valley and sandstone escarpments'} fill priority sizes="100vw" />
      <div className="hero-shade" />
      <div className="container hero-content"><p className="hero-kicker">{ar ? 'المملكة العربية السعودية · أرضٌ تختصر عوالم' : 'SAUDI ARABIA · A WORLD WITHIN A LAND'}</p><h1 id="hero-title" className="hero-title">{ar ? <>تاريخٌ يُروى،<br />ووطنٌ <em>يُكتشف.</em></> : <>A history to tell.<br />A land to <em>discover.</em></>}</h1><p className="hero-description">{intro[locale]} {ar ? 'رحلة معرفية، تبدأ من هنا.' : 'Your journey of discovery starts here.'}</p><a href="#explore" className="button">{ar ? 'ابدأ رحلتك' : 'Begin your journey'} <Arrow locale={locale} /></a></div>
      <div className="container hero-bottom"><span>{ar ? 'العلا · حيث يلتقي التاريخ بالطبيعة' : 'ALULA · WHERE HISTORY MEETS NATURE'}</span><PhotoCredit image="/images/desert.jpg" locale={locale} /></div>
    </section>
    <div className="container hero-search"><SearchForm locale={locale} /><div className="popular-searches"><span>{ar ? 'مسارات مقترحة:' : 'Start exploring:'}</span>{[{ path: 'history', ar: 'الدول السعودية', en: 'Saudi states' }, { path: 'regions', ar: 'مناطق المملكة', en: 'The regions' }, { path: 'heritage', ar: 'المواقع التراثية', en: 'Heritage sites' }].map(item => <Link key={item.path} href={`/${locale}/${item.path}`}>{item[locale]}</Link>)}</div></div>
    <nav id="explore" className="container discovery-strip" aria-label={ar ? 'مسارات المعرفة' : 'Discovery paths'}>{[
      { path: 'history', ar: 'تاريخ السعودية', en: 'Saudi history', descAr: 'الأولى والثانية والثالثة', descEn: 'The first, second and third states' },
      { path: 'regions', ar: 'تنوّع المكان', en: 'A diversity of place', descAr: 'مناطق تزخر بالحكايات', descEn: 'Regions filled with stories' },
      { path: 'notable-figures', ...seedSectionLabels.people, descAr: 'حكّام وشخصيات تركوا بصمتهم', descEn: 'Rulers and people who left a mark' },
      { path: 'heritage', ar: 'إرثٌ حي', en: 'A living heritage', descAr: 'جذور تمتد إلى الغد', descEn: 'Roots reaching into tomorrow' },
    ].map((item, index) => <Link key={item.path} href={`/${locale}/${item.path}`}><span className="discovery-number">0{index + 1}</span><span className="discovery-copy"><strong>{item[locale]}</strong><small>{ar ? item.descAr : item.descEn}</small></span><Arrow locale={locale} /></Link>)}</nav>
    {additionalSections.length > 0 && <section id="more-sections" className="container section"><SectionHeading locale={locale} eyebrow={ar ? 'آفاق معرفية' : 'MORE TO DISCOVER'} title={ar ? 'استكشف أقسامًا جديدة' : 'Explore more sections'} /><div className="card-grid">{additionalSections.map(item => <article className="credit-card" key={item.path}><div className="card-body"><h3><Link href={`/${locale}/${item.path}`}>{item[locale]}</Link></h3><p>{entries.filter(entry => matchesSection(entry, item.path)).length.toLocaleString(locale)} {ar ? 'موضوعًا متاحًا' : 'topics available'}</p><Link className="text-link" href={`/${locale}/${item.path}`}>{ar ? 'استكشف القسم' : 'Explore section'} <Arrow locale={locale} /></Link></div></article>)}</div></section>}
    <section id="saudi-history" className="history-section"><div className="container section"><SectionHeading locale={locale} eyebrow={ar ? 'ثلاث دول، ومسيرة وطن' : 'THREE STATES, ONE NATIONAL JOURNEY'} title={ar ? 'تاريخ الدول السعودية' : 'History of the Saudi States'} text={ar ? 'اكتشف تاريخ الدولة السعودية الأولى، ثم الثانية، وصولًا إلى الدولة السعودية الثالثة والمملكة العربية السعودية.' : 'Explore the history of the First Saudi State, then the Second, through to the Third Saudi State and the Kingdom of Saudi Arabia.'} href={`/${locale}/history`} action={ar ? 'التاريخ كاملًا' : 'Explore history'} /><div className="history-grid">{history.map((entry, index) => <div key={entry.slug}><div className="timeline-date"><span dir="ltr">{entry.period}</span><span className="timeline-line" /></div><EntryCard entry={entry} locale={locale} index={index} /></div>)}</div>{history.length === 0 && <p className="no-results">{ar ? 'ستظهر مقالات الدول السعودية الأولى والثانية والثالثة هنا بعد اعتمادها باللغتين في لوحة التحرير.' : 'Articles about the First, Second and Third Saudi States appear here once approved in both languages.'}</p>}</div></section>
    <section className="container section region-section"><RegionExplorer entries={entries} locale={locale} /></section>
    <section className="feature-section"><div className="container feature-inner"><div className="feature-image"><Image src="/images/diriyah.jpg" alt={ar ? 'العمارة الطينية في الدرعية' : 'Earthen architecture in Diriyah'} fill sizes="(max-width: 800px) 100vw, 50vw" /><PhotoCredit image="/images/diriyah.jpg" locale={locale} /></div><div className="feature-copy"><p className="eyebrow">{ar ? 'مكانٌ في الذاكرة' : 'A PLACE IN OUR MEMORY'}</p><h2>{ar ? <>الدرعية…<br />من هنا بدأت الحكاية</> : <>Diriyah.<br />Where a story began.</>}</h2><p>{ar ? 'بين جدران الطين وعلى ضفاف وادي حنيفة، فصلٌ مؤسس من تاريخ الدولة السعودية. تعرّف على البدايات، واتبع أثرها عبر الزمن.' : 'Between earthen walls and the banks of Wadi Hanifah lies a founding chapter of Saudi history. Explore its beginnings and follow its legacy through time.'}</p><Link className="text-link" href={`/${locale}/history`}>{ar ? 'اكتشف البدايات' : 'Discover the beginnings'} <Arrow locale={locale} /></Link></div></div></section>
    <section className="container section"><SectionHeading locale={locale} eyebrow={ar ? 'الإنسان الذي يصنع التاريخ' : 'THE PEOPLE BEHIND THE HISTORY'} title={seedSectionLabels.people[locale]} text={ar ? 'تعرّف على ملوك المملكة العربية السعودية ومحطات من سيرهم وتاريخ حكمهم.' : 'Explore the kings of Saudi Arabia, their biographies and the milestones of their reigns.'} href={`/${locale}/notable-figures`} action={ar ? 'جميع الشخصيات البارزة' : 'All notable figures'} /><div className="people-grid">{featuredKings.map((entry, index) => <article className="person-card" key={`${entry.section}/${entry.slug}`}><span className="person-number">0{index + 1}</span><span className="person-period">{entry.period}</span>{entry.kind === 'ruler' && <><div className="person-portrait"><Image src={entry.image} alt={entry.imageAlt[locale]} fill sizes="(max-width: 640px) 80vw, (max-width: 900px) 40vw, 22vw" unoptimized={entry.image.startsWith('/api/')} /></div><PhotoCredit image={entry.image} locale={locale} credit={entry.imageCredit} /></>}<h3><Link href={entryPath(entry, locale)}>{entry.title[locale]}</Link></h3><p>{entry.summary[locale]}</p><Link className="text-link" href={entryPath(entry, locale)}>{ar ? 'اقرأ السيرة' : 'Read biography'} <Arrow locale={locale} /></Link></article>)}</div>{!featuredKings.length && <p className="no-results">{ar ? 'ستظهر سير الملوك هنا بعد اعتمادها باللغتين في لوحة التحرير.' : 'Royal biographies appear here once approved in both languages.'}</p>}</section>
    <section className="history-section"><div className="container section"><SectionHeading locale={locale} eyebrow={ar ? 'ما ورثناه، وما نحمله معنا' : 'WHAT WE INHERIT. WHAT WE CARRY FORWARD.'} title={ar ? 'تراثٌ يحكي هويتنا' : 'Heritage that tells our story'} href={`/${locale}/heritage`} /><div className="heritage-grid">{heritage.map(entry => <EntryCard entry={entry} locale={locale} key={entry.slug} />)}</div></div></section>
    <div className="container values-strip">{[{ ar: 'معرفة مترابطة', en: 'Connected knowledge', textAr: 'التاريخ والمكان والإنسان في سياق واحد.', textEn: 'History, place and people, brought together.' }, { ar: 'رؤية ثنائية اللغة', en: 'Two languages, one story', textAr: 'المملكة للقارئ العربي وللعالم.', textEn: 'Saudi Arabia, for Arabic readers and the world.' }, { ar: 'المصدر قبل المعلومة', en: 'Evidence before publication', textAr: 'نهج تحريري يضع التوثيق في المقدمة.', textEn: 'An editorial process that puts sources first.' }].map(item => <div className="value-item" key={item.en}><h3>{item[locale]}</h3><p>{ar ? item.textAr : item.textEn}</p></div>)}</div>
    {preview && <div className="container editorial-note"><strong>{ar ? 'نسخة تطويرية · محتوى قيد المراجعة' : 'Development preview · editorial review pending'}</strong><p>{ar ? 'المقدمات المعروضة للتصفح الأولي وليست مقالات معتمدة للنشر. الموسوعة المستهدفة أوسع من هذه النسخة.' : 'These introductions are for initial exploration, not publication-approved articles. The planned encyclopedia extends beyond this preview.'} <Link href={`/${locale}/editorial-policy`}>{ar ? 'تعرّف على سياسة التحرير' : 'Read our editorial policy'}</Link></p></div>}
  </main>;
}