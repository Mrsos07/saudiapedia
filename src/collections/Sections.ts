import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload';
import { isAdmin, isStaff, nonEmpty } from './access';

type SectionDocument = { id: number | string; slug?: unknown };

/** Payload's beforeDelete hook only supplies the numeric/string id, not the
 * document. Articles/Categories store the section's slug (a stable string),
 * not its database id, so the slug must be read before checking references. */

/** The slug is a public URL segment (/{locale}/{slug}); changing it after
 * creation would break existing links, bookmarks and indexed pages. */
export const enforceSectionSlugImmutable: CollectionBeforeChangeHook<SectionDocument> = ({ data, originalDoc, operation }) => {
  if (operation === 'update' && data.slug !== undefined && data.slug !== originalDoc?.slug) {
    throw new APIError('لا يمكن تغيير رابط القسم بعد إنشائه؛ هذا يكسر الروابط المنشورة. / A section’s slug cannot be changed after creation; it breaks published links.', 400);
  }
  return data;
};

/** Refuse to delete a section still referenced by an article or a category.
 * Articles/Categories store the section's stable slug string (not its numeric
 * id), so the slug must be resolved first; deleting an in-use section would
 * silently orphan published content and stored category rows. */
export const protectReferencedSection: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const section = await req.payload.findByID({
    collection: 'sections', id, overrideAccess: false, user: req.user, req, depth: 0, select: { slug: true },
  }).catch(() => null);
  const slug = section && typeof section === 'object' && 'slug' in section ? section.slug : undefined;
  if (typeof slug !== 'string') return; // Already gone or inaccessible; nothing to protect.
  const [articles, categories] = await Promise.all([
    req.payload.count({ collection: 'articles', overrideAccess: false, user: req.user, req, where: { section: { equals: slug } } }),
    req.payload.count({ collection: 'categories', overrideAccess: false, user: req.user, req, where: { section: { equals: slug } } }),
  ]);
  if (articles.totalDocs > 0 || categories.totalDocs > 0) {
    throw new APIError('لا يمكن حذف قسم مرتبط بمقالات أو تصنيفات موجودة. أعد تصنيفها أولًا. / Cannot delete a section referenced by existing articles or categories. Reassign them first.', 409);
  }
};

export const Sections: CollectionConfig = {
  slug: 'sections',
  labels: { singular: { ar: 'قسم', en: 'Section' }, plural: { ar: 'أقسام الموسوعة', en: 'Encyclopedia sections' } },
  admin: {
    group: { ar: 'المحتوى', en: 'Content' },
    useAsTitle: 'nameAr',
    defaultColumns: ['nameAr', 'nameEn', 'slug', 'order'],
    description: {
      ar: 'أقسام الموسوعة الظاهرة في الموقع العام وفي محرر المقالات والتصنيفات. الرابط (slug) ثابت بعد الإنشاء لأنه جزء من روابط الموقع المنشورة.',
      en: 'Encyclopedia sections shown on the public site and in the article/category editors. The slug is fixed after creation because it is part of published site URLs.',
    },
  },
  // Names/slugs/order are nonsensitive navigation data shown on the public site
  // (menus, section pages, breadcrumbs), so reads are public like Media's public
  // fields. Only administrators create or delete sections; staff may adjust
  // display labels but not the slug (immutable, enforced below).
  access: { read: () => true, create: isAdmin, update: isStaff, delete: isAdmin },
  hooks: { beforeChange: [enforceSectionSlugImmutable], beforeDelete: [protectReferencedSection] },
  fields: [
    {
      name: 'slug', type: 'text', required: true, unique: true, label: { ar: 'الرابط المختصر', en: 'Slug' },
      validate: (value: unknown) => (typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
        || 'استخدم أحرفًا لاتينية صغيرة وأرقامًا بصيغة ASCII تفصل بينها شرطات مفردة. / Use lowercase ASCII letters/numbers separated by single hyphens.',
      admin: { description: { ar: 'يظهر في رابط الموقع: /ar/الرابط. لا يمكن تغييره بعد الحفظ.', en: 'Appears in the site URL: /en/slug. Cannot be changed after saving.' } },
    },
    {
      name: 'nameAr', type: 'text', required: true, label: { ar: 'الاسم بالعربية', en: 'Arabic name' },
      validate: (value: unknown) => nonEmpty(value) || 'أدخل الاسم بالعربية. / Enter the Arabic name.',
    },
    {
      name: 'nameEn', type: 'text', required: true, label: { ar: 'الاسم بالإنجليزية', en: 'English name' },
      validate: (value: unknown) => nonEmpty(value) || 'أدخل الاسم بالإنجليزية. / Enter the English name.',
    },
    {
      name: 'order', type: 'number', defaultValue: 0, label: { ar: 'ترتيب العرض', en: 'Display order' },
      admin: { description: { ar: 'الأقسام الأصغر رقمًا تظهر أولًا في القوائم.', en: 'Lower numbers appear first in listings.' } },
    },
  ],
};
