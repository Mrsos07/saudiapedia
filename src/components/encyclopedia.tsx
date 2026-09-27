import Image from 'next/image';
import Link from 'next/link';
import { administrativeRegions, entryPath, type Entry, type ImageCredit, type Locale } from '../lib/encyclopedia';
import { imageCreditParts } from '../lib/image-credit';
import { PublicImage } from './public-image';
import { InteractiveRegionMap } from './region-map';
import { REGION_MAP_VIEWBOX, REGION_SHAPES } from '../lib/region-map';
import { CENSUS_2022, regionStatistics } from '../lib/region-facts';
import { brand, intro, photoCredits, type NavigationItem } from '../lib/site';

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
    <Link href={entryPath(entry, locale)} className="card-image" tabIndex={-1} aria-hidden="true"><PublicImage src={entry.image} alt="" fill sizes={large ? '(max-width: 700px) 100vw, 55vw' : '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw'} /><span className="image-label">{entry.category[locale]}</span></Link>
    {entry.imageCredit && <PhotoCredit image={entry.image} locale={locale} credit={entry.imageCredit} />}
    <div className="card-body"><div className="card-meta"><span>{entry.period || (entry.kind
      ? (locale === 'ar' ? 'سيرة وأثر' : 'Life and legacy')
      : (locale === 'ar' ? 'من ذاكرة المكان' : 'Stories of place'))}</span>{index !== undefined && <span>{String(index + 1).padStart(2, '0')}</span>}</div><h3><Link href={entryPath(entry, locale)}>{entry.title[locale]}</Link></h3><p>{entry.summary[locale]}</p><Link className="card-link" href={entryPath(entry, locale)}>{locale === 'ar' ? 'اقرأ الحكاية' : 'Read the story'}<Arrow locale={locale} /></Link></div>
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

function RegionMap({ regions, locale }: { regions: Entry[]; locale: Locale }) {
  const ar = locale === 'ar';
  const labels = ar
    ? { seat: 'المقر الإداري', population: 'عدد السكان', share: 'من سكان المملكة', rank: 'الترتيب سكانيًا', action: 'اضغط لاستكشاف المنطقة' }
    : { seat: 'Regional seat', population: 'Population', share: 'Share of national', rank: 'Population rank', action: 'Click to explore the region' };
  return <InteractiveRegionMap labels={labels}>
    <svg viewBox={REGION_MAP_VIEWBOX} role="group" aria-label={ar ? 'خريطة تفاعلية مبسطة للمناطق الإدارية الثلاث عشرة' : 'Simplified interactive map of the thirteen administrative regions'}>
      {REGION_SHAPES.map(shape => {
        const entry = regions.find(item => item.slug === shape.slug);
        const stats = regionStatistics(shape.slug);
        if (!entry || !stats) return <path key={shape.slug} className="region-shape unavailable" d={shape.path} />;
        const population = stats.population.toLocaleString(locale);
        const name = entry.title[locale];
        return <a key={shape.slug} href={entryPath(entry, locale)} data-region={shape.slug} data-name={name} data-seat={stats.seat[locale]} data-population={population}
          data-share={(stats.share / 100).toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })}
          data-rank={ar ? `${stats.rank.toLocaleString(locale)} من ${REGION_SHAPES.length.toLocaleString(locale)}` : `${stats.rank} of ${REGION_SHAPES.length}`}
          aria-label={`${name}. ${labels.population}: ${population}. ${labels.seat}: ${stats.seat[locale]}`}>
          <path className="region-shape" d={shape.path} />
        </a>;
      })}
    </svg>
  </InteractiveRegionMap>;
}

export function RegionExplorer({ entries, locale }: { entries: Entry[]; locale: Locale }) {
  const regions = administrativeRegions(entries);
  const ar = locale === 'ar';
  return <div className="region-explorer"><div className="region-visual"><span className="map-coordinate" dir="ltr">23.8859° N · 45.0792° E</span><RegionMap regions={regions} locale={locale} /><small className="map-hint-pointer">{ar ? 'مرّر المؤشر على منطقة لعرض بياناتها، واضغط عليها للانتقال إلى صفحتها.' : 'Hover over a region to see its data; click to open its page.'}</small><small className="map-hint-touch">{ar ? 'المس أي منطقة للانتقال إلى صفحتها.' : 'Tap a region to open its page.'}</small><small className="region-map-source">{ar ? 'السكان: ' : 'Population: '}<a href={CENSUS_2022.source.url} target="_blank" rel="noreferrer">{CENSUS_2022.source.title[locale]}</a>{ar ? ' · حدود تقريبية مبسطة وليست رسمية، مبنية على Natural Earth' : ' · Simplified, unofficial boundaries made with Natural Earth'}</small></div><div className="region-content"><p className="eyebrow">{locale === 'ar' ? 'أرض واحدة، عوالم متعددة' : 'ONE LAND, MANY WORLDS'}</p><h2>{locale === 'ar' ? 'لكل منطقة… حكاية' : 'Every region has a story.'}</h2><p>{locale === 'ar' ? 'من جبال الجنوب إلى سواحل البحر الأحمر، ومن واحات الشرق إلى صحارى الشمال. اكتشف تنوّع المملكة عبر مناطقها.' : 'From southern mountains to the Red Sea coast, from eastern oases to northern deserts. Discover a remarkable diversity of place.'}</p><div className="region-links">{regions.map((entry, i) => <Link href={entryPath(entry, locale)} key={entry.slug}><span className="region-number">{String(i + 1).padStart(2, '0')}</span>{entry.title[locale]}<Arrow locale={locale} /></Link>)}</div></div></div>;
}

export function SiteFooter({ locale, navigation }: { locale: Locale; navigation: readonly NavigationItem[] }) {
  return <footer className="site-footer"><div className="container footer-main"><div className="footer-brand"><Image src="/brand/saudi-map-logo.svg" alt="" width={70} height={59} /><h2>{brand[locale]}</h2><p>{intro[locale]}</p></div><div><h3>{locale === 'ar' ? 'اكتشف المملكة' : 'Discover Saudi Arabia'}</h3>{navigation.map(item => <Link key={item.path} href={`/${locale}/${item.path}`}>{item[locale]}</Link>)}</div><div><h3>{locale === 'ar' ? 'عن الموسوعة' : 'The encyclopedia'}</h3><Link href={`/${locale}/about`}>{locale === 'ar' ? 'الفكرة والرسالة' : 'Our purpose'}</Link><Link href={`/${locale}/editorial-policy`}>{locale === 'ar' ? 'سياسة التحرير والمصادر' : 'Editorial policy & sources'}</Link><Link href={`/${locale}/credits`}>{locale === 'ar' ? 'حقوق الصور والمصادر' : 'Image credits & licenses'}</Link></div></div><div className="container footer-bottom"><p>{locale === 'ar' ? 'مشروع معرفي مستقل، لا يمثل جهة حكومية رسمية.' : 'An independent knowledge project, not an official government website.'}</p><div><Link href={`/${locale}/privacy`}>{locale === 'ar' ? 'الخصوصية' : 'Privacy'}</Link><Link href="/admin">{locale === 'ar' ? 'لوحة التحرير' : 'Editorial desk'}</Link><span>© {new Date().getFullYear()} {brand[locale]}</span></div></div></footer>;
}