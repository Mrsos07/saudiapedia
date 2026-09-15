import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { EntryCard, RegionExplorer, SearchForm } from '@/components/encyclopedia';
import { getContent } from '@/lib/content';
import { isLocale, matchesSection } from '@/lib/encyclopedia';
import { pageMetadata, navigation, photoCredits } from '@/lib/site';
import { getSections, findSection } from '@/lib/sections';
import type { Locale } from '@/lib/encyclopedia';
import type { SectionInfo } from '@/lib/sections';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; section: string }>; searchParams: Promise<{ page?: string; category?: string }> };
const policies = {
  about: { ar: 'عن موسوعة المملكة', en: 'About the encyclopedia' },
  'editorial-policy': { ar: 'سياسة التحرير والمصادر', en: 'Editorial policy & sources' },
  credits: { ar: 'حقوق الصور والمصادر', en: 'Image credits & licenses' },
  privacy: { ar: 'الخصوصية', en: 'Privacy' },
};
// Sections come from three sources: the fixed pseudo-sections in `navigation`
// (rulers/notable-figures, derived from `kind`, not a real section), the
// static policy pages, and administrator-managed sections from the CMS. Any
// of the three can supply a valid page title for this dynamic [section] route.
function titleFor(section: string, locale: Locale, sections: SectionInfo[]) {
  return navigation.find(n => n.path === section)?.[locale]
    ?? policies[section as keyof typeof policies]?.[locale]
    ?? findSection(sections, section)?.name[locale];
}
export async function generateMetadata({ params }: Props) {
  const { locale, section } = await params;
  if (!isLocale(locale)) return {};
  const { sections } = await getSections();
  const title = titleFor(section, locale, sections);
  if (!title) return {};
  const { preview } = await getContent();
  return pageMetadata(locale, title, locale === 'ar' ? `${title} في موسوعة المملكة العربية السعودية.` : `${title} in the Saudi Arabia encyclopedia.`, `/${section}`, preview);
}

