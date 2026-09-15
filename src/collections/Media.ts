import path from 'node:path';
import sharp from 'sharp';
import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload';
import { canReview, hasRole, isAdmin, isStaff, roles } from './access';

const publicationIntent = new WeakMap<object, boolean>();

const validateOriginalUpload: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args;
  publicationIntent.set(req, 'data' in args && args.data?.published === true);
  if (req.file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(req.file.mimetype)) {
      throw new APIError('Only JPEG, PNG, WebP or AVIF MIME types are accepted.', 400);
    }
    // Decode the ORIGINAL bytes before Payload can re-encode an SVG disguised as JPEG.
    const metadata = await sharp(req.file.data, { limitInputPixels: 40000000 }).metadata();
    const allowed = ['jpeg', 'png', 'webp'].includes(metadata.format ?? '')
      || (metadata.format === 'heif' && metadata.compression === 'av1');
    if (!allowed) {
      throw new APIError('Only genuine JPEG, PNG, WebP or AVIF images are accepted.', 400);
    }
  }
  return args;
};

export const enforceMediaPublication: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!hasRole(req, roles)) throw new APIError('An editorial account is required.', 403);
  if (data.published === true && !canReview(req) && originalDoc?.published !== true) {
    throw new APIError('Only a reviewer or administrator may make an asset public.', 403);
  }
  const changed = req.file || [
    'alt', 'attribution', 'license', 'filename', 'url', 'prefix', 'mimeType', 'filesize', 'width', 'height', 'sizes',
  ].some((key) => key in data && JSON.stringify(data[key]) !== JSON.stringify(originalDoc?.[key]));
  if (originalDoc?.published && changed && !(canReview(req) && publicationIntent.get(req) === true)) data.published = false;
  return data;
};

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: { ar: 'ملف وسائط', en: 'Media asset' }, plural: { ar: 'الوسائط', en: 'Media' } },
  admin: {
    group: { ar: 'المحتوى', en: 'Content' },
    useAsTitle: 'alt',
    description: { ar: 'الوسائط خاصة افتراضيًا. يجب أن يعتمد مراجع أو مسؤول إتاحتها للعامة بشكل منفصل عن اعتماد المقال.', en: 'Media is private by default. A reviewer or administrator must authorize public delivery separately from article approval.' },
  },
  access: {
    read: ({ req }) => hasRole(req, roles) ? true : { published: { equals: true } },
    create: isStaff, update: isStaff, delete: isAdmin,
  },
  upload: {
    staticDir: path.resolve(process.cwd(), 'private-uploads'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    constructorOptions: { limitInputPixels: 40000000 },
    // Re-encode uploads rather than serving arbitrary original bytes or embedded metadata.
    formatOptions: { format: 'webp', options: { quality: 85 } },
    resizeOptions: { width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true },
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store');
      headers.set('X-Content-Type-Options', 'nosniff');
      return headers;
    },
  },
  hooks: { beforeOperation: [validateOriginalUpload], beforeChange: [enforceMediaPublication] },
  fields: [
    { name: 'alt', type: 'text', required: true, label: { ar: 'النص البديل للصورة', en: 'Image alternative text' } },
    { name: 'attribution', type: 'text', required: true, label: { ar: 'نسبة العمل إلى صاحبه', en: 'Attribution' } },
    { name: 'license', type: 'text', required: true, label: { ar: 'الترخيص', en: 'License' } },
    { name: 'published', type: 'checkbox', defaultValue: false, index: true, label: { ar: 'اعتماد الإتاحة العامة', en: 'Public delivery approval' }, admin: { description: { ar: 'اعتماد إتاحة الملف للعامة، مقتصر على المراجعين والمسؤولين.', en: 'Public asset approval, restricted to reviewers and administrators.' } } },
  ],
};