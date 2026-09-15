import { APIError, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload';
import { isAdmin, isStaff, nonEmpty } from './access';

/** Refuse to delete an author still referenced by an article; deleting it
 * would silently orphan the article's authors relationship/byline order. */
export const protectReferencedAuthor: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const articles = await req.payload.count({
    collection: 'articles', overrideAccess: false, user: req.user, req, where: { authors: { equals: id } },
  });
  if (articles.totalDocs > 0) {
    throw new APIError('لا يمكن حذف مؤلف مرتبط بمقالات موجودة. ألّ الربط أولًا. / Cannot delete an author referenced by existing articles. Unlink them first.', 409);
  }
};

export const Authors: CollectionConfig = {
  slug: 'authors',
  auth: false,
  labels: { singular: { ar: 'مؤلف', en: 'Author' }, plural: { ar: 'المؤلفون', en: 'Authors' } },
  admin: {
    group: { ar: 'المحتوى', en: 'Content' },
    useAsTitle: 'nameAr',
    defaultColumns: ['nameAr', 'nameEn'],
    description: 'سجل تحريري داخلي للمؤلفين، وليس حسابات لتسجيل الدخول. / Private editorial author records, not login accounts.',
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin },
  hooks: { beforeDelete: [protectReferencedAuthor] },
  fields: [
    {
      name: 'nameAr', type: 'text', required: true, label: { ar: 'الاسم بالعربية', en: 'Arabic name' },
      validate: (value: unknown) => nonEmpty(value) || 'أدخل الاسم بالعربية. / Enter the Arabic name.',
    },
    {
      name: 'nameEn', type: 'text', required: true, label: { ar: 'الاسم بالإنجليزية', en: 'English name' },
      validate: (value: unknown) => nonEmpty(value) || 'أدخل الاسم بالإنجليزية. / Enter the English name.',
    },
    { name: 'bioAr', type: 'textarea', label: { ar: 'النبذة بالعربية', en: 'Arabic biography' } },
    { name: 'bioEn', type: 'textarea', label: { ar: 'النبذة بالإنجليزية', en: 'English biography' } },
    {
      type: 'collapsible', label: { ar: 'إرشادات تحرير الملف', en: 'Editorial guidance' },
      admin: { description: { ar: 'ملفات المؤلفين خاصة بالتحرير ولا صفحات عامة لها حاليًا.', en: 'Author records are editorial-only; there is currently no public author page.' } },
      fields: [{ name: 'seoGuidance', type: 'ui', admin: { components: { Field: '/components/admin/seo-guidance#AuthorSEO' } } }],
    },
  ],
};