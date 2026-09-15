import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload';
import { isAdmin, isStaff, nonEmpty } from './access';

type CategoryDocument = { id: number | string; section?: unknown };

export const enforceCategorySection: CollectionBeforeChangeHook<CategoryDocument> = async ({ data, originalDoc, operation, req }) => {
  if (operation === 'update' && data.section !== undefined && data.section !== originalDoc?.section) {
    throw new APIError('لا يمكن تغيير قسم التصنيف بعد إنشائه. / A category’s section cannot be changed after creation.', 400);
  }
  const section = data.section ?? originalDoc?.section;
  if (operation === 'create' || (data.section !== undefined && data.section !== originalDoc?.section)) {
    if (!nonEmpty(section)) throw new APIError('Invalid section.', 400);
    const match = await req.payload.count({
      collection: 'sections', overrideAccess: false, user: req.user, req, where: { slug: { equals: section } },
    });
    if (match.totalDocs !== 1) throw new APIError('Invalid section. Choose an existing encyclopedia section.', 400);
  }
  return data;
};

/** Refuse to delete a category still referenced by an article; deleting it
 * would silently orphan the article's categoryRef relationship. */
export const protectReferencedCategory: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const articles = await req.payload.count({
    collection: 'articles', overrideAccess: false, user: req.user, req, where: { categoryRef: { equals: id } },
  });
  if (articles.totalDocs > 0) {
    throw new APIError('لا يمكن حذف تصنيف مرتبط بمقالات موجودة. ألّ الربط أولًا. / Cannot delete a category referenced by existing articles. Unlink them first.', 409);
  }
};

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: { ar: 'تصنيف', en: 'Category' }, plural: { ar: 'التصنيفات', en: 'Categories' } },
  admin: {
    group: { ar: 'المحتوى', en: 'Content' },
    useAsTitle: 'nameAr',
    defaultColumns: ['nameAr', 'nameEn', 'section'],
    description: 'تصنيفات تحريرية داخلية مرتبطة بقسم ثابت. / Internal editorial categories, each assigned to an immutable section.',
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin },
  hooks: { beforeChange: [enforceCategorySection], beforeDelete: [protectReferencedCategory] },
  fields: [
    {
      name: 'nameAr', type: 'text', required: true, label: { ar: 'الاسم بالعربية', en: 'Arabic name' },
      validate: (value: unknown) => nonEmpty(value) || 'أدخل الاسم بالعربية. / Enter the Arabic name.',
    },
    {
      name: 'nameEn', type: 'text', required: true, label: { ar: 'الاسم بالإنجليزية', en: 'English name' },
      validate: (value: unknown) => nonEmpty(value) || 'أدخل الاسم بالإنجليزية. / Enter the English name.',
    },
    {
      name: 'section', type: 'text', required: true, index: true, label: { ar: 'القسم', en: 'Section' },
      admin: {
        description: { ar: 'رابط القسم الموجود في «أقسام الموسوعة». لا يمكن تقييره بعد الحفظ.', en: 'The slug of an existing Encyclopedia section. Cannot be changed after saving.' },
        components: { Field: '/components/admin/section-picker#SectionPicker' },
      },
    },
    { name: 'descriptionAr', type: 'textarea', label: { ar: 'الوصف بالعربية', en: 'Arabic description' } },
    { name: 'descriptionEn', type: 'textarea', label: { ar: 'الوصف بالإنجليزية', en: 'English description' } },
  ],
};