function Policy({ section, locale }: { section: string; locale: Locale }) {
  const ar = locale === 'ar';
  if (section === 'credits') return <div className="container section"><p className="page-intro">{ar ? 'صور حقيقية لمواقع سعودية، مستخدمة وفق تراخيص المشاع الإبداعي. قد تُعرض الصور بقصّ بصري أو طبقة لونية، ويغيّر Next.js حجمها وصيغتها؛ تبقى الصور المشتقة الخاضعة لشرط المشاركة بالمثل تحت الترخيص نفسه.' : 'Real photographs of Saudi places, used under Creative Commons licenses. Display crops, overlays and Next.js resizing/format conversion may apply; ShareAlike image adaptations remain under their respective licenses.'}</p><div className="credits-grid">{photoCredits.map(photo => <article className="credit-card" key={photo.file}><Image src={`/images/${photo.file}`} alt={photo[locale]} width={640} height={360} /><div className="card-body"><h2>{photo[locale]}</h2><p>{photo.author}</p><a href={photo.source} target="_blank" rel="noreferrer">{ar ? 'الصورة الأصلية على ويكيميديا' : 'Original on Wikimedia Commons'}</a><p><a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a></p></div></article>)}</div><div className="policy-content"><h2>{ar ? 'شعار الخريطة' : 'Map mark'}</h2><p>{ar ? 'رسم مبسط مشتق من بيانات Natural Earth المتاحة للملك العام؛ ليس خريطة قانونية أو تاريخية أو هوية رسمية.' : 'A generalized drawing based on public-domain Natural Earth data; not a legal boundary map, historical territorial map or official identity.'} <a href="https://www.naturalearthdata.com/about/terms-of-use/">Natural Earth</a></p><h2>{ar ? 'الأيقونات والخط' : 'Icons and typography'}</h2><p>{ar ? 'الخط المعتمد هو Zain من Google Fonts. Flaticon هو المصدر المحدد للأيقونات عند التحقق من الترخيص؛ لا تتضمن هذه النسخة أيقونات مخزّنة منه أو من مزود بديل.' : 'Zain is loaded from Google Fonts. Flaticon is the designated icon source once licenses are verified; no stock icons from it or another provider are included in this version.'}</p></div></div>;
  const paragraphs = section === 'about' ? [
    { ar: 'نافذة معرفية على المملكة', en: 'A window into Saudi Arabia', textAr: 'موسوعة المملكة مشروع معرفي مستقل يجمع تاريخ المملكة وجغرافيتها وسير شخصياتها وتراثها في تجربة عربية وإنجليزية. نربط الشخص بالمكان والحدث بسياقه، لتكون القراءة بداية للاستكشاف.', textEn: 'Kingdom Encyclopedia is an independent knowledge project bringing Saudi history, geography, biographies and heritage into an Arabic and English reading experience. People connect to places, and events to their context.' },
    { ar: 'مرحلة البناء', en: 'A work in progress', textAr: 'هذه النسخة تؤسس للتجربة التقنية والتحريرية. مقدمات المحتوى المحلي ليست بديلًا عن المقالات الموسعة والمراجعة المتخصصة. لا ينتمي المشروع لجهة حكومية ولا يدّعي الاعتماد الرسمي.', textEn: 'This version establishes the technical and editorial foundations. Local content introductions do not replace extensive articles and specialist review. The project is not government-affiliated and claims no official endorsement.' },
  ] : section === 'privacy' ? [
    { ar: 'التصفح والبحث', en: 'Browsing and searching', textAr: 'لا تتطلب الواجهة العامة حسابًا، ولم تُضف أدوات تتبع إعلانية أو تحليلات خارجية. تنتقل عبارة البحث إلى خادم الموقع ضمن رابط الصفحة، وقد تحفظها سجلات الاستضافة وسجل المتصفح. تجنب إدخال معلومات شخصية في البحث.', textEn: 'Public browsing does not require an account. No advertising trackers or third-party analytics have been added. Search terms are sent to the site server in the page URL and may appear in hosting logs and browser history. Do not enter personal information in search.' },
    { ar: 'الخطوط والروابط الخارجية', en: 'Fonts and external links', textAr: 'يُحمّل خط Zain من Google Fonts؛ يتصل متصفحك بخوادم Google لهذا الغرض، وتخضع تلك الطلبات لسياساتها. الروابط إلى المصادر الخارجية تنقلك إلى مواقع مستقلة.', textEn: 'Zain is loaded from Google Fonts, so your browser connects to Google servers for font resources under their policies. External source links lead to independently operated websites.' },
    { ar: 'لوحة التحرير', en: 'Editorial administration', textAr: 'تستخدم لوحة التحرير ملفات تعريف ارتباط للمصادقة عند تفعيلها. قبل الإطلاق العام، يجب أن يضيف مشغّل الموقع بيانات التواصل وسياسة مدة حفظ السجلات وطلبات الخصوصية بما يتوافق مع التشغيل الفعلي.', textEn: 'The editorial administration uses authentication cookies when enabled. Before public launch, the operator must provide contact information, retention periods and a privacy-request procedure reflecting actual operations.' },
  ] : [
    { ar: 'التوثيق قبل النشر', en: 'Evidence before publication', textAr: 'يُكتب المحتوى بصياغة أصلية، وتُذكر مصادر الادعاءات التاريخية والجغرافية بوضوح. نفرّق بين المصادر الأولية والدراسات التفسيرية، ولا ننسب مراجعة علمية لشخص لم يقم بها.', textEn: 'Articles use original writing and identify sources for historical and geographical claims. Primary evidence is distinguished from interpretation. Review credit must never be assigned to someone who has not performed the review.' },
    { ar: 'المقدمات الحالية', en: 'The current introductions', textAr: 'تحتوي النسخة المحلية على 30 موضوعًا تمهيديًا بلغتين. خمس مقدمات تراثية تتضمن روابط لليونسكو، وسير الملوك السبعة تتضمن إحالات إلى سعوديبيديا وويكيبيديا وصورًا أرشيفية موثقة المصدر. بقية المقدمات تحتاج إلى استكمال المصادر، وجميع المواد تحتاج إلى مراجعة بشرية. جميع المقدمات موسومة بأنها قيد المراجعة ومستبعدة من الفهرسة.', textEn: 'The local preview contains 30 introductory topics in two languages. Five heritage introductions link to UNESCO, and the seven royal biographies cite Saudipedia and Wikipedia and include sourced archival photographs. The other introductions still need references, and all material requires human review. All seed introductions are labeled editorial previews and excluded from indexing.' },
    { ar: 'التحرير والترجمة', en: 'Editing and translation', textAr: 'تنتقل المقالة من المسودة إلى المراجعة العلمية ثم مراجعة الترجمة والاعتماد. لا يُعرض محتوى لوحة التحرير للعامة إلا بعد النشر والاعتماد وتوفر نسختين متطابقتين في بنية الترجمة. تعديل محتوى معتمد يعيده للمراجعة ما لم يعتمد المراجع التعديل صراحةً.', textEn: 'Articles progress through drafting, factual review, translation review and approval. CMS content is public only after approval, publication and completion of a structurally aligned bilingual pair. Editing approved content resets it for review unless a reviewer explicitly approves the change.' },
    { ar: 'المصادر والتصحيحات', en: 'Sources and corrections', textAr: 'تشمل مراجع البحث المقترحة دارة الملك عبدالعزيز والجهات الإحصائية والثقافية واليونسكو والدراسات الأكاديمية. ذكر جهة مرجعية لا يعني التحقق منها لكل مقال. قبل الإطلاق يجب استكمال قناة تصحيح عامة باسم المسؤول التحريري وبيانات تواصل حقيقية.', textEn: 'Research leads include Darah, official statistical and cultural institutions, UNESCO and academic publications. Naming a reference institution is not verification of every article. A public correction channel with a real editorial owner and contact details is required before launch.' },
  ];
  return <div className="container section policy-content">{paragraphs.map(p => <section key={p.en}><h2>{p[locale]}</h2><p>{ar ? p.textAr : p.textEn}</p></section>)}</div>;
}

