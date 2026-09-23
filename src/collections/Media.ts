import path from 'node:path';
import sharp from 'sharp';
import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeOperationHook, type CollectionConfig } from 'payload';
import { boundPublicReads, canReview, hasRole, isAdmin, isStaff, roles } from './access';

const publicationIntent = new WeakMap<object, boolean>();
const imageEditIntent = new WeakMap<object, boolean>();
const storageFields = ['filename', 'url', 'thumbnailURL', 'prefix', 'mimeType', 'filesize', 'width', 'height', 'sizes'] as const;

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  return value;
}

function sameStorageValue(key: string, left: unknown, right: unknown, origin?: string): boolean {
  if (JSON.stringify(ordered(left)) === JSON.stringify(ordered(right))) return true;
  if ((left == null || left === '') && (right == null || right === '')) return true;
  if ((key === 'url' || key === 'thumbnailURL') && typeof left === 'string' && typeof right === 'string' && origin) {
    try { return new URL(left, origin).href === new URL(right, origin).href; } catch { return false; }
  }
  return false;
}

function validateQueryEdits(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== 'object' || Array.isArray(value)) throw new APIError('Invalid image edits.', 400);
  const edits = value as Record<string, unknown>;
  const number = (input: unknown, maximum: number, minimum = 0) =>
    (typeof input === 'number' || (typeof input === 'string' && /^\d+(?:\.\d+)?$/.test(input)))
      && Number.isFinite(Number(input)) && Number(input) >= minimum && Number(input) <= maximum;
  for (const key of ['crop', 'focalPoint']) {
    const point = edits[key];
    if (point == null) continue;
    if (typeof point !== 'object' || Array.isArray(point) || !('x' in point) || !('y' in point)
      || !number(point.x, 100) || !number(point.y, 100)) throw new APIError('Invalid image coordinates.', 400);
  }
  if (edits.crop != null || edits.widthInPixels != null || edits.heightInPixels != null) {
    if (!number(edits.widthInPixels, 10000, 1) || !number(edits.heightInPixels, 10000, 1)
      || !Number.isInteger(Number(edits.widthInPixels)) || !Number.isInteger(Number(edits.heightInPixels))
      || Number(edits.widthInPixels) * Number(edits.heightInPixels) > 40000000) throw new APIError('Invalid image dimensions.', 400);
  }
  return Object.keys(edits).length > 0;
}

const validateOriginalUpload: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args;
  if (!hasRole(req, roles)) throw new APIError('An editorial account is required.', 403);
  const data = 'data' in args ? args.data : undefined;
  publicationIntent.set(req, data?.published === true);
  imageEditIntent.set(req, false);
  if (data) {
    const suppliedStorage = storageFields.filter(key => data[key] !== undefined);
    const edits = ['crop', 'widthInPixels', 'heightInPixels', 'focalX', 'focalY'].filter(key => data[key] != null);
    const hasQueryEdits = validateQueryEdits(req.query?.uploadEdits);
    for (const key of ['focalX', 'focalY']) {
      if (data[key] != null && (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || data[key] < 0 || data[key] > 100)) throw new APIError('Invalid focal point.', 400);
    }
    if (operation === 'create' && suppliedStorage.some(key => data[key] != null && data[key] !== '')) {
      throw new APIError('Upload file bytes; storage metadata is managed by the server.', 400);
    }
    if (operation === 'update' && (suppliedStorage.length || edits.length || hasQueryEdits)) {
      if (!('id' in args) || (typeof args.id !== 'string' && typeof args.id !== 'number')) throw new APIError('File operations require a single media ID.', 400);
      const original = await req.payload.findByID({ collection: 'media', id: args.id, depth: 0, overrideAccess: false, user: req.user, req });
      for (const key of suppliedStorage) {
        if (!sameStorageValue(key, data[key], original[key], req.payload.config?.serverURL)) {
          throw new APIError('Storage metadata cannot be changed directly.', 400);
        }
      }
      if (req.payload.config?.serverURL && typeof original.url === 'string') {
        const base = new URL(req.payload.config.serverURL);
        const fileURL = new URL(original.url, base);
        if (fileURL.origin !== base.origin || !fileURL.pathname.startsWith('/api/media/file/')) {
          throw new APIError('Stored media must use the protected media endpoint.', 400);
        }
      }
      if (hasQueryEdits || edits.some(key => !sameStorageValue(key, data[key], original[key]))) {
        imageEditIntent.set(req, true);
        data.filename = original.filename;
        data.url = original.url;
        if (original.prefix !== undefined) data.prefix = original.prefix;
      }
    }
  }
  if (req.file) {
    if (!Buffer.isBuffer(req.file.data) || req.file.data.byteLength > 10 * 1024 * 1024) {
      throw new APIError('Image upload exceeds the allowed size.', 413);
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(req.file.mimetype)) {
      throw new APIError('Only JPEG, PNG, WebP or AVIF MIME types are accepted.', 400);
    }
    // Decode the ORIGINAL bytes before Payload can re-encode an SVG disguised as JPEG.
    try {
      const metadata = await sharp(req.file.data, { limitInputPixels: 40000000 }).metadata();
      const allowed = ['jpeg', 'png', 'webp'].includes(metadata.format ?? '')
        || (metadata.format === 'heif' && metadata.compression === 'av1');
      if (!allowed || (metadata.pages ?? 1) > 1) {
        throw new APIError('Only genuine, single-frame JPEG, PNG, WebP or AVIF images are accepted.', 400);
      }
      await sharp(req.file.data, { limitInputPixels: 40000000 }).stats();
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw new APIError('The image is invalid or exceeds decoding limits.', 400);
    }
  }
  return args;
};

export const enforceMediaPublication: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!hasRole(req, roles)) throw new APIError('An editorial account is required.', 403);
  if (data.published === true && !canReview(req) && originalDoc?.published !== true) {
    throw new APIError('Only a reviewer or administrator may make an asset public.', 403);
  }
  const changed = req.file || imageEditIntent.get(req) || [
    'alt', 'attribution', 'license', 'filename', 'url', 'prefix', 'mimeType', 'filesize', 'width', 'height', 'sizes', 'focalX', 'focalY',
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
    pasteURL: false,
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
  hooks: { beforeOperation: [validateOriginalUpload, boundPublicReads], beforeChange: [enforceMediaPublication] },
  fields: [
    { name: 'alt', type: 'text', required: true, label: { ar: 'النص البديل للصورة', en: 'Image alternative text' } },
    { name: 'attribution', type: 'text', required: true, label: { ar: 'نسبة العمل إلى صاحبه', en: 'Attribution' } },
    { name: 'license', type: 'text', required: true, label: { ar: 'الترخيص', en: 'License' } },
    { name: 'published', type: 'checkbox', defaultValue: false, index: true, label: { ar: 'اعتماد الإتاحة العامة', en: 'Public delivery approval' }, admin: { description: { ar: 'اعتماد إتاحة الملف للعامة، مقتصر على المراجعين والمسؤولين.', en: 'Public asset approval, restricted to reviewers and administrators.' } } },
  ],
};