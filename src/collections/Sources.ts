import type { CollectionConfig } from 'payload';
import { isAdmin, isStaff, validateURL } from './access';

export const Sources: CollectionConfig = {
  slug: 'sources',
  labels: { singular: { ar: 'مصدر', en: 'Source' }, plural: { ar: 'المصادر', en: 'Sources' } },
  admin: {
    group: { ar: 'المحتوى', en: 'Content' },
    useAsTitle: 'title',
    description: { ar: 'مكتبة بحث خاصة. انشر الاستشهادات ضمن قائمة مصادر المقال، لا بمجرد إضافتها إلى هذه المكتبة.', en: 'Private research library. Publish citations in an article’s sources array, not simply by adding them to this library.' },
  },
  access: { read: isStaff, create: isStaff, update: isStaff, delete: isAdmin },
  fields: [
    { name: 'title', type: 'text', required: true, label: { ar: 'عنوان المصدر', en: 'Source title' } },
    { name: 'url', type: 'text', required: true, validate: validateURL, label: { ar: 'رابط المصدر', en: 'Source URL' } },
    { name: 'publisher', type: 'text', label: { ar: 'الناشر', en: 'Publisher' } },
    { name: 'accessedAt', type: 'date', label: { ar: 'تاريخ الاطلاع', en: 'Access date' } },
    { name: 'notes', type: 'textarea', label: { ar: 'ملاحظات البحث', en: 'Research notes' } },
  ],
};