import Image from 'next/image';
import Link from 'next/link';
import { entryPath, seedSectionLabels, type Entry, type ImageCredit, type Locale } from '../lib/encyclopedia';
import { imageCreditParts } from '../lib/image-credit';
import { brand, intro, photoCredits } from '../lib/site';

export function Arrow({ locale }: { locale: Locale }) { return <span aria-hidden="true" className="arrow">{locale === 'ar' ? '←' : '→'}</span>; }

export function SearchForm({ locale, value = '', compact = false }: { locale: Locale; value?: string; compact?: boolean }) {
  return <form action={`/${locale}/search`} className={`search-form ${compact ? 'compact' : ''}`} role="search">
    <label className="sr-only" htmlFor={compact ? 'search-compact' : 'search-main'}>{locale === 'ar' ? 'ابحث في الموسوعة' : 'Search the encyclopedia'}</label>
    <input id={compact ? 'search-compact' : 'search-main'} type="search" name="q" maxLength={120} defaultValue={value} placeholder={locale === 'ar' ? 'عن أي حكاية تبحث؟ مكان، شخصية، أو حقبة تاريخية…' : 'Find a place, a person, or a moment in history…'} />
    <button type="submit">{locale === 'ar' ? 'اكتشف' : 'Discover'} <Arrow locale={locale} /></button>
  </form>;
}

export function SectionHeading({ locale, eyebrow, title, text, href, action }: { locale: Locale; eyebrow: string; title: string; text?: string; href?: string; action?: string }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{text && <p className="section-description">{text}</p>}</div>{href && <Link className="text-link" href={href}>{action || (locale === 'ar' ? 'استكشف المزيد' : 'Explore more')} <Arrow locale={locale} /></Link>}</div>;
}

export function EntryCard({ entry, locale, index, large = false }: { entry: Entry; locale: Locale; index?: number; large?: boolean }) {
  return <article className={`entry-card ${large ? 'large' : ''}${entry.kind === 'ruler' ? ' portrait-card' : ''}`}>
    <Link href={entryPath(entry, locale)} className="card-image" tabIndex={-1} aria-hidden="true"><Image src={entry.image} alt="" fill unoptimized={entry.image.startsWith('/api/')} sizes={large ? '(max-width: 700px) 100vw, 55vw' : '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw'} /><span className="image-label">{entry.category[locale]}</span></Link>
    {entry.imageCredit && <PhotoCredit image={entry.image} locale={locale} credit={entry.imageCredit} />}
    <div className="card-body"><div className="card-meta"><span>{entry.period || (locale === 'ar' ? 'من ذاكرة المكان' : 'Stories of place')}</span>{index !== undefined && <span>{String(index + 1).padStart(2, '0')}</span>}</div><h3><Link href={entryPath(entry, locale)}>{entry.title[locale]}</Link></h3><p>{entry.summary[locale]}</p><Link className="card-link" href={entryPath(entry, locale)}>{locale === 'ar' ? 'اقرأ الحكاية' : 'Read the story'}<Arrow locale={locale} /></Link></div>
  </article>;
}

export function ArticleText({ text, sourceCount, locale }: { text: string; sourceCount: number; locale: Locale }) {
  const citation = /\s*\[([1-9]\d*(?:[،,]\s*[1-9]\d*)*)\]$/.exec(text);
  const numbers = citation?.[1].split(/[،,]\s*/).map(Number) ?? [];
  if (!citation || numbers.some(number => number > sourceCount)) return <p>{text}</p>;
  return <p>{text.slice(0, citation.index)}{' '}<span className="inline-citations">{[...new Set(numbers)].map(number => <a key={number} href={`#source-${number}`} aria-label={`${locale === 'ar' ? 'المصدر' : 'Source'} ${number.toLocaleString(locale)}`}>[{number.toLocaleString(locale)}]</a>)}</span></p>;
}

function LinkedCreditText({ text }: { text: string }) {
  return <bdi>{imageCreditParts(text).map((part, index) => part.href
    ? <a key={index} href={part.href} dir="ltr">{part.text}</a>
    : part.text)}</bdi>;
}