export default async function SectionPage({ params, searchParams }: Props) {
  const { locale, section } = await params;
  if (!isLocale(locale)) notFound();
  if (section === 'geography') redirect(`/${locale}/regions`);
  const { sections } = await getSections();
  const title = titleFor(section, locale, sections);
  if (!title) notFound();
  const ar = locale === 'ar';
  const { entries, preview } = await getContent();
  const policy = section in policies;
  const query = await searchParams;
  const relevant = entries.filter(entry => matchesSection(entry, section));
  const categories = [...new Set(relevant.map(e => e.category[locale]))];
  const category = typeof query.category === 'string' && categories.includes(query.category) ? query.category : '';
  const filtered = category ? relevant.filter(e => e.category[locale] === category) : relevant;
  const page = Math.max(1, Math.min(Math.ceil(filtered.length / 9) || 1, Number.parseInt(query.page || '1', 10) || 1));
  const pages = Math.ceil(filtered.length / 9);
  return <main id="main-content"><div className="page-hero"><div className="container"><nav className="breadcrumbs" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}><Link href={`/${locale}`}>{ar ? 'الرئيسية' : 'Home'}</Link><span>/</span><span>{title}</span></nav><p className="eyebrow">{ar ? 'اكتشف موسوعة المملكة' : 'EXPLORE THE ENCYCLOPEDIA'}</p><h1 className="page-heading">{title}</h1><p className="page-intro">{section === 'notable-figures' ? (ar ? 'حكّام المملكة وسير الشخصيات التي أسهمت في تاريخها وعلمها وثقافتها. استكشف الجميع أو اختر تصنيفًا.' : 'The Kingdom’s rulers and the people who shaped its history, scholarship and culture. Explore all biographies or choose a category.') : (ar ? 'مسارات في التاريخ والمكان والإنسان. اختر موضوعًا، وابدأ المعرفة من مصدرها.' : 'Explore history, place and people. Choose a subject and follow its story.')}</p></div></div>
    {policy ? <Policy section={section} locale={locale} /> : <div className="container section">{preview && <p className="preview-notice">{ar ? 'مقدمات تحريرية قيد المراجعة؛ ليست مقالات معتمدة للنشر.' : 'Editorial introductions awaiting review; not publication-approved articles.'}</p>}{section === 'regions' && <RegionExplorer entries={entries} locale={locale} />}<div className="listing-toolbar"><span className="content-count">{filtered.length.toLocaleString(locale)} {ar ? 'موضوعًا متاحًا' : 'topics available'}</span><Link className="text-link" href={`/${locale}/search`}>{ar ? 'ابحث في جميع الأقسام' : 'Search all sections'}</Link></div>{categories.length > 1 && <nav className="filter-tabs" aria-label={ar ? 'تصفية الموضوعات' : 'Topic filters'}><Link className={!category ? 'active' : ''} href={`/${locale}/${section}`}>{ar ? 'الكل' : 'All'}</Link>{categories.map(c => <Link key={c} className={c === category ? 'active' : ''} href={`/${locale}/${section}?category=${encodeURIComponent(c)}`}>{c}</Link>)}</nav>}<div className="card-grid">{filtered.slice((page - 1) * 9, page * 9).map(entry => <EntryCard entry={entry} locale={locale} key={`${entry.section}/${entry.slug}`} />)}</div>{!filtered.length && <div className="empty-state"><h2>{ar ? 'بانتظار المقالات المعتمدة' : 'Awaiting approved articles'}</h2><p>{ar ? 'تظهر الموضوعات بعد اعتماد النسختين العربية والإنجليزية.' : 'Topics appear once both Arabic and English versions are approved.'}</p><SearchForm locale={locale} compact /></div>}{pages > 1 && <nav className="pagination" aria-label={ar ? 'صفحات النتائج' : 'Result pages'}>{Array.from({ length: pages }, (_, i) => <Link key={i} className={page === i + 1 ? 'active' : ''} aria-current={page === i + 1 ? 'page' : undefined} href={`/${locale}/${section}?page=${i + 1}${category ? `&category=${encodeURIComponent(category)}` : ''}`}>{(i + 1).toLocaleString(locale)}</Link>)}</nav>}</div>}
  </main>;
}