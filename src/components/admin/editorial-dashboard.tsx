import Link from 'next/link';
import type { ServerProps } from 'payload';
import { hasRole, roles } from '../../collections/access';
import { loginLanguage } from './login-copy';
import { LoginLanguageSwitch } from './login-language-switch';

const dashboardCopy = {
  ar: {
    eyebrow: 'موسوعة المملكة · مساحة التحرير',
    title: 'لوحة التحرير',
    introduction: 'نظّم المعرفة، وراجع المصادر، وأكمل المحتوى بالعربية والإنجليزية من مساحة واحدة.',
    createArticle: 'إنشاء وثيقة مقال',
    allArticles: 'إدارة المقالات',
    overview: 'نظرة على السجلات',
    countNote: 'الأعداد حسب صلاحيات حسابك عند تحميل اللوحة. تشمل وثائق المقالات المسودات والمنشور؛ وليست عدد الموضوعات أو أزواج الترجمة المكتملة.',
    unavailable: 'غير متاح',
    articles: 'وثائق المقالات (كل لغة مستقلة)',
    categories: 'التصنيفات',
    authors: 'المؤلفون',
    organize: 'تنظيم المحتوى',
    categoriesDescription: 'نظّم التصنيفات بالعربية والإنجليزية، واربط كل تصنيف بقسمه الثابت.',
    authorsDescription: 'أدر ملفات المؤلفين وأسماءهم ونبذهم باللغتين. هذه سجلات تحريرية وليست حسابات دخول.',
    sections: 'أقسام الموسوعة',
    sectionsDescription: 'أقسام مدارة من لوحة التحكم: إضافة وتعديل وحذف (للمسؤولين فقط). انقر لفتح وثائق المقالات الخاصة بقسم ما.',
    manageSections: 'إضافة / تعديل الأقسام',
    browseSection: 'عرض وثائق القسم',
    noSections: 'لا توجد أقسام مسجلة بعد. أنشئ القسم الأول.',
    sectionsUnavailable: 'تعذّر تحميل الأقسام.',
    workflow: 'قبل النشر',
    workflowDescription: 'أكمل الوثيقتين العربية والإنجليزية، وطابق مفتاح الترجمة والقسم والرابط المختصر، وتحقق من المصادر. يتطلب النشر موافقة مراجع أو مسؤول؛ واعتماد الوسائط العامة منفصل عن اعتماد المقال.',
    sources: 'مكتبة المصادر',
    media: 'مكتبة الوسائط',
  },
  en: {
    eyebrow: 'Kingdom Encyclopedia · Editorial workspace',
    title: 'Editorial dashboard',
    introduction: 'Organize knowledge, review sources, and complete Arabic and English content in one workspace.',
    createArticle: 'Create article document',
    allArticles: 'Manage articles',
    overview: 'Record overview',
    countNote: 'Counts reflect your account permissions when the dashboard loads. Article documents include drafts and published records; these are not counts of topics or complete translation pairs.',
    unavailable: 'Unavailable',
    articles: 'Article documents (each language counted separately)',
    categories: 'Categories',
    authors: 'Authors',
    organize: 'Organize content',
    categoriesDescription: 'Organize Arabic and English categories, and assign each category to its fixed section.',
    authorsDescription: 'Manage author profiles, names, and biographies in both languages. These are editorial records, not login accounts.',
    sections: 'Encyclopedia sections',
    sectionsDescription: 'Sections are managed from the dashboard: add, edit and delete them (administrators only). Select a section to open its filtered article documents.',
    manageSections: 'Add / edit sections',
    browseSection: 'View section documents',
    noSections: 'No sections exist yet. Create the first one.',
    sectionsUnavailable: 'Could not load sections.',
    workflow: 'Before publishing',
    workflowDescription: 'Complete the Arabic and English documents, match their translation key, section, and slug, and verify sources. Publication requires reviewer or administrator approval; public media approval is separate from article approval.',
    sources: 'Source library',
    media: 'Media library',
  },
} as const;

const countedCollections = ['articles', 'categories', 'authors'] as const;

function sectionArticleURL(slug: string): string {
  const query = new URLSearchParams({ 'where[section][equals]': slug });
  return `/admin/collections/articles?${query.toString()}`;
}

type DashboardSection = { id: number | string; slug: string; nameAr: string; nameEn: string };