export function PhotoCredit({ image, locale, credit: cmsCredit }: { image: string; locale: Locale; credit?: ImageCredit }) {
  if ((image.startsWith('/api/media/file/') || image.startsWith('/images/kings/')) && (cmsCredit?.attribution || cmsCredit?.license)) {
    // React escapes both credit text and validated HTTP(S) anchor values; no HTML/Markdown parsing.
    return <details className="photo-credit photo-credit-disclosure" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <summary>{locale === 'ar' ? 'حقوق الصورة' : 'Image credits'}</summary>
      <div className="photo-credit-content">
      {cmsCredit.attribution && <span>{locale === 'ar' ? 'نسبة الصورة: ' : 'Image attribution: '}<LinkedCreditText text={cmsCredit.attribution} /></span>}
      {cmsCredit.attribution && cmsCredit.license && ' · '}
      {cmsCredit.license && <span>{locale === 'ar' ? 'الترخيص: ' : 'License: '}<LinkedCreditText text={cmsCredit.license} /></span>}
      </div>
    </details>;
  }
  const credit = photoCredits.find(c => image === `/images/${c.file}`);
  if (!credit) return null;
  return <span className="photo-credit">{credit[locale]} · <Link href={`/${locale}/credits`}>{credit.author} / {credit.license}</Link></span>;
}

export function RegionExplorer({ entries, locale }: { entries: Entry[]; locale: Locale }) {
  const regions = entries.filter(entry => entry.section === 'regions');
  return <div className="region-explorer"><div className="region-visual"><span className="map-coordinate" dir="ltr">23.8859° N · 45.0792° E</span><Image src="/brand/saudi-map-logo.svg" width={520} height={440} alt={locale === 'ar' ? 'رسم مبسط للحدود الحالية للمملكة، وليس خريطة للمناطق الإدارية' : 'Generalized outline of modern Saudi Arabia, not administrative boundaries'} /><span className="map-label">{locale === 'ar' ? 'المملكة العربية السعودية' : 'SAUDI ARABIA'}</span><small>{locale === 'ar' ? 'رسم جغرافي مبسّط · اختر منطقة من القائمة' : 'Generalized outline · choose a region from the list'}</small></div><div className="region-content"><p className="eyebrow">{locale === 'ar' ? 'أرض واحدة، عوالم متعددة' : 'ONE LAND, MANY WORLDS'}</p><h2>{locale === 'ar' ? 'لكل منطقة… حكاية' : 'Every region has a story.'}</h2><p>{locale === 'ar' ? 'من جبال الجنوب إلى سواحل البحر الأحمر، ومن واحات الشرق إلى صحارى الشمال. اكتشف تنوّع المملكة عبر مناطقها.' : 'From southern mountains to the Red Sea coast, from eastern oases to northern deserts. Discover a remarkable diversity of place.'}</p><div className="region-links">{regions.map((entry, i) => <Link href={entryPath(entry, locale)} key={entry.slug}><span className="region-number">{String(i + 1).padStart(2, '0')}</span>{entry.title[locale]}<Arrow locale={locale} /></Link>)}</div></div></div>;
}

export function SiteFooter({ locale }: { locale: Locale }) {
  return <footer className="site-footer"><div className="container footer-main"><div className="footer-brand"><Image src="/brand/saudi-map-logo.svg" alt="" width={70} height={59} /><h2>{brand[locale]}</h2><p>{intro[locale]}</p></div><div><h3>{locale === 'ar' ? 'اكتشف المملكة' : 'Discover Saudi Arabia'}</h3><Link href={`/${locale}/history`}>{locale === 'ar' ? 'رحلة عبر التاريخ' : 'A journey through history'}</Link><Link href={`/${locale}/regions`}>{locale === 'ar' ? 'جغرافيا ومناطق' : 'Geography and regions'}</Link><Link href={`/${locale}/notable-figures`}>{seedSectionLabels.people[locale]}</Link><Link href={`/${locale}/heritage`}>{locale === 'ar' ? 'تراث يعيش بيننا' : 'A living heritage'}</Link></div><div><h3>{locale === 'ar' ? 'عن الموسوعة' : 'The encyclopedia'}</h3><Link href={`/${locale}/about`}>{locale === 'ar' ? 'الفكرة والرسالة' : 'Our purpose'}</Link><Link href={`/${locale}/editorial-policy`}>{locale === 'ar' ? 'سياسة التحرير والمصادر' : 'Editorial policy & sources'}</Link><Link href={`/${locale}/credits`}>{locale === 'ar' ? 'حقوق الصور والمصادر' : 'Image credits & licenses'}</Link></div></div><div className="container footer-bottom"><p>{locale === 'ar' ? 'مشروع معرفي مستقل، لا يمثل جهة حكومية رسمية.' : 'An independent knowledge project, not an official government website.'}</p><div><Link href={`/${locale}/privacy`}>{locale === 'ar' ? 'الخصوصية' : 'Privacy'}</Link><Link href="/admin">{locale === 'ar' ? 'لوحة التحرير' : 'Editorial desk'}</Link><span>© {new Date().getFullYear()} {brand[locale]}</span></div></div></footer>;
}