// Registered as beforeDashboard by the admin configuration. Never pass server
// props into the language switch or introduce cross-request count caching.
export async function EditorialDashboard({ i18n, user, payload }: Pick<ServerProps, 'i18n' | 'user' | 'payload'>) {
  if (!user || !hasRole({ user }, roles)) return null;

  const locale = loginLanguage(i18n.language);
  const copy = dashboardCopy[locale];
  const numberFormat = new Intl.NumberFormat(locale);
  const counts = await Promise.all(countedCollections.map(async (collection) => {
    try {
      const { totalDocs } = await payload.count({ collection, overrideAccess: false, user });
      return { collection, total: Number.isSafeInteger(totalDocs) && totalDocs >= 0 ? totalDocs : null };
    } catch {
      // A denied or failed query is unavailable, never an empty inventory.
      return { collection, total: null };
    }
  }));
  // Sections are administrator-managed content, not a compiled-in list; load
  // them the same permission-aware way as the counts above.
  let sections: DashboardSection[] | null = null;
  try {
    const result = await payload.find({ collection: 'sections', overrideAccess: false, user, depth: 0, limit: 100, sort: 'order' });
    sections = result.docs as DashboardSection[];
  } catch {
    sections = null;
  }

  return (
    <section className="cms-editorial-dashboard" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-labelledby="editorial-dashboard-title">
      <header className="cms-editorial-dashboard__hero">
        <div className="cms-editorial-dashboard__topbar">
          <p className="cms-editorial-dashboard__eyebrow">{copy.eyebrow}</p>
          <LoginLanguageSwitch />
        </div>
        <h1 id="editorial-dashboard-title">{copy.title}</h1>
        <p className="cms-editorial-dashboard__introduction">{copy.introduction}</p>
        <div className="cms-editorial-dashboard__actions">
          <Link className="cms-editorial-dashboard__primary" href="/admin/collections/articles/create">{copy.createArticle}</Link>
          <Link className="cms-editorial-dashboard__secondary" href="/admin/collections/articles">{copy.allArticles}</Link>
        </div>
      </header>

      <section className="cms-editorial-dashboard__block" aria-labelledby="editorial-overview-title">
        <h2 id="editorial-overview-title">{copy.overview}</h2>
        <p id="editorial-count-note" className="cms-editorial-dashboard__muted">{copy.countNote}</p>
        <dl className="cms-editorial-dashboard__counts" aria-describedby="editorial-count-note">
          {counts.map(({ collection, total }) => (
            <div className="cms-editorial-dashboard__count" key={collection}>
              <dt><Link href={`/admin/collections/${collection}`}>{copy[collection]}</Link></dt>
              <dd className={total === null ? 'cms-editorial-dashboard__unavailable' : undefined}>
                {total === null ? copy.unavailable : numberFormat.format(total)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <nav className="cms-editorial-dashboard__block" aria-labelledby="editorial-organize-title">
        <h2 id="editorial-organize-title">{copy.organize}</h2>
        <ul className="cms-editorial-dashboard__management">
          {(['categories', 'authors'] as const).map((collection) => (
            <li key={collection}>
              <Link className="cms-editorial-dashboard__card" href={`/admin/collections/${collection}`}>
                <h3>{copy[collection]}</h3>
                <p>{copy[`${collection}Description`]}</p>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav className="cms-editorial-dashboard__block" aria-labelledby="editorial-sections-title">
        <div className="cms-editorial-dashboard__topbar">
          <h2 id="editorial-sections-title">{copy.sections}</h2>
          <Link className="cms-editorial-dashboard__secondary" href="/admin/collections/sections">{copy.manageSections}</Link>
        </div>
        <p className="cms-editorial-dashboard__muted">{copy.sectionsDescription}</p>
        {sections === null ? <p className="cms-editorial-dashboard__unavailable" role="alert">{copy.sectionsUnavailable}</p>
          : sections.length === 0 ? <p className="cms-editorial-dashboard__muted">{copy.noSections}</p>
          : <ul className="cms-editorial-dashboard__sections">
            {sections.map((section) => (
              <li key={section.id}>
                <Link className="cms-editorial-dashboard__card cms-editorial-dashboard__section-card" href={sectionArticleURL(section.slug)}>
                  <h3>{locale === 'ar' ? section.nameAr : section.nameEn}</h3>
                  <span className="cms-editorial-dashboard__card-action">{copy.browseSection}</span>
                </Link>
              </li>
            ))}
          </ul>}
      </nav>

      <aside className="cms-editorial-dashboard__workflow" aria-labelledby="editorial-workflow-title">
        <h2 id="editorial-workflow-title">{copy.workflow}</h2>
        <p>{copy.workflowDescription}</p>
        <div className="cms-editorial-dashboard__actions">
          <Link href="/admin/collections/sources">{copy.sources}</Link>
          <Link href="/admin/collections/media">{copy.media}</Link>
        </div>
      </aside>
    </section>
  );
}